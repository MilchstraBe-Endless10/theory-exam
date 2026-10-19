import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import {
  IconArrowLeft, IconBell, IconBook, IconChartBar, IconCheck,
  IconChevronRight, IconCircleCheck, IconClockHour4, IconDots, IconFileText,
  IconGridDots, IconEye, IconEyeOff, IconInfoCircle, IconLink, IconLock,
  IconLogout, IconPencil, IconQrcode, IconRefresh, IconShieldCheck,
  IconStar, IconTrophy, IconUser, IconUserFilled, IconWifi, IconX,
} from '@tabler/icons-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBanks } from '../services/banks';
import { ApiError, apiRequest, clearSession, persistentSession, previewMode, savedServerAddress, saveServerAddress, saveSession, usesSameOriginWebApi, type ApiSession } from '../services/api';
import {
  createPracticeSession, exitPracticeSession, getActivePracticeSession, getFavorites, getPracticeQuestion,
  getPracticeResult, getPracticeSession, movePracticePosition, resumePracticeSession, setQuestionFavorite,
  submitPracticeAnswer, type PracticeMode, type PracticeProgress,
} from '../services/practice';
import { useMistakeStats } from '../services/reviews';
import { checkForUpdate, downloadAndOpenUpdate, type CheckedUpdate } from '../services/updates';

const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';
const href = (path: string) => preview ? `${path}${path.includes('?') ? '&' : '?'}preview=1` : path;

export function PreviewBadge() {
  return preview ? <span className="preview-badge">开发预览 · 测试数据</span> : null;
}

function StatusBar() {
  return <div className="mobile-statusbar" aria-hidden="true"><span>9:41</span><span className="status-icons"><IconWifi size={15} /><span className="signal-bars"><i /><i /><i /><i /></span><span className="battery"><i /></span></span></div>;
}

function Screen({ children, immersive = false, className = '', dataQuestionId }: { children: ReactNode; immersive?: boolean; className?: string; dataQuestionId?: string }) {
  return <main className={`mobile-screen${immersive ? ' is-immersive' : ''} ${className}`} data-question-id={dataQuestionId}><StatusBar />{children}</main>;
}

function Header({ title, back = '/', right }: { title?: string; back?: string; right?: ReactNode }) {
  return <header className="mobile-page-header"><Link className="back-button" to={href(back)} aria-label="返回"><IconArrowLeft size={22} /></Link>{title ? <h1>{title}</h1> : <span />}{right ?? <span className="header-placeholder" />}</header>;
}

function Toast({ message }: { message: string }) {
  return message ? <div className="mobile-toast" role="status">{message}</div> : null;
}

function useNotice() {
  const [message, setMessage] = useState('');
  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 3200);
  };
  return { message, notify };
}

function MobileButton({ children, to, onClick, secondary = false, disabled = false, type = 'button' }: {
  children: ReactNode; to?: string; onClick?: () => void; secondary?: boolean; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const className = `mobile-button${secondary ? ' is-secondary' : ''}`;
  return to ? <Link className={className} to={to}>{children}</Link> : <button className={className} type={type} onClick={onClick} disabled={disabled}>{children}</button>;
}

function MobileHomePage({ progress, progressLoading, progressError }: { progress: PracticeProgress | null; progressLoading: boolean; progressError: string }) {
  const notice = useNotice();
  const { user } = useAuth();
  const { activeBank: bank, loading, error } = useBanks();
  const { stats: mistakeStats } = useMistakeStats(bank?.id, user?.id);
  const touched = preview ? '426' : progress ? String(progress.touchedCount) : progressLoading ? '…' : '—';
  const accuracy = preview ? '82.6%' : progress?.accuracyRate == null ? '—' : `${progress.accuracyRate}%`;
  const mistakes = preview ? '38' : mistakeStats ? String(mistakeStats.review + mistakeStats.reinforcing) : progressLoading ? '…' : '—';
  const quick = [
    { title: '日常练习', icon: IconPencil, to: '/practice', tone: 'green' },
    { title: '模拟考试', icon: IconFileText, to: '/exams', tone: 'blue' },
    { title: '错题复习', icon: IconFileText, to: '/mistakes', tone: 'red' },
    { title: '我的收藏', icon: IconStar, to: '/me', tone: 'amber' },
    { title: '考试记录', icon: IconClipboardIcon, to: '/records', tone: 'blue' },
    { title: '题库切换', icon: IconRefresh, to: '/me', tone: 'green' },
  ];
  return <Screen className="home-screen">
    <header className="home-brand"><span className="home-brand-mark"><IconBook size={20} /></span><strong>理论考试</strong><button aria-label="通知" onClick={() => notice.notify('当前没有新通知')}><IconBell size={20} /></button></header>
    <div className="home-greeting"><h1>{preview ? '你好，学习用户' : user ? `你好，${user.username}` : '你好，欢迎学习'}</h1><p>{preview ? '从今天的进步开始。' : bank ? `${bank.name} · 学习记录由本地服务端保存` : error || (loading ? '正在读取已启用题库…' : user ? '本机服务端暂无已启用题库' : '连接并登录本地服务后读取题库')}</p></div>
    <PreviewBadge />
    <section className="mobile-stat-grid" aria-label="学习概况">
      <article className="mobile-stat-card tone-green"><IconChartBar size={19} /><strong>{touched}</strong><span>已接触题目</span></article>
      <article className="mobile-stat-card tone-blue"><IconChartBar size={19} /><strong>{accuracy}</strong><span>练习正确率</span></article>
      <article className="mobile-stat-card tone-red"><IconFileText size={19} /><strong>{mistakes}</strong><span>待复习</span></article>
    </section>
    <section className="mobile-continue-card">
      <div className="mobile-card-heading"><span className="mobile-icon-box tone-blue"><IconBook size={22} /></span><div><strong>继续练习</strong><small>{preview ? '顺序练习 · 按题库顺序逐题练习' : bank ? `${bank.name} · ${bank.activeVersion?.questionCount ?? 0} 道题` : '连接服务端并导入题库后开始'}</small></div></div>
      <div className="mobile-progress-label"><span>{preview ? '题库探索 426 / 1283 题' : progress ? `题库探索 ${progress.touchedCount} / ${progress.questionCount} 题` : progressLoading ? '正在读取学习进度…' : progressError || '尚无正式练习记录'}</span><span>{preview ? '33.2%' : progress?.explorationRate == null ? '—' : `${progress.explorationRate}%`}</span></div>
      <div className="mobile-progress-track"><span style={{ width: `${preview ? 33.2 : progress?.explorationRate ?? 0}%` }} /></div>
      <MobileButton to={href('/practice')}>继续刷题 <IconChevronRight size={18} /></MobileButton>
    </section>
    <section className="mobile-learning-details" aria-label="学习数据详情">
      <div><small>当前题库题量</small><strong>{progress ? progress.questionCount : preview ? '1283' : '—'}</strong></div>
      <div><small>未作答题目</small><strong>{progress ? progress.unansweredCount : preview ? '857' : '—'}</strong></div>
      <div><small>历史正式提交</small><strong>{progress ? progress.submissionCount : '—'}</strong></div>
      <div><small>已收藏</small><strong>{progress ? progress.favoriteCount : preview ? '12' : '—'}</strong></div>
    </section>
    <section className="mobile-type-accuracy"><h2>题型正确率</h2>{(['single', 'multiple', 'judgement'] as const).map((type, index) => {
      const labels = ['单选题', '多选题', '判断题'];
      const value = progress?.byType[type].accuracyRate;
      return <div key={type}><span>{labels[index]}</span><strong>{value == null ? '—' : `${value}%`}</strong></div>;
    })}</section>
    <section className="mobile-recent-practice"><h2>最近练习</h2>{progress?.recentSessions.length ? progress.recentSessions.slice(0, 3).map(session => <div key={session.id}><span>{new Date(session.updatedAt).toLocaleDateString('zh-CN')} · {session.submittedCount}/{session.questionCount} 题</span><strong>{session.attempts ? `${Math.round(session.correctCount / session.attempts * 1000) / 10}%` : '—'}</strong></div>) : <p>{preview ? '开发预览 · 无正式学习记录' : progressLoading ? '正在读取…' : progressError || '暂无练习记录'}</p>}</section>
    <section className="mobile-quick-section"><div className="mobile-quick-grid">
      {quick.map(({ title, icon: Icon, to, tone }) => <Link className="mobile-quick-link" key={title} to={href(to)}><span className={`quick-icon tone-${tone}`}><Icon size={20} /></span><span>{title}</span></Link>)}
    </div></section>
    <Toast message={notice.message} />
  </Screen>;
}

export function MobileDashboard({ progress, progressLoading, progressError }: { progress: PracticeProgress | null; progressLoading: boolean; progressError: string }) {
  return <div className="mobile-route"><MobileHomePage progress={progress} progressLoading={progressLoading} progressError={progressError} /></div>;
}

export function StartPage() {
  return <Screen className="start-screen" immersive>
    <div className="start-hero"><span className="start-logo"><IconBook size={50} /></span><h1>理论考试</h1><span className="start-subtitle">LEARNING STUDIO</span></div>
    <div className="start-copy"><strong>四级理论题库</strong><span>帮助你更高效地备考</span></div>
    <div className="start-footer"><MobileButton to={href('/connect')}>开始使用 <IconChevronRight size={18} /></MobileButton></div>
  </Screen>;
}

function allowedServerAddress(value: string) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return false;
    const loopbackHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname);
    return url.protocol === 'https:' || (import.meta.env.DEV && loopbackHost);
  } catch { return false; }
}

