import { useEffect, useState, type FormEvent } from 'react';
import { IconBook, IconCheck, IconDatabase, IconFileSpreadsheet, IconRefresh, IconShieldLock, IconUsers } from '@tabler/icons-react';
import { ApiError, adminApiBase, apiRequest, clearSession, previewMode, saveSession, type ApiSession, type ApiUser } from '../services/api';
import './AdminPage.css';

interface AdminStatus {
  adminInitialized: boolean;
  database: { status: string; currentMigration: number; latestMigration: number };
}
interface AdminUser extends ApiUser {}
interface ImportSummary {
  id: string;
  status: string;
  sourceFilename: string;
  fingerprint: string;
  workbookSheets: string[];
  selectedSheet: string;
  questionCount: number;
  typeCounts: Record<string, number>;
  missingAnswers: Array<{ row: number | null; field: string; message: string }>;
  errors: Array<{ row: number | null; field: string; message: string }>;
  duplicateStems: Array<{ stem: string; rows: number[]; types: string[] }>;
  alreadyExists: boolean;
  existingVersion: number | null;
  canConfirm: boolean;
}
interface ExamRules {
  singleCount: number; singlePoints: number; multipleCount: number; multiplePoints: number;
  judgementCount: number; judgementPoints: number; durationMinutes: number; passingScore: number;
}
interface Bank { id: string; bankKey: string; name: string; enabled: boolean; activeVersion: null | { versionNumber: number; questionCount: number; typeCounts: Record<string, number> }; examRules: ExamRules | null }
interface ImportJob { id: string; sourceFilename: string; status: string; selectedSheet: string; questionCount: number; typeCounts: Record<string, number>; createdAt: string }

const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败，请检查服务状态。';
const defaultRules: ExamRules = { singleCount: 120, singlePoints: 0.5, multipleCount: 20, multiplePoints: 1, judgementCount: 40, judgementPoints: 0.5, durationMinutes: 90, passingScore: 60 };

