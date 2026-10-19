import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  IconArrowLeft, IconBell, IconBook, IconChartBar, IconCheck,
  IconChevronRight, IconCircleCheck, IconClockHour4, IconDots, IconFileText,
  IconFlag, IconGridDots, IconEye, IconEyeOff, IconInfoCircle, IconLink, IconLock,
  IconLogout, IconPencil, IconQrcode, IconRefresh, IconShieldCheck,
  IconStar, IconTrophy, IconUser, IconUserFilled, IconWifi, IconX,
} from '@tabler/icons-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';
const href = (path: string) => preview ? `${path}${path.includes('?') ? '&' : '?'}preview=1` : path;

export function PreviewBadge() {
  return preview ? <span className="preview-badge">开发预览 · 测试数据</span> : null;
}

function StatusBar() {
  return <div className="mobile-statusbar" aria-hidden="true"><span>9:41</span><span className="status-icons"><IconWifi size={15} /><span className="signal-bars"><i /><i /><i /><i /></span><span className="battery"><i /></span></span></div>;
}

function Screen({ children, immersive = false, className = '' }: { children: ReactNode; immersive?: boolean; className?: string }) {
  return <main className={`mobile-screen${immersive ? ' is-immersive' : ''} ${className}`}><StatusBar />{children}</main>;
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

function MobileHomePage() {
  const notice = useNotice();
  const stat = (value: string) => preview ? value : '—';
  const quick = [
    { title: '日常练习', icon: IconPencil, to: '/practice', tone: 'green' },
    { title: '模拟考试', icon: IconFileText, to: '/exams', tone: 'blue' },
    { title: '错题复习', icon: IconFileText, to: '/mistakes', tone: 'red' },
    { title: '我的收藏', icon: IconStar, to: '/me', tone: 'amber' },
    { title: '考试记录', icon: IconClipboardIcon, to: '/me', tone: 'blue' },
    { title: '题库切换', icon: IconRefresh, to: '/me', tone: 'green' },
  ];
  return <Screen className="home-screen">
    <header className="home-brand"><span className="home-brand-mark"><IconBook size={20} /></span><strong>理论考试</strong><button aria-label="通知" onClick={() => notice.notify('当前没有新通知')}><IconBell size={20} /></button></header>
    <div className="home-greeting"><h1>{preview ? '你好，学习用户' : '你好，欢迎学习'}</h1><p>{preview ? '从今天的进步开始。' : '连接本地服务后开始记录学习进度'}</p></div>
    <PreviewBadge />
    <section className="mobile-stat-grid" aria-label="学习概况">
      <article className="mobile-stat-card tone-green"><IconChartBar size={19} /><strong>{stat('426')}</strong><span>{preview ? '已学习' : '已学习题目'}</span></article>
      <article className="mobile-stat-card tone-blue"><IconChartBar size={19} /><strong>{stat('82.6%')}</strong><span>正确率</span></article>
      <article className="mobile-stat-card tone-red"><IconFileText size={19} /><strong>{stat('38')}</strong><span>待复习</span></article>
    </section>
    <section className="mobile-continue-card">
      <div className="mobile-card-heading"><span className="mobile-icon-box tone-blue"><IconBook size={22} /></span><div><strong>继续练习</strong><small>{preview ? '顺序练习 · 按题库顺序逐题练习' : '练习进度将在连接服务端后显示'}</small></div></div>
      <div className="mobile-progress-label"><span>{preview ? '已完成 426 / 1283 题' : '尚无练习记录'}</span><span>{preview ? '33.2%' : '—'}</span></div>
      <div className="mobile-progress-track"><span style={{ width: preview ? '33.2%' : '0%' }} /></div>
      <MobileButton to={href('/practice')}>继续刷题 <IconChevronRight size={18} /></MobileButton>
    </section>
    <section className="mobile-quick-section"><div className="mobile-quick-grid">
      {quick.map(({ title, icon: Icon, to, tone }) => <Link className="mobile-quick-link" key={title} to={href(to)}><span className={`quick-icon tone-${tone}`}><Icon size={20} /></span><span>{title}</span></Link>)}
    </div></section>
    <Toast message={notice.message} />
  </Screen>;
}

export function MobileDashboard() { return <div className="mobile-route"><MobileHomePage /></div>; }

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
    const localHost = /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[::1\])$/i.test(url.hostname);
    return url.protocol === 'https:' || localHost;
  } catch { return false; }
}