function addressFromServerQr(raw: string): string | null {
  let candidate = raw.trim();
  try {
    const payload = JSON.parse(candidate) as { serverAddress?: unknown; serverUrl?: unknown };
    candidate = typeof payload.serverAddress === 'string' ? payload.serverAddress : typeof payload.serverUrl === 'string' ? payload.serverUrl : candidate;
  } catch { /* Plain URL QR codes are supported too. */ }
  return allowedServerAddress(candidate) ? new URL(candidate).toString().replace(/\/+$/, '') : null;
}

export function ConnectPage() {
  const [address, setAddress] = useState(savedServerAddress());
  const [error, setError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const notice = useNotice();
  const { refreshServer } = useAuth();
  useEffect(() => {
    const restoreScan = (event: Event) => {
      const detail = (event as CustomEvent<{ pluginId?: string; methodName?: string; success?: boolean; data?: { barcodes?: Array<{ rawValue?: string }> } }>).detail;
      if (detail?.pluginId !== 'BarcodeScanner' || detail.methodName !== 'scan' || !detail.success) return;
      const address = addressFromServerQr(detail.data?.barcodes?.[0]?.rawValue ?? '');
      if (!address) { setError('恢复的二维码内容无效，请重新扫码或手动输入服务器地址。'); return; }
      setAddress(address); setManualOpen(true); notice.notify('已恢复扫码地址，请验证连接。');
    };
    window.addEventListener('theory-exam:app-restored-result', restoreScan);
    return () => window.removeEventListener('theory-exam:app-restored-result', restoreScan);
  }, []);
  const scanServerQr = async () => {
    setError('');
    if (!Capacitor.isNativePlatform()) { notice.notify('二维码扫描仅在 Android APP 中可用。'); return; }
    try {
      const permission = await BarcodeScanner.checkPermissions();
      const granted = permission.camera === 'granted' || (await BarcodeScanner.requestPermissions()).camera === 'granted';
      if (!granted) { setError('相机权限未授予。请在系统设置允许相机后重试，或手动输入服务器地址。'); return; }
      const scanner = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!scanner.available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        notice.notify('Android 正在准备扫码组件，请稍后重试。');
        return;
      }
      const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      const raw = result.barcodes[0]?.rawValue?.trim();
      if (!raw) { notice.notify('没有读取到二维码内容。'); return; }
      const address = addressFromServerQr(raw);
      if (!address) { setError('二维码中的服务器地址无效。正式 APP 连接必须使用可信 HTTPS。'); return; }
      setAddress(address);
      setManualOpen(true);
      notice.notify('已读取地址，请验证连接。');
    } catch (scanError) {
      setError(scanError instanceof Error ? `扫码失败：${scanError.message}` : '扫码失败，请手动输入服务器地址。');
    }
  };
  const connect = async () => {
    setError('');
    if (!allowedServerAddress(address)) {
      setError('请输入有效服务器地址。正式 APP 与公网连接必须使用可信 HTTPS；HTTP 仅限浏览器开发环境中的本机回环地址。');
      return;
    }
    if (previewMode()) { notice.notify('开发预览与正式服务端隔离，未发起连接请求。'); return; }
    setConnecting(true);
    try {
      const normalized = new URL(address.trim()).toString().replace(/\/+$/, '');
      if (usesSameOriginWebApi() && normalized !== window.location.origin) throw new ApiError('网页端使用当前站点的同源学习服务，不能切换到其他服务器地址。', 'SAME_ORIGIN_REQUIRED');
      const health = await apiRequest<{ status: string; database: { status: string } }>('/api/health', { base: normalized, auth: false, timeoutMs: 5000 });
      if (health.status !== 'ok' || health.database?.status !== 'ok') throw new ApiError('服务器健康检查未通过。', 'HEALTH_CHECK_FAILED');
      saveServerAddress(normalized);
      await refreshServer();
      notice.notify('服务器连接成功，可以登录。');
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : '服务器连接失败。');
    } finally { setConnecting(false); }
  };
  return <Screen className="connect-screen" immersive>
    <Header back="/start" />
    <div className="auth-title"><h1>连接服务器</h1><p>请选择连接方式，连接你的学习服务器</p></div>
    <button className="connect-option" onClick={() => void scanServerQr()}><span className="connect-option-icon tone-blue"><IconQrcode size={28} /></span><span><strong>扫码连接</strong><small>扫描电脑端二维码<br />快速连接服务器</small></span><IconChevronRight className="option-arrow" size={18} /></button>
    <button className="connect-option" aria-expanded={manualOpen} onClick={() => setManualOpen(value => !value)}><span className="connect-option-icon tone-blue"><IconLink size={26} /></span><span><strong>手动连接</strong><small>输入服务器地址<br />进行连接</small></span><IconChevronRight className="option-arrow" size={18} /></button>
    {manualOpen && <section className="connect-manual"><label htmlFor="server-address">服务器地址</label><input id="server-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="https://example.com" inputMode="url" autoCapitalize="none" />{error && <p className="form-error" role="alert">{error}</p>}<MobileButton onClick={connect} disabled={connecting}>{connecting ? '正在检查…' : '验证并连接'}</MobileButton></section>}
    <Link className="auth-footnote" to={href('/login')}>连接后即可登录你的账号</Link>
    <Toast message={notice.message} />
  </Screen>;
}

export function LoginPage() {
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const notice = useNotice();
  const navigate = useNavigate();
  const { serverAddress, setUser } = useAuth();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (previewMode()) { notice.notify('开发预览不会登录真实账号。'); return; }
    if (!serverAddress) { setError('请先连接服务器，再使用管理员创建的账号登录。'); return; }
    setSubmitting(true);
    try {
      const session = await apiRequest<ApiSession>('/api/auth/login', { base: serverAddress, method: 'POST', auth: false, body: { username, password, remember } });
      await saveSession(session, remember);
      setUser(session.user);
      setPassword('');
      navigate('/', { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败，请检查服务器连接。');
    } finally { setSubmitting(false); }
  };
  return <Screen className="login-screen" immersive>
    <Header back="/connect" />
    <div className="login-content"><h1>欢迎回来</h1><p>登录你的账号，继续学习</p><form onSubmit={submit}>
      <label className="input-wrap"><IconUser size={19} /><input aria-label="用户名" placeholder="用户名" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label>
      <label className="input-wrap"><IconLock size={19} /><input aria-label="密码" placeholder="密码" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <IconEyeOff size={19} /> : <IconEye size={19} />}</button></label>
      <label className="remember-row"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />记住我</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <MobileButton type="submit" disabled={submitting}>{submitting ? '正在登录…' : '登录'}</MobileButton>
    </form><small className="auth-footnote">仅支持管理员创建的账号登录</small></div>
    <Toast message={notice.message} />
  </Screen>;
}

