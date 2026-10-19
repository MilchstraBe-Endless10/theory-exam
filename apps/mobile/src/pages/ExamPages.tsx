import { useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconCheck, IconChevronRight, IconClockHour4, IconFileText, IconGridDots, IconRefresh, IconShieldCheck, IconStar, IconTrophy, IconWifi, IconX } from '@tabler/icons-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError, previewMode } from '../services/api';
import { useBanks } from '../services/banks';
import { getActiveExam, getExam, getExamHistory, saveExamAnswer, startExam, submitExam, type ExamQuestion, type ExamResult, type ExamState } from '../services/exams';

const href = (path: string) => import.meta.env.DEV && previewMode() ? `${path}${path.includes('?') ? '&' : '?'}preview=1` : path;
type Draft = { answer: string[]; marked: boolean };

function Screen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <main className={`mobile-screen is-immersive ${className}`}><div className="mobile-statusbar" aria-hidden="true"><span>9:41</span><span>● ▮ ▰</span></div>{children}</main>;
}
function Header({ title, back = '/' }: { title: string; back?: string }) {
  return <header className="mobile-page-header"><Link className="back-button" to={href(back)} aria-label="返回"><IconArrowLeft size={22} /></Link><h1>{title}</h1><span className="header-placeholder" /></header>;
}
function Button({ children, onClick, disabled = false, secondary = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) {
  return <button type="button" className={`mobile-button${secondary ? ' is-secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Responsive({ mobile, desktop }: { mobile: React.ReactNode; desktop: React.ReactNode }) {
  return <><div className="mobile-route">{mobile}</div><div className="desktop-route">{desktop}</div></>;
}
function ruleRows(rules: Record<string, number>) {
  return [
    `单选题：${rules.singleCount} 题（每题 ${rules.singlePoints} 分）`,
    `多选题：${rules.multipleCount} 题（每题 ${rules.multiplePoints} 分）`,
    `判断题：${rules.judgementCount} 题（每题 ${rules.judgementPoints} 分）`,
  ];
}

export function ExamSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const preview = import.meta.env.DEV && previewMode(location.search);
  const { user } = useAuth();
  const { activeBank: bank, loading, error } = useBanks();
  const [active, setActive] = useState<ExamState | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState('');
  const rules = bank?.examRules;
  const count = rules ? rules.singleCount + rules.multipleCount + rules.judgementCount : 0;
  const maxScore = rules ? rules.singleCount * rules.singlePoints + rules.multipleCount * rules.multiplePoints + rules.judgementCount * rules.judgementPoints : 0;
  useEffect(() => {
    if (preview || !user || user.mustChangePassword) { setActive(null); return; }
    let alive = true;
    setChecking(true);
    getActiveExam().then(value => { if (alive) setActive(value.session ? value : null); })
      .catch(reason => { if (alive) setMessage(reason instanceof Error ? reason.message : '进行中的考试读取失败。'); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [preview, user?.id, user?.mustChangePassword]);
  const resume = () => active?.session && navigate(`/exams/answer?exam=${encodeURIComponent(active.session.id)}`);
  const begin = async () => {
    if (preview) { navigate(href('/exams/answer')); return; }
    if (!user) { navigate('/login'); return; }
    if (!bank || !rules) { setMessage(error || '当前题库没有可用的考试规则。'); return; }
    setStarting(true); setMessage('');
    try {
      const result = await startExam(bank.id);
      if (result.session) navigate(`/exams/answer?exam=${encodeURIComponent(result.session.id)}`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : '创建考试失败。'); }
    finally { setStarting(false); }
  };
  const rulesContent = rules ? <>
    <section className="exam-fact-grid"><div><IconFileText size={19} /><strong>{count}</strong><small>题目数量</small></div><div><IconClockHour4 size={19} /><strong>{rules.durationMinutes} 分钟</strong><small>考试时长</small></div><div><IconTrophy size={19} /><strong>{maxScore} 分</strong><small>满分</small></div></section>
    <section className="exam-rules"><h2>考试说明</h2><ol>{ruleRows(rules as unknown as Record<string, number>).map(row => <li key={row}>{row}</li>)}<li>总分：{maxScore} 分，考试时间：{rules.durationMinutes} 分钟</li></ol><div className="exam-rule-note"><IconShieldCheck size={18} />开始后服务器持续计时，退出、锁屏和断网均不会暂停。</div></section>
  </> : <section className="exam-rules"><h2>考试规则</h2><p className="exam-empty-rules">{preview ? '预览规则未配置。' : bank ? '当前题库版本尚未配置考试规则。' : error || (loading ? '正在读取题库…' : '请连接并登录有可用题库的服务端。')}</p></section>;
  const resumeCard = active?.session ? <section className="exam-resume-card"><span><strong>有一场考试正在进行</strong><small>服务器剩余 {Math.ceil(active.session.remainingSeconds / 60)} 分钟 · 已确认答案可恢复</small></span><button onClick={resume}>继续考试 <IconChevronRight size={17} /></button></section> : null;
  const footer = <div className="settings-footer"><Button onClick={() => void begin()} disabled={!preview && (!bank || !rules || starting || Boolean(active?.session))}>{starting ? '正在按规则组卷…' : '开始模拟考试'} <IconChevronRight size={18} /></Button><small>{preview ? '开发预览不会创建或提交真实考试' : checking ? '正在检查进行中的考试…' : rules ? '服务器将在考试开始后立即计时' : '没有有效规则时不能开始考试'}</small></div>;
  return <Responsive mobile={<Screen className="exam-settings-screen"><Header title="模拟考试" /><section className="exam-bank-card"><span className="choice-icon tone-blue"><IconFileText size={23} /></span><div><strong>{bank?.name ?? (loading ? '正在读取题库…' : '暂无可用题库')}</strong><small>{bank ? `${bank.activeVersion?.questionCount ?? 0} 道题 · 当前版本 ${bank.activeVersion?.versionNumber ?? '—'}` : error || '连接后读取服务端题库'}</small></div></section>{resumeCard}{rulesContent}{message && <p className="form-error" role="alert">{message}</p>}{footer}</Screen>} desktop={<main className="desktop-practice-page desktop-exam-settings"><div className="desktop-practice-heading"><div><span>学习中心 / 模拟考试</span><h1>考试设置</h1><p>{bank ? `${bank.name} · ${bank.activeVersion?.questionCount ?? 0} 道题` : error || '连接后读取当前题库。'}</p></div></div>{resumeCard}<section className="desktop-exam-rules"><h2>考试规则</h2>{rules ? <><ul>{ruleRows(rules as unknown as Record<string, number>).map(row => <li key={row}>{row}</li>)}</ul><p>合计 {count} 题 · 满分 {maxScore} 分 · {rules.durationMinutes} 分钟</p></> : <p>{error || '当前题库尚未配置考试规则。'}</p>}<button className="button button-primary" onClick={() => void begin()} disabled={!preview && (!bank || !rules || starting || Boolean(active?.session))}>{starting ? '正在组卷…' : '开始模拟考试'}</button>{message && <p className="form-error">{message}</p>}</section></main>} />;
}

export function ExamAnswerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const preview = import.meta.env.DEV && previewMode(location.search);
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam') ?? '';
  const [exam, setExam] = useState<ExamState | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [position, setPosition] = useState(Number(params.get('position') ?? 1));
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [syncState, setSyncState] = useState<'confirmed' | 'unsynced' | 'syncing' | 'offline' | 'conflict'>('confirmed');
  const [seconds, setSeconds] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const versions = useRef(new Map<number, number>());
  const liveDrafts = useRef<Record<number, Draft>>({});
  const queue = useRef(Promise.resolve());
  const pendingWrites = useRef(new Set<number>());
  const failedWrites = useRef(new Set<number>());

  const load = async () => {
    if (!user || user.mustChangePassword) { setError(user?.mustChangePassword ? '请先修改初始密码。' : '请先登录后恢复考试。'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const value = examId ? await getExam(examId) : await getActiveExam();
      if (!value.session) { setExam(null); return; }
      if (value.result || value.session.status !== 'in_progress') { navigate(`/exams/result?exam=${encodeURIComponent(value.session.id)}`, { replace: true }); return; }
      setExam(value);
      const restored = Object.fromEntries(value.questions.map(question => [question.position, { answer: question.answer, marked: question.marked }]));
      liveDrafts.current = restored; setDrafts(restored);
      versions.current = new Map(value.questions.map(question => [question.position, question.version]));
      pendingWrites.current.clear(); failedWrites.current.clear();
      setPosition(Math.min(Math.max(Number(params.get('position') ?? 1), 1), value.questions.length));
      setSyncState('confirmed');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '读取考试状态失败。'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (preview) return;
    if (!user || user.mustChangePassword) { setLoading(false); setError(user?.mustChangePassword ? '请先修改初始密码。' : '请先登录后恢复考试。'); return; }
    void load();
    /* route and authenticated identity define a fresh session read */
  }, [preview, examId, user?.id, user?.mustChangePassword]);
  useEffect(() => {
    if (!exam?.session) return;
    const deadline = Date.parse(exam.session.deadlineAt);
    const serverAtLoad = Date.parse(exam.session.serverNow);
    const clientAtLoad = Date.now();
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - serverAtLoad - (Date.now() - clientAtLoad)) / 1000)));
    update(); const interval = window.setInterval(update, 1000); return () => window.clearInterval(interval);
  }, [exam?.session?.id, exam?.session?.deadlineAt, exam?.session?.serverNow]);
  useEffect(() => {
    if (preview || !exam?.session || seconds > 0) return;
    getExam(exam.session.id).then(value => { if (value.result) navigate(`/exams/result?exam=${encodeURIComponent(exam.session!.id)}`, { replace: true }); })
      .catch(() => setSyncState('offline'));
  }, [seconds, exam?.session?.id]);

  const question = exam?.questions.find(item => item.position === position) ?? null;
  const draft = drafts[position] ?? { answer: question?.answer ?? [], marked: question?.marked ?? false };
  const publishSyncState = () => setSyncState(failedWrites.current.size ? 'offline' : pendingWrites.current.size ? 'syncing' : 'confirmed');
  const sync = (target: number, next: Draft) => {
    liveDrafts.current = { ...liveDrafts.current, [target]: next }; setDrafts(liveDrafts.current);
    pendingWrites.current.add(target); failedWrites.current.delete(target);
    setSyncState(failedWrites.current.size ? 'offline' : 'unsynced');
    queue.current = queue.current.then(async () => {
      if (!exam?.session) return;
      const latest = liveDrafts.current[target] ?? next;
      if (!failedWrites.current.size) setSyncState('syncing');
      try {
        const saved = await saveExamAnswer(exam.session.id, target, { answer: latest.answer, marked: latest.marked,
          expectedVersion: versions.current.get(target) ?? 0, requestId: globalThis.crypto.randomUUID() });
        versions.current.set(target, saved.version);
        setExam(current => current ? ({ ...current, questions: current.questions.map(item => item.position === target ? { ...item, version: saved.version, answer: saved.answer, marked: saved.marked, updatedAt: saved.updatedAt } : item) }) : current);
        const local = liveDrafts.current[target];
        if (JSON.stringify(local?.answer) === JSON.stringify(saved.answer) && local?.marked === saved.marked) pendingWrites.current.delete(target);
        failedWrites.current.delete(target);
        publishSyncState();
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === 'ANSWER_VERSION_CONFLICT') {
          setSyncState('conflict');
          try {
            const latestState = await getExam(exam.session.id);
            const latestQuestion = latestState.questions.find(item => item.position === target);
            if (latestQuestion) {
              versions.current.set(target, latestQuestion.version);
              const local = liveDrafts.current[target];
              if (JSON.stringify(latestQuestion.answer) !== JSON.stringify(local?.answer) || latestQuestion.marked !== local?.marked) {
                sync(target, local ?? { answer: latestQuestion.answer, marked: latestQuestion.marked });
              } else {
                pendingWrites.current.delete(target); failedWrites.current.delete(target); publishSyncState();
              }
            }
          } catch { failedWrites.current.add(target); publishSyncState(); }
        } else { failedWrites.current.add(target); publishSyncState(); }
      }
    }).catch(() => { failedWrites.current.add(target); publishSyncState(); });
  };
  const retrySync = () => {
    for (const target of [...pendingWrites.current]) {
      const pending = liveDrafts.current[target];
      if (pending) sync(target, pending);
    }
  };
  const choose = (letter: string) => {
    if (!question) return;
    const answer = question.type === 'multiple'
      ? draft.answer.includes(letter) ? draft.answer.filter(item => item !== letter) : [...draft.answer, letter].sort()
      : [letter];
    sync(position, { ...draft, answer });
  };
  const jump = (next: number) => {
    const target = Math.min(Math.max(1, next), exam?.questions.length ?? 180);
    setPosition(target); setPanelOpen(false);
    if (exam?.session) navigate(`/exams/answer?exam=${encodeURIComponent(exam.session.id)}&position=${target}`, { replace: true });
  };
  const finish = async () => {
    if (!exam?.session || syncState !== 'confirmed') return;
    setSubmitting(true); setError('');
    try { await queue.current; await submitExam(exam.session.id); navigate(`/exams/result?exam=${encodeURIComponent(exam.session.id)}`, { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '交卷失败；服务器考试仍在计时。'); }
    finally { setSubmitting(false); setConfirmOpen(false); }
  };
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const syncText = syncState === 'confirmed' ? '答案已由服务器确认' : syncState === 'syncing' ? '正在同步答案…' : syncState === 'unsynced' ? '答案尚未同步' : syncState === 'conflict' ? '其他设备更新了答案，正在对齐' : '网络中断 · 答案尚未确认';
  const questionCard = question ? <>
    <div className="question-content exam-question-content"><span className="question-type-chip">{question.type === 'single' ? '单选题' : question.type === 'multiple' ? '多选题' : '判断题'}</span><h2>{question.stem}</h2><div className="answer-options">{Object.entries(question.options).map(([letter, text]) => {
      const selected = draft.answer.includes(letter);
      return <button key={letter} type="button" className={`answer-option${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => choose(letter)}><span className={question.type === 'multiple' ? 'option-checkbox' : 'option-radio'}>{selected && <IconCheck size={13} />}</span><strong>{letter}.</strong><span>{text}</span></button>;
    })}</div></div><div className="exam-answer-footer"><button disabled={position <= 1} onClick={() => jump(position - 1)}>上一题</button><button className="question-panel-trigger" onClick={() => setPanelOpen(true)}><IconGridDots size={18} /><small>答题卡</small></button><button className="next-question" disabled={position >= (exam?.questions.length ?? 180)} onClick={() => jump(position + 1)}>下一题</button></div>
  </> : null;
  const numberGrid = exam?.questions.map(item => {
    const saved = drafts[item.position] ?? { answer: item.answer, marked: item.marked };
    return <button key={item.position} type="button" className={`${item.position === position ? 'is-current' : ''}${saved.answer.length ? ' is-answered' : ''}${saved.marked ? ' is-marked' : ''}`} aria-label={`${item.position} 题${saved.answer.length ? '已答' : '未答'}${saved.marked ? '待检查' : ''}`} onClick={() => jump(item.position)}>{item.position}</button>;
  });

  if (preview) return <PreviewExamAnswer />;
  const mobile = <Screen className="exam-answer-screen"><div className="exam-timer-row"><div className="timer-display"><IconClockHour4 size={22} /><strong>{exam ? time : '--:--'}</strong></div><button className="exam-submit" onClick={() => setConfirmOpen(true)} disabled={!exam || submitting}>交卷</button></div>
    <div className="exam-question-tools"><span>{question && exam ? `${position} / ${exam.questions.length}` : '— / —'}</span><button className={draft.marked ? 'is-marked' : ''} onClick={() => question && sync(position, { ...draft, marked: !draft.marked })} disabled={!question}><IconStar size={17} />{draft.marked ? '已标记' : '标记'}</button></div>
    {loading ? <div className="empty-state"><IconRefresh size={25} /><strong>正在恢复服务器考试…</strong><span>读取服务器截止时间和已确认答案。</span></div> : error && !exam ? <div className="empty-state"><IconWifi size={25} /><strong>考试读取失败</strong><span>{error}</span><Button onClick={() => void load()}>重试</Button></div> : exam ? <><div className="exam-sync"><span className={`sync-dot${syncState === 'confirmed' ? ' is-confirmed' : ''}`} />{syncText}{syncState === 'offline' && <button onClick={retrySync}>重试同步</button>}</div>{questionCard}</> : <div className="empty-state"><IconWifi size={25} /><strong>当前没有进行中的考试</strong><span>正式题目和截止时间由服务器控制。</span><Link className="mobile-button" to={href('/exams')}>返回考试设置</Link></div>}
    {error && exam && <p className="form-error" role="alert">{error}</p>}
    {panelOpen && exam && <div className="sheet-backdrop" onClick={() => setPanelOpen(false)}><section className="question-sheet" role="dialog" aria-modal="true" aria-label="答题卡" onClick={event => event.stopPropagation()}><div className="sheet-heading"><strong>答题卡</strong><button onClick={() => setPanelOpen(false)} aria-label="关闭答题卡"><IconX size={21} /></button></div><p>已答 {Object.values(drafts).filter(item => item.answer.length).length} 题 · 待检查 {Object.values(drafts).filter(item => item.marked).length} 题</p><div className="question-number-grid">{numberGrid}</div><small>绿色为已答，黄色边框为待检查；选题可跳转。</small></section></div>}
    {confirmOpen && <div className="sheet-backdrop exam-confirm-backdrop"><section className="exam-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-submit-confirm"><h2 id="exam-submit-confirm">确认交卷？</h2><p>交卷后服务器立即评分；未作答计 0 分，不能再修改答案。</p><div><Button secondary onClick={() => setConfirmOpen(false)} disabled={submitting}>继续答题</Button><Button onClick={() => void finish()} disabled={submitting || syncState !== 'confirmed'}>{submitting ? '正在交卷…' : '确认交卷'}</Button></div>{syncState !== 'confirmed' && <small>请等待答案获得服务器确认。</small>}</section></div>}
  </Screen>;
  const desktop = <main className="desktop-practice-page desktop-exam-answer"><div className="desktop-practice-heading"><div><span>学习中心 / 模拟考试</span><h1>模拟考试答题</h1></div><strong>{time}</strong></div>{exam ? <><div className="exam-sync">{syncText}</div>{questionCard}<div className="desktop-question-number-grid">{numberGrid}</div><button className="button button-primary" onClick={() => setConfirmOpen(true)}>交卷</button></> : <div className="desktop-practice-empty">{loading ? '正在恢复考试…' : error || '当前没有进行中的考试。'} <button onClick={() => void load()}>重试</button></div>}</main>;
  return <Responsive mobile={mobile} desktop={desktop} />;
}