export function ConnectPage() {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const notice = useNotice();
  const connect = () => {
    setError('');
    if (!allowedServerAddress(address)) {
      setError('请输入有效地址。公网地址须使用 HTTPS；HTTP 仅适用于本机或局域网地址。');
      return;
    }
    notice.notify('地址格式有效。当前尚未接入服务连通性检测，连接未建立。');
  };
  return <Screen className="connect-screen" immersive>
    <Header back="/start" />
    <div className="auth-title"><h1>连接服务器</h1><p>请选择连接方式，连接你的学习服务器</p></div>
    <button className="connect-option" onClick={() => notice.notify('扫码功能将在 Android 相机权限接入后提供。')}><span className="connect-option-icon tone-blue"><IconQrcode size={28} /></span><span><strong>扫码连接</strong><small>扫描电脑端二维码<br />快速连接服务器</small></span><IconChevronRight className="option-arrow" size={18} /></button>
    <button className="connect-option" aria-expanded={manualOpen} onClick={() => setManualOpen(value => !value)}><span className="connect-option-icon tone-blue"><IconLink size={26} /></span><span><strong>手动连接</strong><small>输入服务器地址<br />进行连接</small></span><IconChevronRight className="option-arrow" size={18} /></button>
    {manualOpen && <section className="connect-manual"><label htmlFor="server-address">服务器地址</label><input id="server-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="https://example.com" inputMode="url" autoCapitalize="none" />{error && <p className="form-error" role="alert">{error}</p>}<MobileButton onClick={connect}>验证并连接</MobileButton></section>}
    <Link className="auth-footnote" to={href('/login')}>连接后即可登录你的账号</Link>
    <Toast message={notice.message} />
  </Screen>;
}

export function LoginPage() {
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const notice = useNotice();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    notice.notify('尚未连接服务器，无法验证账号；登录状态未更改。');
  };
  return <Screen className="login-screen" immersive>
    <Header back="/connect" />
    <div className="login-content"><h1>欢迎回来</h1><p>登录你的账号，继续学习</p><form onSubmit={submit}>
      <label className="input-wrap"><IconUser size={19} /><input aria-label="用户名" placeholder="用户名" autoComplete="username" /></label>
      <label className="input-wrap"><IconLock size={19} /><input aria-label="密码" placeholder="密码" type={showPassword ? 'text' : 'password'} autoComplete="current-password" /><button type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(v => !v)}>{showPassword ? <IconEyeOff size={19} /> : <IconEye size={19} />}</button></label>
      <label className="remember-row"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />记住我</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <MobileButton type="submit">登录</MobileButton>
    </form><small className="auth-footnote">仅支持管理员创建的账号登录</small></div>
    <Toast message={notice.message} />
  </Screen>;
}

const practiceChoices = [
  { title: '顺序练习', desc: '按照题库顺序逐题练习', icon: IconGridDots, tone: 'blue', type: 'all' },
  { title: '随机练习', desc: '随机抽取题目进行练习', icon: IconTrophy, tone: 'amber', type: 'all' },
  { title: '单选题练习', desc: preview ? '共 845 题' : '服务端接入后显示题量', icon: IconFileText, tone: 'blue', type: 'single' },
  { title: '多选题练习', desc: preview ? '共 38 题' : '服务端接入后显示题量', icon: IconFileText, tone: 'purple', type: 'multiple' },
  { title: '判断题练习', desc: preview ? '共 400 题' : '服务端接入后显示题量', icon: IconCircleCheck, tone: 'green', type: 'truefalse' },
  { title: '错题专项练习', desc: preview ? '待复习 38 题' : '连接服务端后显示错题', icon: IconRefresh, tone: 'red', type: 'mistakes' },
  { title: '收藏题目', desc: preview ? '共 12 题' : '连接服务端后显示收藏', icon: IconStar, tone: 'amber', type: 'favorites' },
];