const practiceChoices: Array<{ title: string; desc: string; icon: typeof IconBook; tone: string; mode: PracticeMode }> = [
  { title: '顺序练习', desc: '按照题库顺序逐题练习', icon: IconGridDots, tone: 'blue', mode: 'sequential' },
  { title: '随机练习', desc: '随机抽题，本轮题目不重复', icon: IconTrophy, tone: 'amber', mode: 'random' },
  { title: '单选题练习', desc: '只练习单选题', icon: IconFileText, tone: 'blue', mode: 'single' },
  { title: '多选题练习', desc: '只练习多选题', icon: IconFileText, tone: 'purple', mode: 'multiple' },
  { title: '判断题练习', desc: '只练习判断题', icon: IconCircleCheck, tone: 'green', mode: 'judgement' },
  { title: '未做题目', desc: '筛选当前题库中从未提交的题目', icon: IconBook, tone: 'blue', mode: 'unanswered' },
  { title: '错题专项练习', desc: '练习待复习状态的错题', icon: IconRefresh, tone: 'red', mode: 'mistakes' },
  { title: '收藏题目', desc: '练习当前题库版本中已收藏的题目', icon: IconStar, tone: 'amber', mode: 'favorites' },
];

export function PracticeSelectionPage() {
  const notice = useNotice();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { activeBank: bank, loading, error } = useBanks();
  const [activeSession, setActiveSession] = useState<{ id: string; mode: PracticeMode; currentPosition: number; questionCount: number; status: string } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [starting, setStarting] = useState<PracticeMode | null>(null);
  const [startError, setStartError] = useState('');
  const [quantity, setQuantity] = useState('20');
  useEffect(() => {
    if (preview || !user || !bank) { setActiveSession(null); return; }
    let mounted = true;
    setSessionLoading(true);
    getActivePracticeSession(bank.id).then(result => { if (mounted) setActiveSession(result.session); })
      .catch(reason => { if (mounted) setStartError(reason instanceof Error ? reason.message : '读取未完成练习失败。'); })
      .finally(() => { if (mounted) setSessionLoading(false); });
    return () => { mounted = false; };
  }, [user?.id, bank?.id]);
  const start = async (mode: PracticeMode) => {
    setStartError('');
    if (preview) {
      const type = mode === 'judgement' ? 'truefalse' : mode === 'sequential' || mode === 'random' ? 'all' : mode;
      navigate(href(`/practice/answer?type=${type}`)); return;
    }
    if (!user) { navigate('/login'); return; }
    if (!bank) { setStartError(error || '请先连接并登录包含题库的服务端。'); return; }
    setStarting(mode);
    try {
      const count = quantity === 'all' ? undefined : Number(quantity);
      const result = await createPracticeSession(bank.id, mode, count);
      navigate(`/practice/answer?session=${encodeURIComponent(result.session.id)}`);
    } catch (reason) { setStartError(reason instanceof Error ? reason.message : '练习创建失败，请检查服务器连接后重试。'); }
    finally { setStarting(null); }
  };
  const resume = async () => {
    if (!activeSession) return;
    setStartError(''); setStarting(activeSession.mode);
    try {
      await resumePracticeSession(activeSession.id);
      navigate(`/practice/answer?session=${encodeURIComponent(activeSession.id)}`);
    } catch (reason) { setStartError(reason instanceof Error ? reason.message : '恢复练习失败。'); }
    finally { setStarting(null); }
  };
  return <ResponsivePage desktop={<DesktopPracticeSelection bankName={bank?.name} activeSession={activeSession} sessionLoading={sessionLoading} starting={starting} error={startError || error} quantity={quantity} setQuantity={setQuantity} onStart={start} onResume={resume} />}>
    <Screen className="list-screen" immersive><Header title="日常练习" back="/" right={<button className="header-icon" aria-label="更多" onClick={() => notice.notify('练习筛选可组合使用。')}><IconDots size={21} /></button>} /><PreviewBadge /><div className="practice-list">
      {activeSession && <button className="practice-resume-card" type="button" onClick={() => void resume()} disabled={Boolean(starting)}><span><strong>继续上次练习</strong><small>第 {activeSession.currentPosition} / {activeSession.questionCount} 题 · {activeSession.status === 'exited' ? '已暂时退出' : '进行中'}</small></span><IconChevronRight size={19} /></button>}
      <label className="practice-quantity">本轮题量<select aria-label="选择本轮题量" value={quantity} onChange={event => setQuantity(event.target.value)}><option value="20">20 题</option><option value="50">50 题</option><option value="100">100 题</option><option value="all">全部可用题目</option></select></label>
      {practiceChoices.map(({ title, desc, icon: Icon, tone, mode }) => <button className="practice-choice" type="button" key={mode} disabled={Boolean(starting)} onClick={() => void start(mode)}><span className={`choice-icon tone-${tone}`}><Icon size={21} /></span><span className="choice-copy"><strong>{title}</strong><small>{desc}</small></span><IconChevronRight className="choice-chevron" size={18} /></button>)}
    </div>{startError && <p className="form-error" role="alert">{startError}</p>}<div className="mobile-info-note"><IconInfoCircle size={16} />{preview ? '开发预览使用隔离测试数据，不会访问正式题库。' : error || (loading || sessionLoading ? '正在读取服务端题库和未完成练习…' : bank ? `当前题库：${bank.name}。答题和统计由本机服务端保存。` : '请先连接服务器并登录，再选择题库开始练习。')}</div><Toast message={notice.message} /></Screen>
  </ResponsivePage>;
}

function DesktopPlaceholder({ title }: { title: string }) {
  return <div className="desktop-placeholder-message"><h1>{title}</h1><p>手机页面已实现。桌面学习模块仍等待服务端接入。</p></div>;
}

function DesktopPracticeSelection({ bankName, activeSession, sessionLoading, starting, error, quantity, setQuantity, onStart, onResume }: {
  bankName?: string;
  activeSession: { id: string; mode: PracticeMode; currentPosition: number; questionCount: number; status: string } | null;
  sessionLoading: boolean; starting: PracticeMode | null; error: string; quantity: string; setQuantity: (value: string) => void;
  onStart: (mode: PracticeMode) => Promise<void>; onResume: () => Promise<void>;
}) {
  return <main className="desktop-practice-page"><div className="desktop-practice-heading"><div><span>学习中心 / 日常练习</span><h1>选择练习方式</h1><p>{bankName ? `当前题库：${bankName}。练习进度和答题结果由本机服务端保存。` : '连接并登录本机服务端后开始练习。'}</p></div><label>本轮题量<select value={quantity} onChange={event => setQuantity(event.target.value)}><option value="20">20 题</option><option value="50">50 题</option><option value="100">100 题</option><option value="all">全部可用题目</option></select></label></div>
    {activeSession && <button className="desktop-practice-resume" onClick={() => void onResume()} disabled={Boolean(starting)}><span><strong>继续上次练习</strong><small>第 {activeSession.currentPosition} / {activeSession.questionCount} 题 · {activeSession.status === 'exited' ? '已暂时退出' : '进行中'}</small></span><IconChevronRight size={21} /></button>}
    <div className="desktop-practice-grid">{practiceChoices.map(({ title, desc, icon: Icon, tone, mode }) => <button key={mode} className="desktop-practice-mode" disabled={Boolean(starting)} onClick={() => void onStart(mode)}><span className={`choice-icon tone-${tone}`}><Icon size={22} /></span><span><strong>{title}</strong><small>{desc}</small></span><IconChevronRight size={19} /></button>)}</div>
    {(error || sessionLoading) && <p className={error ? 'form-error' : 'desktop-practice-muted'}>{error || '正在读取未完成练习…'}</p>}
  </main>;
}