function PreviewExamAnswer() {
  const navigate = useNavigate();
  const [position, setPosition] = useState(36);
  const [seconds, setSeconds] = useState(89 * 60 + 24);
  const [marked, setMarked] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, []);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return <Screen className="exam-answer-screen"><div className="exam-timer-row"><div className="timer-display"><IconClockHour4 size={22} /><strong>{clock}</strong></div><button className="exam-submit" onClick={() => navigate(href('/exams/result'))}>交卷</button></div><div className="exam-question-tools"><span>{position} / 180</span><button className={marked ? 'is-marked' : ''} onClick={() => setMarked(value => !value)}><IconStar size={17} />标记</button></div><div className="exam-sync">开发预览倒计时，不代表服务器考试</div><div className="question-content exam-question-content"><span className="question-type-chip">多选题</span><h2>以下哪些属于正确的安全措施？</h2>{['A', 'B', 'C', 'D'].map(letter => <div className="answer-option" key={letter}><strong>{letter}.</strong><span>开发测试选项，不会提交真实考试。</span></div>)}</div><div className="exam-answer-footer"><button onClick={() => setPosition(value => Math.max(1, value - 1))}>上一题</button><button className="question-panel-trigger" onClick={() => setOpen(true)}><IconGridDots size={18} /><small>答题卡</small></button><button className="next-question" onClick={() => setPosition(value => Math.min(180, value + 1))}>下一题</button></div>{open && <div className="sheet-backdrop" onClick={() => setOpen(false)}><section className="question-sheet" role="dialog" aria-modal="true" aria-label="答题卡"><div className="sheet-heading"><strong>开发预览答题卡</strong><button onClick={() => setOpen(false)} aria-label="关闭答题卡">关闭</button></div><div className="question-number-grid">{Array.from({ length: 180 }, (_, index) => <button key={index} onClick={() => { setPosition(index + 1); setOpen(false); }}>{index + 1}</button>)}</div></section></div>}</Screen>;
}