export function PracticeSelectionPage() {
  const notice = useNotice();
  return <ResponsivePage desktop={<DesktopPlaceholder title="日常练习" />}>
    <Screen className="list-screen" immersive><Header title="日常练习" back="/" right={<button className="header-icon" aria-label="更多" onClick={() => notice.notify('练习筛选可组合使用。')}><IconDots size={21} /></button>} /><PreviewBadge /><div className="practice-list">
      {practiceChoices.map(({ title, desc, icon: Icon, tone, type }) => <Link className="practice-choice" key={title} to={href(`/practice/answer?type=${type}`)}><span className={`choice-icon tone-${tone}`}><Icon size={21} /></span><span className="choice-copy"><strong>{title}</strong><small>{desc}</small></span><IconChevronRight className="choice-chevron" size={18} /></Link>)}
    </div><div className="mobile-info-note"><IconInfoCircle size={16} />题量为题库结构说明；实际练习需连接本地服务端。</div><Toast message={notice.message} /></Screen>
  </ResponsivePage>;
}

function DesktopPlaceholder({ title }: { title: string }) {
  return <div className="desktop-placeholder-message"><h1>{title}</h1><p>手机页面已实现。桌面学习模块仍等待服务端接入。</p></div>;
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

export function PracticeAnswerPage() {
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

export function PracticeResultPage() {
  const location = useLocation();
  const answer = new URLSearchParams(location.search).get('answer') || (preview ? 'A' : '');
  const correct = answer === 'B';
  return <ResponsivePage desktop={<DesktopPlaceholder title="答题结果" />}><Screen className="result-screen" immersive>
    <Header back="/practice/answer" right={<span className="question-tools"><span>{preview ? '1 / 1283' : '— / —'}</span><IconStar size={20} /><IconDots size={20} /></span>} /><PreviewBadge />
    {preview ? <><section className={`answer-feedback${correct ? ' is-correct' : ''}`}><span className="feedback-icon">{correct ? <IconCheck size={22} /> : <IconX size={22} />}</span><div><strong>{correct ? '回答正确' : '回答错误'}</strong><span>正确答案：B</span><span>你的答案：{answer || '未作答'}</span></div></section><div className="question-content result-question"><h2>{question}</h2><div className="answer-options">{options.map((label, index) => { const letter = String.fromCharCode(65 + index); const state = letter === 'B' ? ' is-correct' : letter === answer ? ' is-wrong' : ''; return <div key={letter} className={`answer-option result-option${state}`}><span className="option-radio">{letter === 'B' ? <IconCheck size={13} /> : letter === answer ? <IconX size={13} /> : null}</span><strong>{letter}.</strong><span>{label}</span></div>; })}</div></div><div className="standard-answer">正确答案：B</div></> : <div className="empty-state"><IconWifi size={26} /><strong>等待服务端答题反馈</strong><span>尚未连接本地服务端，当前没有真实作答结果。</span></div>}
    <div className="question-footer"><MobileButton to={href('/practice/answer')} secondary>上一题</MobileButton><MobileButton to={href('/practice/answer')}>下一题 <IconChevronRight size={17} /></MobileButton></div>
  </Screen></ResponsivePage>;
}

export function ExamSettingsPage() {
  const notice = useNotice();
  const start = () => preview ? window.location.assign(href('/exams/answer')) : notice.notify('尚未连接服务端，不能创建真实考试。');
  return <ResponsivePage desktop={<DesktopPlaceholder title="模拟考试" />}><Screen className="exam-settings-screen" immersive><Header back="/" /><h1 className="exam-settings-title">模拟考试</h1><PreviewBadge />
    <section className="exam-bank-card"><span className="choice-icon tone-blue"><IconFileText size={23} /></span><div><strong>四级理论题库</strong><small>全真模拟 · 随机组卷 · 限时完成</small></div><IconChevronRight size={18} /></section>
    <section className="exam-fact-grid"><div><IconFileText size={19} /><strong>180</strong><small>题目数量</small></div><div><IconClockHour4 size={19} /><strong>90 分钟</strong><small>考试时长</small></div><div><IconTrophy size={19} /><strong>100 分</strong><small>满分</small></div></section>
    <section className="exam-rules"><h2>考试说明</h2><ol><li>单选题：120 题（每题 0.5 分）</li><li>多选题：20 题（每题 1 分）</li><li>判断题：40 题（每题 0.5 分）</li><li>总分：100 分，考试时间：90 分钟</li></ol><div className="exam-rule-note"><IconShieldCheck size={18} />考试计时与评分由服务端负责。正式考试不可暂停。</div></section>
    <div className="settings-footer"><MobileButton onClick={start}>开始模拟考试 <IconChevronRight size={18} /></MobileButton><small>{preview ? '开发预览：不会创建或提交真实考试' : '连接服务端后开始真实考试'}</small></div><Toast message={notice.message} />
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

export function MistakesPage() {
  const [types, setTypes] = useState<string[]>(['single', 'multiple', 'truefalse']);
  const [strategy, setStrategy] = useState('random');
  const [quantity, setQuantity] = useState('20');
  const [started, setStarted] = useState(false);
  const toggleType = (type: string) => setTypes(list => list.includes(type) ? list.filter(value => value !== type) : [...list, type]);
  const start = () => { if (types.length === 0) { setStarted(true); return; } window.location.assign(href('/practice/answer?type=mistakes')); };
  return <ResponsivePage desktop={<DesktopPlaceholder title="错题复习" />}><Screen className="mistakes-screen" immersive><Header title="错题复习" back="/" /><PreviewBadge />
    <section className="mistake-stats"><div className="tone-red"><IconFileText size={18} /><strong>{preview ? '38' : '—'}</strong><small>待复习</small></div><div className="tone-amber"><IconClockHour4 size={18} /><strong>{preview ? '12' : '—'}</strong><small>巩固中</small></div><div className="tone-green"><IconCircleCheck size={18} /><strong>{preview ? '74' : '—'}</strong><small>已掌握</small></div></section>
    <section className="mistake-filter-list"><FilterRow title="混合题型练习" desc="随机组合各题型错题" icon={IconGridDots} tone="blue" checked={types.length === 3} onClick={() => setTypes(types.length === 3 ? [] : ['single', 'multiple', 'truefalse'])} /><FilterRow title="仅单选题" desc={preview ? '待复习 26 题' : '连接服务端后显示错题数量'} icon={IconFileText} tone="amber" checked={types.includes('single')} onClick={() => toggleType('single')} /><FilterRow title="仅多选题" desc={preview ? '待复习 4 题' : '连接服务端后显示错题数量'} icon={IconFileText} tone="blue" checked={types.includes('multiple')} onClick={() => toggleType('multiple')} /><FilterRow title="仅判断题" desc={preview ? '待复习 8 题' : '连接服务端后显示错题数量'} icon={IconCircleCheck} tone="green" checked={types.includes('truefalse')} onClick={() => toggleType('truefalse')} /></section>
    <section className="mistake-options"><button className="priority-setting" role="switch" aria-checked={strategy === 'weak'} onClick={() => setStrategy(strategy === 'weak' ? 'random' : 'weak')}><span><IconFlag size={17} /><span><strong>薄弱题优先</strong><small>优先复习正确率较低的题目</small></span></span><span className={`toggle${strategy === 'weak' ? ' is-on' : ''}`}><i /></span></button><div className="option-setting"><span><IconFileText size={17} />复习数量</span><select value={quantity} onChange={e => setQuantity(e.target.value)}><option value="10">10 题</option><option value="20">20 题</option><option value="all">全部</option></select></div></section>
    <p className="mastery-note">同一道错题需在不同复习轮次连续答对两次，才会标记为已掌握。</p>{started && !types.length && <p className="form-error">请至少选择一种题型</p>}
    <div className="mistake-footer"><MobileButton onClick={start}>开始复习 <IconChevronRight size={18} /></MobileButton></div>
  </Screen></ResponsivePage>;
}

function FilterRow({ title, desc, icon: Icon, tone, checked, onClick }: { title: string; desc: string; icon: typeof IconBook; tone: string; checked: boolean; onClick: () => void }) {
  return <button className="mistake-filter-row" onClick={onClick}><span className={`choice-icon tone-${tone}`}><Icon size={20} /></span><span><strong>{title}</strong><small>{desc}</small></span><span className={`toggle${checked ? ' is-on' : ''}`}><i /></span></button>;
}

export function PersonalCenterPage() {
  const notice = useNotice();
  const [panel, setPanel] = useState('');
  const rows = [
    { title: '学习统计', detail: '查看学习进度', icon: IconChartBar },
    { title: '我的收藏', detail: preview ? '共 12 题' : '连接服务端后显示', icon: IconStar },
    { title: '错题本', detail: preview ? '待复习 38 题' : '连接服务端后显示', icon: IconFileText },
    { title: '考试记录', detail: preview ? '共 12 次' : '连接服务端后显示', icon: IconClipboardIcon },
    { title: '题库切换', detail: '当前：四级理论题库', icon: IconRefresh },
    { title: '连接设置', detail: '未连接本地服务', icon: IconLink },
    { title: '修改密码', detail: '', icon: IconLock },
    { title: '关于应用', detail: 'V1.0.0', icon: IconInfoCircle },
  ];
  return <ResponsivePage desktop={<DesktopPlaceholder title="我的" />}><Screen className="profile-screen"><header className="profile-header"><h1>我的</h1><button className="header-icon" aria-label="通知" onClick={() => notice.notify('当前没有新通知')}><IconBell size={20} /></button></header><PreviewBadge />
    <section className="profile-card"><span className="profile-avatar"><IconUserFilled size={24} /></span><div><strong>{preview ? '学习用户' : '未登录'}</strong><small>{preview ? '预览账号 · 不代表真实用户' : '连接服务器后登录账号'}</small></div></section>
    <section className="profile-links">{rows.map(({ title, detail, icon: Icon }) => <button key={title} className="profile-row" onClick={() => setPanel(title)}><Icon size={19} /><strong>{title}</strong>{detail && <span>{detail}</span>}<IconChevronRight className="profile-chevron" size={17} /></button>)}</section>
    <button className="logout-button" onClick={() => notice.notify('当前没有已登录账号。')}><IconLogout size={19} />退出登录</button>
    <Toast message={notice.message} />
    {panel && <div className="sheet-backdrop" role="presentation" onClick={() => setPanel('')}><section className="profile-sheet" role="dialog" aria-modal="true" aria-label={panel} onClick={e => e.stopPropagation()}><div className="sheet-heading"><strong>{panel}</strong><button aria-label="关闭" onClick={() => setPanel('')}><IconX size={21} /></button></div><div className="empty-state compact"><IconWifi size={24} /><strong>{preview ? '开发预览中的示例信息' : '需要连接本地服务端'}</strong><span>{preview ? '该示例数据不会保存为学习记录。' : '当前没有账号数据或服务器连接。'}</span></div><button className="sheet-done" onClick={() => setPanel('')}>知道了</button></section></div>}
  </Screen></ResponsivePage>;
}

function IconClipboardIcon(props: React.ComponentProps<typeof IconFileText>) {
  return <IconFileText {...props} />;
}

export function isImmersiveRoute(pathname: string) {
  return ['/start', '/connect', '/login', '/practice', '/practice/answer', '/practice/result', '/exams', '/exams/answer', '/exams/result', '/mistakes'].includes(pathname);
}