function ResponsivePage({ children, desktop }: { children: ReactNode; desktop?: ReactNode }) {
  return <><div className="mobile-route">{children}</div>{desktop && <div className="desktop-route">{desktop}</div>}</>;
}

const longFixture = new URLSearchParams(window.location.search).get('long') === '1';
const question = longFixture
  ? '以下哪项属于安全操作要求？当设备发生异常时，操作人员应该如何处理，才能确保现场作业安全并符合操作规程？'
  : '以下哪项属于安全操作要求？';
const options = longFixture
  ? ['开始作业前应检查设备和现场环境，确认防护装置完好并按操作规程逐项核对。', '发现设备异常时立即停止操作，切断相关电源并按现场流程报告负责人。', '作业过程中保持安全距离，按要求佩戴防护用品，不擅自拆除安全装置。', '完成作业后清理现场并记录异常情况，确认设备处于规定的安全状态。']
  : ['选项内容示例', '选项内容示例', '选项内容示例', '选项内容示例'];

function PreviewPracticeAnswerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [selected, setSelected] = useState(params.get('answer') ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const type = params.get('type') ?? 'single';
  const isMulti = type === 'multiple';
  const answerOptions = type === 'truefalse' ? ['正确', '错误'] : options;
  const advance = () => {
    if (!selected) { setError('请先选择答案'); return; }
    navigate(`${href('/practice/result')}${preview ? '&' : '?'}answer=${selected}`);
  };
  return <ResponsivePage desktop={<DesktopPlaceholder title="练习答题" />}><Screen className="question-screen" immersive>
    <Header back="/practice" right={<div className="question-tools"><span>{preview ? '1 / 1283' : '— / —'}</span><button aria-label={saved ? '取消收藏' : '收藏题目'} className={saved ? 'is-saved' : ''} onClick={() => setSaved(v => !v)}><IconStar size={21} /></button><button aria-label="更多操作" onClick={() => setError('当前没有其他题目操作')}><IconDots size={21} /></button></div>} />
    <PreviewBadge />{preview ? <><div className="question-content"><span className="question-type-chip">{type === 'truefalse' ? '判断题' : isMulti ? '多选题' : '单选题'}</span><h2>{question}</h2><div className="answer-options">{answerOptions.map((label, index) => { const letter = String.fromCharCode(65 + index); return <button key={letter} className={`answer-option${selected.split(',').includes(letter) ? ' is-selected' : ''}`} onClick={() => { setError(''); setSelected(current => isMulti ? (current.split(',').includes(letter) ? current.split(',').filter(x => x !== letter).join(',') : [...current.split(',').filter(Boolean), letter].sort().join(',')) : letter); }}><span className="option-radio">{selected.split(',').includes(letter) && <i />}</span><strong>{type === 'truefalse' ? '' : `${letter}.`}</strong><span>{label}</span></button>; })}</div>{error && <p className="form-error">{error}</p>}</div><div className="question-footer"><MobileButton to={href('/practice')} secondary>上一题</MobileButton><MobileButton onClick={advance}>下一题 <IconChevronRight size={17} /></MobileButton></div></> : <div className="empty-state"><IconWifi size={26} /><strong>尚未连接题库服务</strong><span>连接本地服务端后，这里会加载真实题目和答案。</span><MobileButton to={href('/practice')}>返回练习选择</MobileButton></div>}
  </Screen></ResponsivePage>;
}

function PreviewPracticeResultPage() {
  const location = useLocation();
  const answer = new URLSearchParams(location.search).get('answer') || (preview ? 'A' : '');
  const correct = answer === 'B';
  return <ResponsivePage desktop={<DesktopPlaceholder title="答题结果" />}><Screen className="result-screen" immersive>
    <Header back="/practice/answer" right={<span className="question-tools"><span>{preview ? '1 / 1283' : '— / —'}</span><IconStar size={20} /><IconDots size={20} /></span>} /><PreviewBadge />
    {preview ? <><section className={`answer-feedback${correct ? ' is-correct' : ''}`}><span className="feedback-icon">{correct ? <IconCheck size={22} /> : <IconX size={22} />}</span><div><strong>{correct ? '回答正确' : '回答错误'}</strong><span>正确答案：B</span><span>你的答案：{answer || '未作答'}</span></div></section><div className="question-content result-question"><h2>{question}</h2><div className="answer-options">{options.map((label, index) => { const letter = String.fromCharCode(65 + index); const state = letter === 'B' ? ' is-correct' : letter === answer ? ' is-wrong' : ''; return <div key={letter} className={`answer-option result-option${state}`}><span className="option-radio">{letter === 'B' ? <IconCheck size={13} /> : letter === answer ? <IconX size={13} /> : null}</span><strong>{letter}.</strong><span>{label}</span></div>; })}</div></div><div className="standard-answer">正确答案：B</div></> : <div className="empty-state"><IconWifi size={26} /><strong>等待服务端答题反馈</strong><span>尚未连接本地服务端，当前没有真实作答结果。</span></div>}
    <div className="question-footer"><MobileButton to={href('/practice/answer')} secondary>上一题</MobileButton><MobileButton to={href('/practice/answer')}>下一题 <IconChevronRight size={17} /></MobileButton></div>
  </Screen></ResponsivePage>;
}

export function PracticeAnswerPage() {
  return preview ? <PreviewPracticeAnswerPage /> : <PracticeSessionAnswerPage />;
}

function PracticeSessionAnswerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const sessionId = params.get('session') ?? '';
  const requestedPosition = Number(params.get('position') ?? 0);
  const { user } = useAuth();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getPracticeSession>>['session'] | null>(null);
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof getPracticeQuestion>> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const draftKey = sessionId && user ? `theory-exam.practice-draft.${user.id}.${sessionId}.${requestedPosition || session?.currentPosition || 1}` : '';

  useEffect(() => {
    if (!sessionId) { setLoading(false); setError('练习会话链接无效，请从练习模式中重新进入。'); return; }
    let active = true;
    setLoading(true); setError('');
    (async () => {
      let loaded = await getPracticeSession(sessionId);
      if (loaded.session.status === 'exited') loaded = await resumePracticeSession(sessionId);
      const position = requestedPosition > 0 ? requestedPosition : loaded.session.currentPosition;
      const question = await getPracticeQuestion(sessionId, position);
      if (!active) return;
      setSession(loaded.session); setCurrent(question);
      if (question.submitted) {
        navigate(`/practice/result?session=${encodeURIComponent(sessionId)}&position=${position}`, { replace: true });
        return;
      }
      const key = `theory-exam.practice-draft.${user?.id ?? 'unknown'}.${sessionId}.${position}`;
      const draft = localStorage.getItem(key);
      setSelected(draft ? JSON.parse(draft) as string[] : []);
      const favorites = await getFavorites(question.question.bankId);
      if (active) setFavorite(favorites.items.some(item => item.id === question.question.id));
    })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '题目读取失败。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, requestedPosition, user?.id, retry]);

  const selectOption = (letter: string) => {
    if (!current || current.submitted) return;
    const next = current.question.type === 'multiple'
      ? (selected.includes(letter) ? selected.filter(item => item !== letter) : [...selected, letter].sort())
      : [letter];
    setSelected(next);
    if (draftKey) localStorage.setItem(draftKey, JSON.stringify(next));
  };
  const toggleFavorite = async () => {
    if (!current || !session) return;
    try {
      const result = await setQuestionFavorite(current.question.id, session.bankId, !favorite);
      setFavorite(result.favorite);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '收藏操作失败。'); }
  };
  const move = async (position: number) => {
    if (!session) return;
    if (selected.length && !window.confirm('当前答案尚未提交，会保留在此设备。仍要切换题目吗？')) return;
    try {
      await movePracticePosition(session.id, position);
      navigate(`/practice/answer?session=${encodeURIComponent(session.id)}&position=${position}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '切换题目失败。'); }
  };
  const submit = async () => {
    if (!session || !current) return;
    if (!selected.length) { setError('请先选择答案，再提交作答。'); return; }
    setError(''); setSubmitting(true);
    try {
      await submitPracticeAnswer(session.id, selected);
      if (draftKey) localStorage.removeItem(draftKey);
      navigate(`/practice/result?session=${encodeURIComponent(session.id)}&position=${current.position}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '网络失败，服务器没有确认保存，请检查连接后重试。'); }
    finally { setSubmitting(false); }
  };
  const exit = async () => {
    if (!session) { navigate('/practice'); return; }
    try { await exitPracticeSession(session.id); navigate('/practice'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '暂时退出失败，练习仍保存在服务端。'); }
  };
  return <ResponsivePage desktop={<DesktopPracticeQuestion session={session} current={current} selected={selected} favorite={favorite} loading={loading} submitting={submitting} error={error} onSelect={selectOption} onFavorite={() => void toggleFavorite()} onMove={position => void move(position)} onSubmit={() => void submit()} onExit={() => void exit()} />}><Screen className="question-screen practice-live-screen" immersive dataQuestionId={current?.question.id}>
    <Header title="日常练习" back="/practice" right={current && <div className="question-tools"><span>{current.position} / {current.total}</span><button aria-label={favorite ? '取消收藏' : '收藏题目'} className={favorite ? 'is-saved' : ''} onClick={() => void toggleFavorite()}><IconStar size={21} /></button></div>} />
    {loading ? <div className="empty-state" role="status"><IconRefresh size={24} /><strong>正在读取题目…</strong></div> : error && !current ? <div className="empty-state"><IconWifi size={26} /><strong>题目读取失败</strong><span>{error}</span><MobileButton onClick={() => setRetry(value => value + 1)}>重试</MobileButton></div> : current ? <>
      <div className="question-content"><span className="question-type-chip">{current.question.type === 'single' ? '单选题' : current.question.type === 'multiple' ? '多选题' : '判断题'}</span><h2>{current.question.stem}</h2><div className="answer-options">{Object.entries(current.question.options).map(([letter, label]) => <button type="button" key={letter} className={`answer-option${selected.includes(letter) ? ' is-selected' : ''}`} aria-pressed={selected.includes(letter)} onClick={() => selectOption(letter)}><span className={current.question.type === 'multiple' ? 'option-checkbox' : 'option-radio'}>{selected.includes(letter) && (current.question.type === 'multiple' ? <IconCheck size={13} /> : <i />)}</span><strong>{letter}.</strong><span>{label}</span></button>)}</div><p className="practice-draft-note">未提交选择只保存在本设备，不计入学习记录。</p>{error && <p className="form-error" role="alert">{error}</p>}</div>
      <div className="practice-live-actions"><button type="button" className="mobile-button is-secondary" disabled={current.position <= 1} onClick={() => void move(current.position - 1)}>上一题</button><button type="button" className="mobile-button" disabled={submitting} onClick={() => void submit()}>{submitting ? '正在提交…' : '提交答案'}</button><button type="button" className="mobile-button is-secondary" disabled={current.position >= current.total} onClick={() => void move(current.position + 1)}>下一题</button></div>
      <button type="button" className="practice-exit-link" onClick={() => void exit()}>暂时退出，稍后继续</button>
    </> : <div className="empty-state"><IconWifi size={26} /><strong>当前没有可显示的题目</strong><span>返回练习模式，重新选择题库或筛选条件。</span><MobileButton to="/practice">返回练习选择</MobileButton></div>}
  </Screen></ResponsivePage>;
}

function DesktopPracticeQuestion({ session, current, selected, favorite, loading, submitting, error, onSelect, onFavorite, onMove, onSubmit, onExit }: {
  session: Awaited<ReturnType<typeof getPracticeSession>>['session'] | null;
  current: Awaited<ReturnType<typeof getPracticeQuestion>> | null;
  selected: string[]; favorite: boolean; loading: boolean; submitting: boolean; error: string;
  onSelect: (letter: string) => void; onFavorite: () => void; onMove: (position: number) => void; onSubmit: () => void; onExit: () => void;
}) {
  return <main className="desktop-practice-page desktop-practice-question"><div className="desktop-practice-heading"><div><span>学习中心 / 日常练习{session ? ` / ${session.mode}` : ''}</span><h1>练习答题</h1></div>{current && <div className="desktop-question-toolbar"><strong>{current.position} / {current.total}</strong><button aria-label={favorite ? '取消收藏' : '收藏题目'} className={favorite ? 'is-saved' : ''} onClick={onFavorite}><IconStar size={20} /></button></div>}</div>
    {loading ? <div className="desktop-practice-empty">正在读取题目…</div> : error && !current ? <div className="desktop-practice-empty">{error}</div> : current ? <><section className="desktop-question-card"><span className="question-type-chip">{current.question.type === 'single' ? '单选题' : current.question.type === 'multiple' ? '多选题' : '判断题'}</span><h2>{current.question.stem}</h2><div className="desktop-answer-options">{Object.entries(current.question.options).map(([letter, label]) => <button key={letter} className={`answer-option${selected.includes(letter) ? ' is-selected' : ''}`} aria-pressed={selected.includes(letter)} onClick={() => onSelect(letter)}><span className={current.question.type === 'multiple' ? 'option-checkbox' : 'option-radio'}>{selected.includes(letter) && (current.question.type === 'multiple' ? <IconCheck size={13} /> : <i />)}</span><strong>{letter}.</strong><span>{label}</span></button>)}</div><p className="practice-draft-note">未提交选择只保存在此设备，不计入学习记录。</p></section><div className="desktop-practice-actions"><button className="button button-outline" disabled={current.position <= 1} onClick={() => onMove(current.position - 1)}>上一题</button><button className="button button-primary" disabled={submitting} onClick={onSubmit}>{submitting ? '正在提交…' : '提交答案'}</button><button className="button button-outline" disabled={current.position >= current.total} onClick={() => onMove(current.position + 1)}>下一题</button><button className="button button-text" onClick={onExit}>暂时退出</button></div></> : <div className="desktop-practice-empty">当前没有可显示的题目，请返回练习选择。</div>}
  </main>;
}

export function PracticeResultPage() {
  return preview ? <PreviewPracticeResultPage /> : <PracticeSessionResultPage />;
}

function PracticeSessionResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const sessionId = params.get('session') ?? '';
  const position = Number(params.get('position') ?? 1);
  const [data, setData] = useState<Awaited<ReturnType<typeof getPracticeResult>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!sessionId) { setLoading(false); setError('缺少已保存的练习结果。'); return; }
    let active = true;
    setLoading(true); setError('');
    getPracticeResult(sessionId, position).then(value => { if (active) setData(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '练习结果读取失败。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, position, retry]);
  const go = async (nextPosition: number) => {
    if (!data) return;
    setMoving(true); setError('');
    try {
      const result = await movePracticePosition(sessionId, nextPosition);
      navigate(result.currentQuestion.submitted
        ? `/practice/result?session=${encodeURIComponent(sessionId)}&position=${nextPosition}`
        : `/practice/answer?session=${encodeURIComponent(sessionId)}&position=${nextPosition}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '切换题目失败。'); }
    finally { setMoving(false); }
  };
  const exit = async () => {
    if (!sessionId) { navigate('/practice'); return; }
    setMoving(true);
    try { await exitPracticeSession(sessionId); navigate('/practice'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '暂时退出失败，练习仍保存在服务端。'); }
    finally { setMoving(false); }
  };
  const value = data?.result;
  const letters = value ? new Set(value.correctAnswer) : new Set<string>();
  const submitted = value ? new Set(value.userAnswer) : new Set<string>();
  return <ResponsivePage desktop={<DesktopPracticeResult data={data} loading={loading} error={error} moving={moving} onRetry={() => setRetry(value => value + 1)} onMove={go} onExit={() => void exit()} />}><Screen className="result-screen practice-live-screen" immersive dataQuestionId={data?.question.id}>
    <Header title="答题结果" back="/practice" right={data && <span className="question-tools">{position} / {data.session.questionCount}</span>} />
    {loading ? <div className="empty-state" role="status"><IconRefresh size={24} /><strong>正在读取服务器反馈…</strong></div> : error && !data ? <div className="empty-state"><IconWifi size={26} /><strong>结果读取失败</strong><span>{error}</span><MobileButton onClick={() => setRetry(value => value + 1)}>重试</MobileButton></div> : data && value ? <>
      <section className={`answer-feedback${value.isCorrect ? ' is-correct' : ''}`}><span className="feedback-icon">{value.isCorrect ? <IconCheck size={22} /> : <IconX size={22} />}</span><div><strong>{value.isCorrect ? '回答正确' : '回答错误'}</strong><span>你的答案：{value.userAnswer.join('、')}</span><span>正确答案：{value.correctAnswer.join('、')}</span></div></section>
      <div className="question-content result-question"><h2>{data.question.stem}</h2><div className="answer-options">{Object.entries(data.question.options).map(([letter, label]) => { const correct = letters.has(letter); const wrong = submitted.has(letter) && !correct; return <div key={letter} className={`answer-option result-option${correct ? ' is-correct' : wrong ? ' is-wrong' : ''}`}><span className="option-radio">{correct ? <IconCheck size={13} /> : wrong ? <IconX size={13} /> : null}</span><strong>{letter}.</strong><span>{label}</span></div>; })}</div></div>
      <div className="standard-answer">标准答案：{value.correctAnswer.map(letter => `${letter}. ${value.correctOptions[letter]}`).join('；')}<small>{value.explanation}</small></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="question-footer"><button type="button" className="mobile-button is-secondary" disabled={moving || position <= 1} onClick={() => void go(position - 1)}>上一题</button>{position < data.session.questionCount ? <button type="button" className="mobile-button" disabled={moving} onClick={() => void go(position + 1)}>下一题 <IconChevronRight size={17} /></button> : <MobileButton to="/practice">返回练习选择</MobileButton>}<button type="button" className="mobile-button is-secondary" disabled={moving} onClick={() => void exit()}>暂时退出</button></div>
    </> : <div className="empty-state"><IconWifi size={26} /><strong>暂无已保存反馈</strong><span>{error || '服务器尚未确认此题作答。'}</span><MobileButton to={`/practice/answer?session=${encodeURIComponent(sessionId)}&position=${position}`}>返回答题</MobileButton></div>}
  </Screen></ResponsivePage>;
}

function DesktopPracticeResult({ data, loading, error, moving, onRetry, onMove, onExit }: {
  data: Awaited<ReturnType<typeof getPracticeResult>> | null; loading: boolean; error: string; moving: boolean;
  onRetry: () => void; onMove: (position: number) => Promise<void>; onExit: () => void;
}) {
  if (loading) return <main className="desktop-practice-page"><div className="desktop-practice-empty">正在读取服务器反馈…</div></main>;
  if (!data) return <main className="desktop-practice-page"><div className="desktop-practice-empty">{error || '暂无已保存反馈。'} <button onClick={onRetry}>重试</button></div></main>;
  const { question, result, session } = data;
  const correct = new Set(result.correctAnswer);
  const chosen = new Set(result.userAnswer);
  return <main className="desktop-practice-page desktop-practice-question"><div className="desktop-practice-heading"><div><span>学习中心 / 日常练习</span><h1>答题结果</h1></div><strong>{data.position} / {session.questionCount}</strong></div><section className={`answer-feedback${result.isCorrect ? ' is-correct' : ''}`}><span className="feedback-icon">{result.isCorrect ? <IconCheck size={22} /> : <IconX size={22} />}</span><div><strong>{result.isCorrect ? '回答正确' : '回答错误'}</strong><span>你的答案：{result.userAnswer.join('、')}</span><span>正确答案：{result.correctAnswer.join('、')}</span></div></section><section className="desktop-question-card"><h2>{question.stem}</h2><div className="desktop-answer-options">{Object.entries(question.options).map(([letter, label]) => { const isCorrect = correct.has(letter); const isWrong = chosen.has(letter) && !isCorrect; return <div key={letter} className={`answer-option result-option${isCorrect ? ' is-correct' : isWrong ? ' is-wrong' : ''}`}><span className="option-radio">{isCorrect ? <IconCheck size={13} /> : isWrong ? <IconX size={13} /> : null}</span><strong>{letter}.</strong><span>{label}</span></div>; })}</div><div className="standard-answer">标准答案：{result.correctAnswer.map(letter => `${letter}. ${result.correctOptions[letter]}`).join('；')}<small>{result.explanation}</small></div></section><div className="desktop-practice-actions"><button className="button button-outline" disabled={moving || data.position <= 1} onClick={() => void onMove(data.position - 1)}>上一题</button>{data.position < session.questionCount ? <button className="button button-primary" disabled={moving} onClick={() => void onMove(data.position + 1)}>下一题</button> : <Link className="button button-primary" to="/practice">返回练习选择</Link>}<button className="button button-text" disabled={moving} onClick={onExit}>暂时退出</button></div>{error && <p className="form-error">{error}</p>}</main>;
}

export function ExamSettingsPage() {
  const notice = useNotice();
  const { banks, activeBank: bank, loading, error, selectBank } = useBanks();
  const rules = bank?.examRules;
  const examCount = rules ? rules.singleCount + rules.multipleCount + rules.judgementCount : null;
  const examScore = rules ? rules.singleCount * rules.singlePoints + rules.multipleCount * rules.multiplePoints + rules.judgementCount * rules.judgementPoints : null;
  const start = () => preview ? window.location.assign(href('/exams/answer')) : notice.notify(bank && rules ? '正式组卷与考试创建将在后续阶段接入。' : '当前题库尚未配置可用的考试规则。');
  const ruleDescription = (count: number, points: number) => `${count} 题（每题 ${points} 分）`;
  return <ResponsivePage desktop={<DesktopPlaceholder title="模拟考试" />}><Screen className="exam-settings-screen" immersive><Header back="/" /><h1 className="exam-settings-title">模拟考试</h1><PreviewBadge />
    <section className="exam-bank-card"><span className="choice-icon tone-blue"><IconFileText size={23} /></span><div>{banks.length > 1 ? <select className="exam-bank-select" aria-label="选择题库" value={bank?.id ?? ''} onChange={event => selectBank(event.target.value)}>{banks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <strong>{bank?.name ?? (loading ? '正在读取题库…' : '暂无已启用题库')}</strong>}<small>{bank ? `版本 ${bank.activeVersion?.versionNumber ?? '—'} · ${bank.activeVersion?.questionCount ?? 0} 道题` : error || (loading ? '正在读取服务端题库' : '请连接并登录，或联系管理员导入题库')}</small></div>{banks.length > 1 && <IconChevronRight size={18} />}</section>
    {rules ? <><section className="exam-fact-grid"><div><IconFileText size={19} /><strong>{examCount}</strong><small>题目数量</small></div><div><IconClockHour4 size={19} /><strong>{rules.durationMinutes} 分钟</strong><small>考试时长</small></div><div><IconTrophy size={19} /><strong>{examScore} 分</strong><small>满分</small></div></section>
    <section className="exam-rules"><h2>考试说明</h2><ol><li>单选题：{ruleDescription(rules.singleCount, rules.singlePoints)}</li><li>多选题：{ruleDescription(rules.multipleCount, rules.multiplePoints)}</li><li>判断题：{ruleDescription(rules.judgementCount, rules.judgementPoints)}</li><li>总分：{examScore} 分，考试时间：{rules.durationMinutes} 分钟</li></ol><div className="exam-rule-note"><IconShieldCheck size={18} />正式考试计时与评分由服务端负责；当前阶段不会启动或暂停正式考试。</div></section></> : <section className="exam-rules"><h2>考试规则</h2><p className="exam-empty-rules">{preview ? '开发预览规则未配置。' : bank ? '当前题库版本尚未配置考试规则，请联系本机管理员。' : error || '连接并登录后读取已启用题库和对应考试规则。'}</p></section>}
    <div className="settings-footer"><MobileButton onClick={start} disabled={!preview && (!bank || !rules)}>开始模拟考试 <IconChevronRight size={18} /></MobileButton><small>{preview ? '开发预览：不会创建或提交真实考试' : rules ? '考试组卷与提交功能将在后续阶段接入' : '没有可用规则时无法开始考试'}</small></div><Toast message={notice.message} />
  </Screen></ResponsivePage>;
}

export function ExamAnswerPage() {
  const [seconds, setSeconds] = useState(89 * 60 + 24);
  const [panelOpen, setPanelOpen] = useState(false);
  const [marked, setMarked] = useState(false);
  const [current, setCurrent] = useState(36);
  const [selected, setSelected] = useState<string[]>(preview ? ['B', 'C'] : []);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!preview) return;
    const timer = window.setInterval(() => setSeconds(value => value > 0 ? value - 1 : value), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const showMessage = (value: string) => { setNotice(value); window.setTimeout(() => setNotice(''), 3000); };
  const submit = () => {
    if (!preview) { showMessage('未连接服务端，答案没有同步，无法正式交卷。'); return; }
    window.location.assign(href('/exams/result'));
  };
  return <ResponsivePage desktop={<DesktopPlaceholder title="模拟考试答题" />}><Screen className="exam-answer-screen" immersive>
    <div className="exam-timer-row"><div className="timer-display"><IconClockHour4 size={22} /><strong>{preview ? time : '--:--'}</strong></div><button className="exam-submit" onClick={submit} disabled={!preview}>交卷</button></div>
    <div className="exam-question-tools"><span>{preview ? `${current} / 180` : '未开始 / 180'}</span><button className={marked ? 'is-marked' : ''} onClick={() => setMarked(v => !v)}><IconStar size={17} />标记</button></div>
    <PreviewBadge /><div className="exam-sync"><span className={`sync-dot${preview ? ' is-preview' : ''}`} />{preview ? '开发预览 · 计时演示，不会同步答案' : '未连接 · 答案未同步'}</div>
    {preview ? <><div className="question-content exam-question-content"><span className="question-type-chip">多选题</span><h2>以下哪些属于正确的安全措施？</h2><div className="answer-options">{options.concat('其他选项内容示例').map((label, index) => { const letter = String.fromCharCode(65 + index); return <button key={letter} className={`answer-option${selected.includes(letter) ? ' is-selected' : ''}`} onClick={() => setSelected(current => current.includes(letter) ? current.filter(v => v !== letter) : [...current, letter].sort())}><span className="option-checkbox">{selected.includes(letter) && <IconCheck size={13} />}</span><strong>{letter}.</strong><span>{label}</span></button>; })}</div></div><div className="exam-answer-footer"><button onClick={() => setCurrent(v => Math.max(1, v - 1))}>上一题</button><button className="question-panel-trigger" onClick={() => setPanelOpen(true)}><IconGridDots size={18} /><small>题目列表</small></button><button className="next-question" onClick={() => setCurrent(v => Math.min(180, v + 1))}>下一题</button></div></> : <div className="empty-state"><IconWifi size={26} /><strong>当前没有进行中的考试</strong><span>考试题目和服务端计时仅会在真实考试开始后显示。</span><MobileButton to={href('/exams')}>返回考试设置</MobileButton></div>}
    {notice && <Toast message={notice} />}
    {panelOpen && <div className="sheet-backdrop" role="presentation" onClick={() => setPanelOpen(false)}><section className="question-sheet" role="dialog" aria-modal="true" aria-label="题目列表" onClick={e => e.stopPropagation()}><div className="sheet-heading"><strong>答题卡</strong><button aria-label="关闭答题卡" onClick={() => setPanelOpen(false)}><IconX size={21} /></button></div><p>已答 {preview ? '2' : '0'} 题 · 标记 {marked ? '1' : '0'} 题</p><div className="question-number-grid">{Array.from({ length: 180 }, (_, index) => index + 1).map(n => <button key={n} className={`${n === current ? 'is-current' : ''}${preview && [36, 37].includes(n) ? ' is-answered' : ''}`} onClick={() => { setCurrent(n); setPanelOpen(false); }}>{n}</button>)}</div><small>选择题号可跳转；正式答题卡由服务端完整生成。</small></section></div>}
  </Screen></ResponsivePage>;
}

export function ExamResultPage() {
  return <ResponsivePage desktop={<DesktopPlaceholder title="考试结果" />}><Screen className="exam-result-screen" immersive>
    <header className="mobile-page-header result-header"><span className="header-placeholder" /><h1>考试结果</h1><span className="header-placeholder" /></header><PreviewBadge />
    {preview ? <><section className="score-hero"><span className="trophy-orb"><IconTrophy size={44} /></span><strong>86.5 <small>分</small></strong><span>恭喜你完成本次模拟考试</span></section><div className="result-summary-grid"><div><strong>155</strong><small>答对</small></div><div><strong>17</strong><small>答错</small></div><div><strong>8</strong><small>未作答</small></div><div><strong>90.1%</strong><small>正确率</small></div></div><section className="score-breakdown"><ScoreRow title="单选题" value="56 / 60 分" percentage="93%" tone="green" /><ScoreRow title="多选题" value="18 / 20 分" percentage="90%" tone="blue" /><ScoreRow title="判断题" value="12.5 / 20 分" percentage="62.5%" tone="purple" /></section></> : <div className="empty-state"><IconWifi size={26} /><strong>暂无真实考试成绩</strong><span>考试结果由服务端保存和评分，当前未连接服务端。</span></div>}
    <div className="result-action-row"><MobileButton to={href('/exams')} secondary>查看详情</MobileButton><MobileButton to={href('/')}>返回首页</MobileButton></div>
  </Screen></ResponsivePage>;
}

function ScoreRow({ title, value, percentage, tone }: { title: string; value: string; percentage: string; tone: string }) {
  return <div className="score-row"><div><strong>{title}</strong><span>{value}</span></div><div className={`score-track tone-${tone}`}><i style={{ width: percentage }} /></div></div>;
}

export function PersonalCenterPage() {
  const notice = useNotice();
  const [panel, setPanel] = useState('');
  const [banks, setBanks] = useState<Array<{ id: string; name: string; activeVersion: { questionCount: number } | null }>>([]);
  const [selectedBank, setSelectedBank] = useState(localStorage.getItem('theory-exam.selected-bank') ?? '');
  const [panelError, setPanelError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const { user, serverAddress, serverStatus, setUser } = useAuth();
  const { activeBank } = useBanks();
  const { stats: mistakeStats } = useMistakeStats(activeBank?.id, user?.id);
  const navigate = useNavigate();
  const rows = [
    { title: '学习统计', detail: '查看学习进度', icon: IconChartBar },
    { title: '我的收藏', detail: preview ? '共 12 题' : '连接服务端后显示', icon: IconStar },
    { title: '错题本', detail: preview ? '预览数据' : mistakeStats ? `待复习 ${mistakeStats.review + mistakeStats.reinforcing} 题 · 已掌握 ${mistakeStats.mastered} 题` : '连接服务端后显示', icon: IconFileText },
    { title: '考试记录', detail: preview ? '共 12 次' : '连接服务端后显示', icon: IconClipboardIcon },
    { title: '题库切换', detail: selectedBank ? '已选择' : '读取服务端题库', icon: IconRefresh },
    { title: '连接设置', detail: serverAddress ? serverAddress : '未连接本地服务', icon: IconLink },
    { title: '修改密码', detail: '', icon: IconLock },
    { title: '关于应用', detail: 'V1.0.0', icon: IconInfoCircle },
  ];
  const openPanel = async (title: string) => {
    setPanelError('');
    setPanel(title);
    if (title !== '题库切换' || !user || preview) return;
    try {
      const result = await apiRequest<{ items: Array<{ id: string; name: string; activeVersion: { questionCount: number } | null }> }>('/api/banks');
      setBanks(result.items);
    } catch (error) { setPanelError(error instanceof Error ? error.message : '题库读取失败。'); }
  };
  const logout = async () => {
    if (!user) { notice.notify(preview ? '开发预览账号不会退出正式会话。' : '当前没有已登录账号。'); return; }
    if (preview) { notice.notify('开发预览不会修改正式登录状态。'); return; }
    try {
      await apiRequest<{ ok: true }>('/api/auth/logout', { method: 'POST', body: {} });
      clearSession();
      setUser(null);
      notice.notify('已退出登录。');
    } catch (error) { notice.notify(error instanceof Error ? error.message : '服务器未确认退出，请重试。'); }
  };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPanelError('');
    if (newPassword !== confirmPassword) { setPanelError('两次输入的新密码不一致。'); return; }
    if (preview || !user) { setPanelError('请先连接服务器并登录。'); return; }
    setChangingPassword(true);
    try {
      const result = await apiRequest<ApiSession>('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      await saveSession(result, persistentSession());
      setUser(result.user);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPanel('');
      notice.notify('密码已修改，其他登录会话已撤销。');
    } catch (error) { setPanelError(error instanceof Error ? error.message : '密码修改失败。'); }
    finally { setChangingPassword(false); }
  };
  const chooseBank = (id: string) => {
    setSelectedBank(id);
    localStorage.setItem('theory-exam.selected-bank', id);
  };
  return <ResponsivePage desktop={<DesktopPlaceholder title="我的" />}><Screen className="profile-screen"><header className="profile-header"><h1>我的</h1><button className="header-icon" aria-label="通知" onClick={() => notice.notify('当前没有新通知')}><IconBell size={20} /></button></header><PreviewBadge />
    <section className="profile-card"><span className="profile-avatar"><IconUserFilled size={24} /></span><div><strong>{preview ? '学习用户' : user?.username ?? '未登录'}</strong><small>{preview ? '预览账号 · 不代表真实用户' : user ? (user.role === 'admin' ? '本机管理员账号' : '已连接服务端账号') : '连接服务器后登录账号'}</small></div></section>
    <section className="profile-links">{rows.map(({ title, detail, icon: Icon }) => <button key={title} className="profile-row" onClick={() => title === '连接设置' ? navigate('/connect') : void openPanel(title)}><Icon size={19} /><strong>{title}</strong>{detail && <span>{detail}</span>}<IconChevronRight className="profile-chevron" size={17} /></button>)}</section>
    <button className="logout-button" onClick={() => void logout()}><IconLogout size={19} />退出登录</button>
    <Toast message={notice.message} />
    {panel && <div className="sheet-backdrop" role="presentation" onClick={() => setPanel('')}><section className="profile-sheet" role="dialog" aria-modal="true" aria-label={panel} onClick={e => e.stopPropagation()}><div className="sheet-heading"><strong>{panel}</strong><button aria-label="关闭" onClick={() => setPanel('')}><IconX size={21} /></button></div>
      {panel === '修改密码' && user && !preview ? <form className="password-change-form" onSubmit={changePassword}><label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label><label>新密码（至少 12 位）<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label><label>确认新密码<input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>{panelError && <p className="form-error" role="alert">{panelError}</p>}<button className="sheet-done" disabled={changingPassword}>{changingPassword ? '正在保存…' : '修改密码'}</button></form>
        : panel === '题库切换' && user && !preview ? <div className="profile-bank-list">{panelError && <p className="form-error" role="alert">{panelError}</p>}{banks.length ? banks.map(bank => <button key={bank.id} className={selectedBank === bank.id ? 'is-selected' : ''} onClick={() => chooseBank(bank.id)}><strong>{bank.name}</strong><span>{bank.activeVersion?.questionCount ?? 0} 道题</span>{selectedBank === bank.id && <IconCheck size={18} />}</button>) : <div className="empty-state compact"><IconBook size={24} /><strong>服务端暂无已启用题库</strong><span>请联系本机管理员导入题库。</span></div>}</div>
          : panel === '关于应用' ? <AppUpdatePanel disabled={preview} />
          : <div className="empty-state compact"><IconWifi size={24} /><strong>{preview ? '开发预览中的示例信息' : user ? (panel === '题库切换' ? '题库列表暂不可用' : `服务端状态：${serverStatus === 'connected' ? '已连接' : '连接异常'}`) : '需要连接并登录本地服务端'}</strong><span>{preview ? '该示例数据不会访问或修改正式服务端。' : serverAddress || '当前没有真实账号数据或服务器连接。'}</span></div>}
      {panel !== '修改密码' && <button className="sheet-done" onClick={() => setPanel('')}>知道了</button>}
    </section></div>}
  </Screen></ResponsivePage>;
}

function AppUpdatePanel({ disabled }: { disabled: boolean }) {
  const [result, setResult] = useState<CheckedUpdate | null>(null);
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number | null } | null>(null);
  const check = async () => {
    setChecking(true); setMessage('');
    try {
      const value = await checkForUpdate();
      setResult(value);
      setMessage(value.available ? '' : '当前已是服务器提供的最新版本。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '版本检查失败，请重试。'); }
    finally { setChecking(false); }
  };
  const download = async () => {
    if (!result?.available) return;
    setDownloading(true); setMessage(''); setProgress({ received: 0, total: null });
    try {
      await downloadAndOpenUpdate(result.manifest, (received, total) => setProgress({ received, total }));
      setMessage('下载与 SHA-256 校验完成，已打开 Android 系统安装确认。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '下载或校验失败，请重试。'); }
    finally { setDownloading(false); }
  };
  const progressText = progress ? `${progress.total ? Math.floor(progress.received * 100 / progress.total) : Math.round(progress.received / 1024)}${progress.total ? '%' : ' KB'}` : '';
  return <div className="app-update-panel">
    <p>只会从已认证本机服务获取更新。安装需要你在 Android 系统安装器中确认。</p>
    <button className="sheet-done" disabled={disabled || checking || downloading} onClick={() => void check()}>{checking ? '正在检查…' : '检查更新'}</button>
    {result && <section><strong>当前版本 {result.currentVersion}</strong>{result.available ? <><h3>发现版本 {result.manifest.version}</h3><p>{result.manifest.releaseNotes || '此版本没有更新说明。'}</p><p>应用标识与版本已检查；Android 系统安装器会验证签名连续性。</p><button className="sheet-done" disabled={downloading} onClick={() => void download()}>{downloading ? `正在下载 ${progressText}` : '下载并打开安装器'}</button></> : null}</section>}
    {message && <p className="form-error" role="status">{message}</p>}
  </div>;
}

function IconClipboardIcon(props: React.ComponentProps<typeof IconFileText>) {
  return <IconFileText {...props} />;
}

export function isImmersiveRoute(pathname: string) {
  return ['/start', '/connect', '/login', '/practice', '/practice/answer', '/practice/result', '/exams', '/exams/answer', '/exams/result', '/mistakes', '/mistakes/review'].includes(pathname)
    || pathname.startsWith('/mistakes/history/');
}