export function ExamResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const preview = import.meta.env.DEV && previewMode(location.search);
  const examId = new URLSearchParams(location.search).get('exam') ?? '';
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  useEffect(() => {
    if (preview || !examId || !user || user.mustChangePassword) {
      setLoading(false);
      if (!preview && (!user || user.mustChangePassword)) setError(user?.mustChangePassword ? '请先修改初始密码。' : '请先登录后查看考试结果。');
      return;
    }
    let alive = true; setLoading(true);
    getExam(examId).then(value => { if (alive) setResult(value.result); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : '成绩读取失败。'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [examId, preview, user?.id, user?.mustChangePassword]);
  const content = result ? <>
    <section className="score-hero"><span className="trophy-orb"><IconTrophy size={44} /></span><strong>{result.score.total} <small>分</small></strong><span>{result.score.passed ? '达到题库及格线' : `题库及格线 ${result.score.passingScore} 分`}</span></section>
    <div className="result-summary-grid"><div><strong>{result.counts.correct}</strong><small>答对</small></div><div><strong>{result.counts.wrong}</strong><small>答错</small></div><div><strong>{result.counts.unanswered}</strong><small>未作答</small></div><div><strong>{formatDuration(result.durationSeconds)}</strong><small>用时</small></div></div>
    <section className="score-breakdown"><ScoreRow title="单选题" value={`${result.score.single} 分`} percentage={`${result.score.maximum ? result.score.single / result.score.maximum * 100 : 0}%`} tone="green" /><ScoreRow title="多选题" value={`${result.score.multiple} 分`} percentage={`${result.score.maximum ? result.score.multiple / result.score.maximum * 100 : 0}%`} tone="blue" /><ScoreRow title="判断题" value={`${result.score.judgement} 分`} percentage={`${result.score.maximum ? result.score.judgement / result.score.maximum * 100 : 0}%`} tone="purple" /></section>
    <section className="exam-review-list"><h2>试卷复盘 · {result.questions.length} 题</h2>{result.questions.map(item => <article key={item.position} className={`exam-review-item${item.isCorrect === true ? ' is-correct' : item.isCorrect === false ? ' is-wrong' : ''}`}><header><strong>{item.position}. {typeName(item.type)}</strong><span>{item.earnedPoints} / {item.points} 分</span></header><p>{item.stem}</p><div>{Object.entries(item.options).map(([letter, text]) => <span key={letter} className={item.correctAnswer.includes(letter) ? 'is-answer' : item.userAnswer.includes(letter) ? 'is-user-answer' : ''}>{letter}. {text}</span>)}</div><small>你的答案：{item.userAnswer.join('、') || '未作答'} · 标准答案：{item.correctAnswer.join('、')}</small></article>)}</section>
  </> : null;
  const blank = <div className="empty-state"><IconWifi size={26} /><strong>{loading ? '正在读取考试结果…' : error || '考试成绩尚未生成'}</strong><span>{!loading && !error ? '服务器结束考试后才能查看答案和完整复盘。' : ''}{error}</span>{error && <Button onClick={() => navigate('/records')}>返回考试记录</Button>}</div>;
  const previewResult = <><section className="score-hero"><span className="trophy-orb"><IconTrophy size={44} /></span><strong>86.5 <small>分</small></strong><span>开发预览测试数据 · 不代表真实成绩</span></section><div className="result-summary-grid"><div><strong>155</strong><small>答对</small></div><div><strong>17</strong><small>答错</small></div><div><strong>8</strong><small>未作答</small></div><div><strong>90 分钟</strong><small>用时</small></div></div><section className="score-breakdown"><ScoreRow title="单选题" value="56 / 60 分" percentage="93%" tone="green" /><ScoreRow title="多选题" value="18 / 20 分" percentage="90%" tone="blue" /><ScoreRow title="判断题" value="12.5 / 20 分" percentage="62.5%" tone="purple" /></section></>;
  const mobile = <Screen className="exam-result-screen"><Header title="考试结果" back="/records" />{preview ? previewResult : content ?? blank}<div className="result-action-row"><Link className="mobile-button is-secondary" to={href('/records')}>考试记录</Link><Link className="mobile-button" to={href('/')}>返回首页</Link></div></Screen>;
  const desktop = <main className="desktop-practice-page desktop-exam-result"><div className="desktop-practice-heading"><div><span>学习中心 / 考试记录</span><h1>考试成绩与试卷复盘</h1></div></div>{preview ? previewResult : content ?? blank}</main>;
  return <Responsive mobile={mobile} desktop={desktop} />;
}

function ScoreRow({ title, value, percentage, tone }: { title: string; value: string; percentage: string; tone: string }) {
  return <div className="score-row"><div><strong>{title}</strong><span>{value}</span></div><div className={`score-track tone-${tone}`}><i style={{ width: percentage }} /></div></div>;
}
function typeName(type: ExamQuestion['type']) { return type === 'single' ? '单选题' : type === 'multiple' ? '多选题' : '判断题'; }
function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`; }

export function ExamRecordsPage() {
  const location = useLocation();
  const preview = import.meta.env.DEV && previewMode(location.search);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBank } = useBanks();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (preview || !user || user.mustChangePassword) { setLoading(false); return; }
    let alive = true;
    getExamHistory(activeBank?.id).then(value => { if (alive) setItems(value.items); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : '考试记录读取失败。'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [preview, user?.id, user?.mustChangePassword, activeBank?.id]);
  const rows = items.map(item => <button key={String(item.id)} className="exam-history-row" onClick={() => navigate(item.status === 'in_progress' ? `/exams/answer?exam=${item.id}` : `/exams/result?exam=${item.id}`)}><span><strong>{String(item.bankName)} · {item.status === 'in_progress' ? '进行中' : '已结束'}</strong><small>{item.submittedAt ? new Date(String(item.submittedAt)).toLocaleString('zh-CN') : '尚未交卷'} · 版本 {String(item.bankVersionId).slice(0, 8)}</small></span><b>{item.totalScore == null ? '继续考试' : `${item.totalScore} 分`}</b><IconChevronRight size={18} /></button>);
  const blank = <div className="empty-state"><IconFileText size={26} /><strong>{loading ? '正在读取考试记录…' : error || (preview ? '开发预览不包含正式考试历史。' : '暂无模拟考试记录')}</strong><span>{error || (!loading ? '完成模拟考试后，成绩和历史试卷会保存在本机服务端。' : '')}</span></div>;
  return <Responsive mobile={<Screen className="exam-records-screen"><Header title="考试记录" />{rows.length ? <section className="exam-history-list">{rows}</section> : blank}<Link className="mobile-button" to={href('/exams')}>模拟考试</Link></Screen>} desktop={<main className="desktop-practice-page desktop-exam-records"><div className="desktop-practice-heading"><div><span>学习中心 / 记录</span><h1>考试记录</h1><p>历史成绩和试卷快照由本机服务端保存。</p></div></div>{rows.length ? <section className="exam-history-list">{rows}</section> : blank}</main>} />;
}