export default function AdminPage() {
  const preview = previewMode();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [admin, setAdmin] = useState<ApiUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [resetDrafts, setResetDrafts] = useState<Record<string, string>>({});
  const [bankKey, setBankKey] = useState('level4');
  const [bankName, setBankName] = useState('四级理论题库');
  const [sheetName, setSheetName] = useState('客观题');
  const [file, setFile] = useState<File | null>(null);
  const [rules, setRules] = useState(defaultRules);
  const [previewResult, setPreviewResult] = useState<ImportSummary | null>(null);

  const base = adminApiBase();
  const loadAdminData = async () => {
    const [userResult, bankResult, importResult] = await Promise.all([
      apiRequest<{ items: AdminUser[] }>('/api/admin/users', { base }),
      apiRequest<{ items: Bank[] }>('/api/admin/banks', { base }),
      apiRequest<{ items: ImportJob[] }>('/api/admin/imports', { base }),
    ]);
    setUsers(userResult.items);
    setBanks(bankResult.items);
    setImports(importResult.items);
  };

  const refresh = async () => {
    setError('');
    try {
      const info = await apiRequest<AdminStatus>('/api/admin/status', { base, auth: false });
      setStatus(info);
      if (!info.adminInitialized) { setAdmin(null); return; }
      const current = await apiRequest<ApiUser>('/api/auth/me', { base });
      if (current.role !== 'admin') { clearSession(); setAdmin(null); setError('当前账号不是管理员，请使用本机管理员账号登录。'); return; }
      setAdmin(current);
      await loadAdminData();
    } catch (requestError) {
      setAdmin(null);
      setError(errorText(requestError));
    }
  };

  useEffect(() => { if (!preview) void refresh(); }, [preview]);

  const authenticate = async (event: FormEvent, bootstrap: boolean) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const session = await apiRequest<ApiSession>(bootstrap ? '/api/admin/bootstrap' : '/api/auth/login', {
        base, method: 'POST', auth: false, body: { username, password, remember: true },
      });
      if (session.user.role !== 'admin') { clearSession(); throw new ApiError('此账号不是管理员。', 'ADMIN_REQUIRED', 403); }
      await saveSession(session, true); setAdmin(session.user); setPassword(''); setMessage(bootstrap ? '本机管理员初始化完成。' : '管理员登录成功。');
      await loadAdminData();
    } catch (authError) { setError(errorText(authError)); }
    finally { setBusy(false); }
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest('/api/admin/users', { base, method: 'POST', body: { username: newUsername, password: newPassword, isTestAccount } });
      setNewUsername(''); setNewPassword(''); setIsTestAccount(false); setMessage('普通用户账号已创建，首次登录需要修改密码。'); await loadAdminData();
    } catch (actionError) { setError(errorText(actionError)); }
    finally { setBusy(false); }
  };

  const toggleUser = async (user: AdminUser) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest(`/api/admin/users/${user.id}`, { base, method: 'PATCH', body: { disabled: !user.disabled } });
      setMessage(user.disabled ? '账号已启用。' : '账号已停用，现有会话已撤销。'); await loadAdminData();
    } catch (actionError) { setError(errorText(actionError)); }
    finally { setBusy(false); }
  };

  const resetPassword = async (user: AdminUser) => {
    const newValue = resetDrafts[user.id] ?? '';
    setError('');
    try {
      await apiRequest(`/api/admin/users/${user.id}/reset-password`, { base, method: 'POST', body: { newPassword: newValue } });
      setResetDrafts(current => ({ ...current, [user.id]: '' })); setMessage(`${user.username} 的密码已重置；下次登录需要修改，现有会话已撤销。`);
    } catch (actionError) { setError(errorText(actionError)); }
  };

  const previewImport = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); setPreviewResult(null);
    if (!file) { setError('请选择 .xlsx 文件。'); setBusy(false); return; }
    const form = new FormData();
    form.set('file', file); form.set('bankKey', bankKey); form.set('bankName', bankName); form.set('sheetName', sheetName);
    try {
      const result = await apiRequest<ImportSummary>('/api/admin/imports/preview', { base, method: 'POST', body: form });
      setPreviewResult(result);
      if (result.workbookSheets.length && !result.workbookSheets.includes(sheetName)) setSheetName(result.workbookSheets[0]!);
      setMessage(result.canConfirm ? '预览完成，请核对题量和错误后再确认导入。' : '预览发现阻塞项，请修正后重新选择文件。');
    } catch (importError) { setError(errorText(importError)); }
    finally { setBusy(false); }
  };

  const confirmImport = async () => {
    if (!previewResult?.canConfirm) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await apiRequest<{ duplicate: boolean; questionCount?: number; versionNumber?: number }>('/api/admin/imports/' + previewResult.id + '/confirm', { base, method: 'POST', body: rules });
      if (result.duplicate) setMessage(`该文件已导入为第 ${result.versionNumber} 版，未重复写入。`);
      else setMessage(`导入完成：${result.questionCount} 道题，版本 ${result.versionNumber}。`);
      setPreviewResult(null); setFile(null); await loadAdminData();
    } catch (confirmError) { setError(errorText(confirmError)); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await apiRequest('/api/auth/logout', { base, method: 'POST', body: {} }); }
    catch { /* The local bearer is removed below; a server-side revocation requires a reachable server. */ }
    clearSession(); setAdmin(null); setUsers([]); setBanks([]); setImports([]);
  };

  if (preview) return <main className="admin-shell"><section className="admin-empty"><IconShieldLock size={32} /><h1>本机管理</h1><p>开发预览与正式管理服务隔离，未发起 API 请求。</p></section></main>;

  return <main className="admin-shell">
    <header className="admin-header"><div><span className="admin-brand"><IconBook size={22} /></span><div><strong>理论考试 · 本机管理</strong><small>服务端管理入口，仅限本机访问</small></div></div><button className="admin-refresh" onClick={() => void refresh()} aria-label="刷新状态"><IconRefresh size={18} /></button></header>
    <div className="admin-content">
      <section className={`admin-status${status ? ' is-online' : ' is-offline'}`}><IconDatabase size={21} /><div><strong>{status ? '服务运行正常' : '无法连接本机服务'}</strong><span>{status ? `SQLite 已就绪 · 迁移 ${status.database.currentMigration}/${status.database.latestMigration}` : '确认 Fastify 服务正在运行，然后重试。'}</span></div><span className="admin-health-dot" /></section>
      {error && <div className="admin-alert is-error" role="alert">{error}</div>}{message && <div className="admin-alert is-success" role="status">{message}</div>}
      {status && !status.adminInitialized && <section className="admin-card admin-auth-card"><IconShieldLock size={26} /><div><h1>初始化本机管理员</h1><p>仅在本机可用且只能初始化一次。密码至少 12 个字符。</p></div><form onSubmit={event => void authenticate(event, true)}><label>管理员用户名<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required maxLength={64} /></label><label>设置密码<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required minLength={12} /></label><button className="admin-primary" disabled={busy}>{busy ? '处理中…' : '初始化管理员'}</button></form></section>}
      {status?.adminInitialized && !admin && <section className="admin-card admin-auth-card"><IconShieldLock size={26} /><div><h1>管理员登录</h1><p>请输入本机维护者账号。普通用户无权进入管理界面。</p></div><form onSubmit={event => void authenticate(event, false)}><label>管理员用户名<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required /></label><label>密码<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="admin-primary" disabled={busy}>{busy ? '正在登录…' : '管理员登录'}</button></form></section>}
      {admin && <>
        <div className="admin-welcome"><div><strong>你好，{admin.username}</strong><span>管理员会话已认证</span></div><button onClick={() => void logout()}>退出管理</button></div>
        <section className="admin-card"><div className="admin-section-title"><IconUsers size={21} /><div><h2>用户管理</h2><p>账号由本机管理员创建；停用账号会立即撤销会话。</p></div></div>
          <form className="admin-create-user" onSubmit={event => void createUser(event)}><label>用户名<input value={newUsername} onChange={event => setNewUsername(event.target.value)} required maxLength={64} /></label><label>初始密码（至少 12 位）<input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={12} /></label><label className="admin-test-flag"><span><input type="checkbox" checked={isTestAccount} onChange={event => setIsTestAccount(event.target.checked)} />专用测试账号</span></label><button className="admin-primary" disabled={busy}>创建普通账号</button></form>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>用户名</th><th>状态</th><th>账号操作</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.username}</strong><small>{user.role === 'admin' ? '管理员' : user.isTestAccount ? '普通用户 · 专用测试账号' : '普通用户'}{user.mustChangePassword ? ' · 首登待改密' : ''}</small></td><td><span className={`admin-user-status${user.disabled ? ' is-disabled' : ''}`}>{user.disabled ? '已停用' : '已启用'}</span></td><td>{user.role === 'user' ? <div className="admin-user-actions"><button onClick={() => void toggleUser(user)} disabled={busy}>{user.disabled ? '启用' : '停用'}</button><input type="password" autoComplete="new-password" aria-label={`${user.username} 的新密码`} placeholder="输入重置密码" minLength={12} value={resetDrafts[user.id] ?? ''} onChange={event => setResetDrafts(current => ({ ...current, [user.id]: event.target.value }))} /><button onClick={() => void resetPassword(user)}>重置密码</button></div> : <small>由本机初始化</small>}</td></tr>)}</tbody></table></div>
        </section>
        <section className="admin-card"><div className="admin-section-title"><IconBook size={21} /><div><h2>题库列表</h2><p>各题库独立版本和考试规则。</p></div></div>{banks.length ? <div className="admin-bank-grid">{banks.map(bank => <article key={bank.id}><div><strong>{bank.name}</strong><span>{bank.enabled ? '启用' : '停用'}</span></div><small>{bank.bankKey} · {bank.activeVersion ? `版本 ${bank.activeVersion.versionNumber} · ${bank.activeVersion.questionCount} 题` : '暂无版本'}</small>{bank.activeVersion && <small>单选 {bank.activeVersion.typeCounts.single ?? 0} · 多选 {bank.activeVersion.typeCounts.multiple ?? 0} · 判断 {bank.activeVersion.typeCounts.judgement ?? 0}</small>}{bank.examRules && <small>规则：{bank.examRules.singleCount}/{bank.examRules.multipleCount}/{bank.examRules.judgementCount} 题 · {bank.examRules.durationMinutes} 分钟 · 满分 {bank.examRules.singleCount * bank.examRules.singlePoints + bank.examRules.multipleCount * bank.examRules.multiplePoints + bank.examRules.judgementCount * bank.examRules.judgementPoints}</small>}</article>)}</div> : <p className="admin-empty-inline">尚无题库。上传并确认题库后会显示在这里。</p>}</section>
        <section className="admin-card"><div className="admin-section-title"><IconFileSpreadsheet size={21} /><div><h2>Excel 题库导入</h2><p>先预览校验，再由管理员明确确认写入；默认整批阻止错误行。</p></div></div>
          <form className="admin-import-form" onSubmit={event => void previewImport(event)}><div className="admin-form-grid"><label>题库标识<input value={bankKey} onChange={event => setBankKey(event.target.value)} required /></label><label>题库名称<input value={bankName} onChange={event => setBankName(event.target.value)} required maxLength={100} /></label><label>工作表<select value={sheetName} onChange={event => setSheetName(event.target.value)}>{[...new Set([sheetName, ...(previewResult?.workbookSheets ?? [])])].filter(Boolean).map(name => <option key={name} value={name}>{name}</option>)}</select></label><label className="admin-file-label">题库文件<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => setFile(event.target.files?.[0] ?? null)} required /></label></div>
            <details className="admin-rule-settings"><summary>题库考试规则（可按题库调整）</summary><div className="admin-rule-grid">{(Object.keys(defaultRules) as Array<keyof ExamRules>).map(key => <label key={key}>{({ singleCount: '单选题数', singlePoints: '单选每题分值', multipleCount: '多选题数', multiplePoints: '多选每题分值', judgementCount: '判断题数', judgementPoints: '判断每题分值', durationMinutes: '考试时长（分钟）', passingScore: '及格线' } as Record<keyof ExamRules, string>)[key]}<input type="number" min="0" step={key.endsWith('Points') || key === 'passingScore' ? '0.5' : '1'} value={rules[key]} onChange={event => setRules(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div></details>
            <button className="admin-primary" disabled={busy}>{busy ? '正在解析…' : '解析并预览'}</button>
          </form>
          {previewResult && <div className="admin-import-preview"><div className="admin-preview-heading"><div><strong>导入预览</strong><small>{previewResult.sourceFilename} · 工作表 {previewResult.selectedSheet || '待选择'}</small></div><code>SHA-256 {previewResult.fingerprint.slice(0, 16)}…</code></div><div className="admin-count-grid"><div><strong>{previewResult.questionCount}</strong><small>检测题目</small></div><div><strong>{previewResult.typeCounts.single ?? 0}</strong><small>单选</small></div><div><strong>{previewResult.typeCounts.multiple ?? 0}</strong><small>多选</small></div><div><strong>{previewResult.typeCounts.judgement ?? 0}</strong><small>判断</small></div><div><strong>{previewResult.missingAnswers.length}</strong><small>缺少答案</small></div></div>{previewResult.alreadyExists && <p className="admin-alert is-warning">相同文件已作为版本 {previewResult.existingVersion} 导入，本次不会重复写入。</p>}{previewResult.errors.length > 0 && <div className="admin-import-errors"><strong>格式错误（{previewResult.errors.length}）</strong><ul>{previewResult.errors.slice(0, 30).map((item, index) => <li key={`${item.row}-${item.field}-${index}`}>{item.row ? `第 ${item.row} 行 · ` : ''}{item.field}：{item.message}</li>)}</ul>{previewResult.errors.length > 30 && <small>其余错误请使用导入任务详情接口查看。</small>}</div>}{previewResult.duplicateStems.length > 0 && <div className="admin-duplicates"><strong>重复题干提示（保留，不自动合并）</strong><ul>{previewResult.duplicateStems.slice(0, 20).map((item, index) => <li key={`${item.rows.join('-')}-${index}`}>第 {item.rows.join('、')} 行：{item.stem}</li>)}</ul></div>}<button className="admin-confirm" onClick={() => void confirmImport()} disabled={busy || !previewResult.canConfirm}><IconCheck size={18} />{busy ? '正在导入…' : '确认并事务性导入'}</button></div>}
        </section>
        <section className="admin-card"><div className="admin-section-title"><IconFileSpreadsheet size={21} /><div><h2>导入记录</h2><p>最近 30 条预览与确认结果。</p></div></div>{imports.length ? <div className="admin-import-list">{imports.map(item => <div key={item.id}><strong>{item.sourceFilename}</strong><span>{item.status}</span><small>{item.selectedSheet} · {item.questionCount} 行 · {item.createdAt}</small></div>)}</div> : <p className="admin-empty-inline">暂无导入记录。</p>}</section>
      </>}
    </div>
  </main>;
}
