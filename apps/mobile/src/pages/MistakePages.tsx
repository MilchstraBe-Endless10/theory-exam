import { useEffect, useMemo, useState } from 'react';
import { IconArrowLeft, IconBook, IconCheck, IconChevronRight, IconCircleCheck, IconClockHour4, IconFileText, IconFlag, IconRefresh, IconWifi, IconX } from '@tabler/icons-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBanks } from '../services/banks';
import { previewMode } from '../services/api';
import {
  createReviewRound, exitReviewRound, getActiveReviewRound, getMistakeStats, getReviewQuestion,
  getReviewResults, getReviewRound, getReviewResult, getReviewHistory, listMistakes, moveReviewPosition,
  resumeReviewRound, submitReviewAnswer, type MasteryStatus, type MistakeItem, type ReviewFeedback,
  type ReviewQuestion, type ReviewQuestionPosition, type ReviewRound, type ReviewScope, type ReviewTypeFilter,
} from '../services/reviews';

const preview = import.meta.env.DEV && previewMode();
const href = (path: string) => preview ? `${path}${path.includes('?') ? '&' : '?'}preview=1` : path;
const masteryLabel: Record<MasteryStatus, string> = { review: '待复习', reinforcing: '巩固中', mastered: '已掌握' };
const typeLabel: Record<ReviewTypeFilter, string> = { all: '全部题型', single: '单选题', multiple: '多选题', judgement: '判断题' };

function StatusBar() {
  return <div className="mobile-statusbar" aria-hidden="true"><span>9:41</span><span>● ▮ ▰</span></div>;
}

function MobileHeader({ title, back = '/mistakes' }: { title: string; back?: string }) {
  return <header className="mobile-page-header"><Link className="back-button" to={href(back)} aria-label="返回"><IconArrowLeft size={22} /></Link><h1>{title}</h1><span className="header-placeholder" /></header>;
}

function PreviewBadge() {
  return preview ? <span className="preview-badge">开发预览 · 测试数据</span> : null;
}

function MobileScreen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <main className={`mobile-screen is-immersive ${className}`}><StatusBar />{children}</main>;
}

function ErrorBox({ children, onRetry }: { children: string; onRetry?: () => void }) {
  return <div className="mistake-message" role="alert"><IconWifi size={20} /><span>{children}</span>{onRetry && <button onClick={onRetry}>重试</button>}</div>;
}

function StatTiles({ stats }: { stats: { review: number; reinforcing: number; mastered: number } | null }) {
  return <section className="mistake-stats" aria-label="错题掌握状态">
    <div className="tone-red"><IconFileText size={18} /><strong>{stats?.review ?? (preview ? 38 : '—')}</strong><small>待复习</small></div>
    <div className="tone-amber"><IconClockHour4 size={18} /><strong>{stats?.reinforcing ?? (preview ? 12 : '—')}</strong><small>巩固中</small></div>
    <div className="tone-green"><IconCircleCheck size={18} /><strong>{stats?.mastered ?? (preview ? 74 : '—')}</strong><small>已掌握</small></div>
  </section>;
}

export function MistakesPage() {
  const { user } = useAuth();
  const { activeBank: bank, loading: bankLoading, error: bankError } = useBanks();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getMistakeStats>> | null>(null);
  const [history, setHistory] = useState<Array<Awaited<ReturnType<typeof getReviewHistory>>['items'][number]>>([]);
  const [active, setActive] = useState<{ round: ReviewRound; currentQuestion: ReviewQuestionPosition | null } | null>(null);
  const [masteredItems, setMasteredItems] = useState<MistakeItem[]>([]);
  const [scope, setScope] = useState<ReviewScope>('pending');
  const [questionType, setQuestionType] = useState<ReviewTypeFilter>('all');
  const [strategy, setStrategy] = useState<'random' | 'weak'>('random');
  const [quantity, setQuantity] = useState<'10' | '20' | 'all'>('20');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (preview || !user || !bank || user.mustChangePassword) {
      setStats(null); setHistory([]); setActive(null); setLoading(false); setError(''); return;
    }
    let alive = true;
    setLoading(true); setError('');
    Promise.all([getMistakeStats(bank.id), getReviewHistory(bank.id), getActiveReviewRound(bank.id)])
      .then(([nextStats, nextHistory, nextActive]) => {
        if (!alive) return;
        setStats(nextStats); setHistory(nextHistory.items); setActive(nextActive.round ? nextActive as typeof active : null);
      })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : '错题数据读取失败，请检查服务器连接。'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id, user?.mustChangePassword, bank?.id, refreshKey]);

  useEffect(() => {
    if (preview || scope !== 'mastered' || !bank || !user || user.mustChangePassword) { setMasteredItems([]); return; }
    let alive = true;
    listMistakes(bank.id, 'mastered', questionType).then(value => { if (alive) setMasteredItems(value.items); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : '已掌握题目读取失败。'); });
    return () => { alive = false; };
  }, [scope, questionType, bank?.id, user?.id, user?.mustChangePassword]);

  const typeCounts = useMemo(() => {
    if (!stats) return { review: 0, reinforcing: 0, mastered: 0 };
    if (questionType === 'all') return { review: stats.review, reinforcing: stats.reinforcing, mastered: stats.mastered };
    return stats.byType[questionType];
  }, [stats, questionType]);
  const availableCount = scope === 'mastered' ? typeCounts.mastered : typeCounts.review + typeCounts.reinforcing;

  const start = async () => {
    if (preview) { navigate(href('/mistakes/review?round=preview-round')); return; }
    if (!user) { navigate('/login'); return; }
    if (user.mustChangePassword) { setError('请先修改初始密码，再开始错题复习。'); return; }
    if (!bank) { setError(bankError || '当前没有可用题库。'); return; }
    setStarting(true); setError('');
    try {
      const result = await createReviewRound({ bankId: bank.id, questionType, strategy, quantity, masteryStatus: scope });
      navigate(`/mistakes/review?round=${encodeURIComponent(result.round.id)}${result.round.reducedToAvailable ? `&available=${result.availableCount}&requested=${quantity}` : ''}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '复习轮次创建失败。'); }
    finally { setStarting(false); }
  };

  const resume = async () => {
    if (!active) return;
    setStarting(true); setError('');
    try {
      const result = await resumeReviewRound(active.round.id);
      navigate(`/mistakes/review?round=${encodeURIComponent(result.round.id)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '恢复复习轮次失败。'); }
    finally { setStarting(false); }
  };

  const controls = <>
    <div className="mistake-scope-tabs" role="tablist" aria-label="错题状态">
      <button role="tab" aria-selected={scope === 'pending'} className={scope === 'pending' ? 'is-active' : ''} onClick={() => setScope('pending')}>待复习 · {stats ? stats.review + stats.reinforcing : preview ? 50 : '—'}</button>
      <button role="tab" aria-selected={scope === 'mastered'} className={scope === 'mastered' ? 'is-active' : ''} onClick={() => setScope('mastered')}>已掌握 · {stats?.mastered ?? (preview ? 74 : '—')}</button>
    </div>
    <fieldset className="mistake-type-fieldset"><legend>题型筛选</legend><div className="mistake-type-options">{(['all', 'single', 'multiple', 'judgement'] as const).map(type => <button key={type} type="button" className={questionType === type ? 'is-selected' : ''} aria-pressed={questionType === type} onClick={() => setQuestionType(type)}>{typeLabel[type]}{type !== 'all' && <small>{preview ? (type === 'single' ? 26 : type === 'multiple' ? 4 : 8) : stats ? stats.byType[type][scope === 'mastered' ? 'mastered' : 'review'] + (scope === 'pending' ? stats.byType[type].reinforcing : 0) : '—'}</small>}</button>)}</div></fieldset>
    <section className="mistake-options">
      <button type="button" className="priority-setting" role="switch" aria-checked={strategy === 'weak'} onClick={() => setStrategy(value => value === 'weak' ? 'random' : 'weak')}><span><IconFlag size={17} /><span><strong>薄弱题优先</strong><small>先复习待复习题，再按历史错误次数排序</small></span></span><span className={`toggle${strategy === 'weak' ? ' is-on' : ''}`}><i /></span></button>
      <label className="option-setting"><span><IconFileText size={17} />复习数量</span><select value={quantity} onChange={event => setQuantity(event.target.value as typeof quantity)}><option value="10">10 题</option><option value="20">20 题</option><option value="all">全部可用错题</option></select></label>
    </section>
    <p className="mastery-note">连续答对需要发生在不同复习轮次。同一轮重复提交不会增加掌握度；普通练习和模拟考试答对不计入复习轮次。</p>
  </>;

  return <><div className="mobile-route"><MobileScreen className="mistakes-screen"><MobileHeader title="错题复习" /><PreviewBadge /><StatTiles stats={stats} />
    {active && <section className="mistake-resume-card"><span><strong>有一轮复习尚未完成</strong><small>已答 {active.round.submittedCount} / {active.round.questionCount} 题 · 第 {active.round.currentPosition} 题</small></span><button onClick={() => void resume()} disabled={starting}>继续复习 <IconChevronRight size={17} /></button></section>}
    {controls}
    {scope === 'mastered' && <section className="mastered-list"><h2>已掌握错题</h2>{preview ? <p>开发预览示例 · 正式掌握记录从服务端读取</p> : masteredItems.length ? masteredItems.slice(0, 12).map(item => <div key={item.questionId} className="mastered-item"><span className="mastery-pill is-mastered">已掌握</span><strong>{item.type === 'single' ? '单选' : item.type === 'multiple' ? '多选' : '判断'}</strong><p>{item.stem}</p><small>累计错误 {item.wrongCount} 次 · 连续正确 {item.consecutiveCorrectRounds} 个复习轮次</small></div>) : <p>{loading ? '正在读取…' : '当前筛选下没有已掌握错题。'}</p>}</section>}
    {scope === 'pending' && <div className="mistake-count-note">当前筛选可复习 <strong>{preview ? availableCount : loading ? '…' : stats ? availableCount : '—'}</strong> 题{availableCount > 0 && quantity !== 'all' && availableCount < Number(quantity) ? `，将按实际数量复习 ${availableCount} 题` : ''}</div>}
    {error && <ErrorBox onRetry={() => setRefreshKey(value => value + 1)}>{error}</ErrorBox>}
    {!user && !preview && <div className="mistake-empty"><IconWifi size={27} /><strong>登录后读取个人错题</strong><span>错题与掌握状态由本机服务端按账号隔离。</span><Link className="mobile-button" to="/login">前往登录</Link></div>}
    {bank && stats && !availableCount && scope === 'pending' && <div className="mistake-empty"><IconCircleCheck size={27} /><strong>当前没有待复习错题</strong><span>正式作答答错后，题目会出现在这里。</span></div>}
    <section className="review-history-list"><div><h2>复习历史</h2><button onClick={() => setRefreshKey(value => value + 1)} aria-label="刷新错题数据"><IconRefresh size={17} /></button></div>{preview ? <p>开发预览中不展示正式复习记录。</p> : history.length ? history.slice(0, 5).map(item => <Link key={item.id} to={`/mistakes/history/${encodeURIComponent(item.id)}`} className="review-history-row"><span><strong>{item.status === 'completed' ? '已完成复习' : item.status === 'exited' ? '已暂时退出' : '进行中的复习'}</strong><small>{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.questionType === 'all' ? '混合题型' : typeLabel[item.questionType]} · {item.answeredCount}/{item.questionCount} 题</small></span><b>{item.questionCount ? `${Math.round(item.correctCount / item.questionCount * 100)}%` : '—'}</b><IconChevronRight size={17} /></Link>) : <p>{loading ? '正在读取复习历史…' : '暂无复习历史。'}</p>}</section>
    <div className="mistake-footer"><button className="mobile-button" onClick={() => void start()} disabled={starting || (!preview && (!user || !bank || !availableCount || (scope === 'mastered' && !availableCount)))}>{starting ? '正在创建复习轮次…' : scope === 'mastered' ? '重新复习已掌握错题' : '开始复习'} <IconChevronRight size={18} /></button><small>{bank?.name ?? (bankLoading ? '正在读取题库…' : bankError || '连接并登录后读取当前题库')}</small></div>
  </MobileScreen></div><div className="desktop-route"><DesktopMistakes bankName={bank?.name} stats={stats} history={history} active={active} controls={controls} error={error} loading={loading} scope={scope} availableCount={availableCount} starting={starting} start={() => void start()} resume={() => void resume()} onHistory={() => setRefreshKey(value => value + 1)} /></div></>;
}

function DesktopMistakes({ bankName, stats, history, active, controls, error, loading, scope, availableCount, starting, start, resume, onHistory }: {
  bankName?: string; stats: Awaited<ReturnType<typeof getMistakeStats>> | null;
  history: Array<Awaited<ReturnType<typeof getReviewHistory>>['items'][number]>;
  active: { round: ReviewRound; currentQuestion: ReviewQuestionPosition | null } | null;
  controls: React.ReactNode; error: string; loading: boolean; scope: ReviewScope; availableCount: number;
  starting: boolean; start: () => void; resume: () => void; onHistory: () => void;
}) {
  return <main className="desktop-practice-page desktop-mistakes-page"><div className="desktop-practice-heading"><div><span>学习中心 / 错题复习</span><h1>错题复习与掌握度</h1><p>{bankName ? `当前题库：${bankName} · 正式错题记录来自本机服务端` : '连接并登录本机服务端后读取真实错题。'}</p></div><button className="button button-outline" onClick={onHistory}>刷新数据</button></div>
    <StatTiles stats={stats} />{active && <section className="mistake-resume-card"><span><strong>有一轮复习尚未完成</strong><small>已答 {active.round.submittedCount} / {active.round.questionCount} 题 · 第 {active.round.currentPosition} 题</small></span><button onClick={resume} disabled={starting}>继续复习 <IconChevronRight size={17} /></button></section>}
    <section className="desktop-mistake-workspace"><div className="desktop-mistake-settings">{controls}<div className="mistake-count-note">当前筛选可复习 <strong>{stats ? availableCount : '—'}</strong> 题。正式掌握度仅由不同复习轮次更新。</div>{error && <ErrorBox>{error}</ErrorBox>}<button className="button button-primary" disabled={starting || !stats || !availableCount} onClick={start}>{starting ? '正在创建…' : scope === 'mastered' ? '重新复习已掌握错题' : '开始复习'} <IconChevronRight size={18} /></button></div>
      <section className="review-history-list"><div><h2>复习历史</h2><button onClick={onHistory} aria-label="刷新复习历史"><IconRefresh size={17} /></button></div>{history.length ? history.slice(0, 8).map(item => <Link key={item.id} to={`/mistakes/history/${encodeURIComponent(item.id)}`} className="review-history-row"><span><strong>{item.status === 'completed' ? '已完成复习' : item.status === 'exited' ? '已暂时退出' : '进行中的复习'}</strong><small>{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.questionCount} 题</small></span><b>{item.answeredCount}/{item.questionCount} 已答</b><IconChevronRight size={17} /></Link>) : <p>{loading ? '正在读取…' : '暂无复习历史。'}</p>}</section></section>
  </main>;
}

const previewQuestion: ReviewQuestion = {
  id: 'preview-question', bankId: 'preview-bank', bankVersionId: 'preview-version', type: 'single',
  stem: '开发预览：进行设备维护前，首先应当完成哪项工作？',
  options: { A: '确认设备断电并执行现场安全检查', B: '直接拆卸防护装置', C: '通知无关人员进入现场', D: '跳过检查以节省时间' },
  source: { sheet: '预览样例', row: 1 }, masteryStatus: 'review', wrongCount: 2, consecutiveCorrectRounds: 0,
};

export function ReviewAnswerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const roundId = params.get('round') ?? '';
  const requestedPosition = Number(params.get('position') ?? 0);
  const reduced = params.get('available');
  const requested = params.get('requested');
  const [round, setRound] = useState<ReviewRound | null>(null);
  const [current, setCurrent] = useState<ReviewQuestionPosition | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<ReviewFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (preview) {
      const demoRound: ReviewRound = { id: 'preview-round', bankId: 'preview-bank', bankVersionId: 'preview-version', questionType: 'single', strategy: 'weak', quantity: '10', masteryStatus: 'pending', availableCount: 3, questionCount: 3, currentPosition: 1, submittedCount: 0, status: 'in_progress', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, exitedAt: null, reducedToAvailable: true };
      setRound(demoRound); setCurrent({ question: previewQuestion, position: 1, total: 3, submitted: false, userAnswer: null }); setLoading(false); setError(''); return;
    }
    if (!roundId) { setLoading(false); setError('缺少复习轮次编号。'); return; }
    let alive = true;
    setLoading(true); setError('');
    (async () => {
      let state = await getReviewRound(roundId);
      if (state.round.status === 'completed') { navigate(`/mistakes/history/${encodeURIComponent(roundId)}`, { replace: true }); return; }
      if (state.round.status === 'exited') state = await resumeReviewRound(roundId);
      const position = requestedPosition || state.round.currentPosition;
      if (position !== state.round.currentPosition) state = await moveReviewPosition(roundId, position);
      const question = state.currentQuestion ?? await getReviewQuestion(roundId, position);
      let savedFeedback: ReviewFeedback | null = null;
      if (question.submitted) savedFeedback = (await getReviewResult(roundId, question.position)).result;
      if (!alive) return;
      setRound(state.round); setCurrent(question); setSelected(question.userAnswer ?? []); setFeedback(savedFeedback);
    })().catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : '复习题目读取失败。'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [roundId, requestedPosition, retryKey, navigate]);

  const select = (letter: string) => {
    if (feedback || current?.submitted) return;
    setError('');
    setSelected(values => current?.question.type === 'multiple'
      ? values.includes(letter) ? values.filter(value => value !== letter) : [...values, letter].sort()
      : [letter]);
  };

  const submit = async () => {
    if (!round || !current || !selected.length || current.submitted || submitting) return;
    setSubmitting(true); setError('');
    try {
      if (preview) {
        const correct = selected.length === 1 && selected[0] === 'A';
        const next = { attemptId: 'preview-attempt', isCorrect: correct, userAnswer: selected, correctAnswer: ['A'], correctOptions: { A: previewQuestion.options.A! }, explanation: '原题库未提供解析', submittedAt: new Date().toISOString(), mastery: { status: correct ? 'reinforcing' : 'review' } as { status: MasteryStatus; consecutiveCorrectRounds: number }, progress: { submittedCount: 1, totalQuestions: 3, currentPosition: 1, status: 'in_progress' as const } };
        next.mastery.consecutiveCorrectRounds = correct ? 1 : 0;
        setFeedback(next); setCurrent(value => value ? { ...value, submitted: true, userAnswer: selected } : value);
      } else {
        const result = await submitReviewAnswer(round.id, selected);
        setFeedback(result); setRound(value => value ? { ...value, submittedCount: result.progress.submittedCount, status: result.progress.status, currentPosition: result.progress.currentPosition, updatedAt: result.submittedAt, completedAt: result.progress.status === 'completed' ? result.submittedAt : value.completedAt } : value);
        setCurrent(value => value ? { ...value, submitted: true, userAnswer: result.userAnswer } : value);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '网络失败，服务器没有确认保存，请检查连接后重试。'); }
    finally { setSubmitting(false); }
  };

  const move = async (position: number) => {
    if (!round || !current || position < 1 || position > current.total) return;
    if (preview) {
      setRound(value => value ? { ...value, currentPosition: position } : value);
      setCurrent({ question: previewQuestion, position, total: 3, submitted: false, userAnswer: null }); setSelected([]); setFeedback(null); return;
    }
    setLoading(true); setError('');
    try { navigate(`/mistakes/review?round=${encodeURIComponent(round.id)}&position=${position}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '题目切换失败。'); }
    finally { setLoading(false); }
  };

  const exit = async () => {
    if (!round) return;
    if (!preview) {
      try { await exitReviewRound(round.id); }
      catch (reason) { setError(reason instanceof Error ? reason.message : '保存退出状态失败。'); return; }
    }
    navigate(href('/mistakes'));
  };

  const feedbackPanel = feedback && current ? <section className={`answer-feedback${feedback.isCorrect ? ' is-correct' : ''}`}><span className="feedback-icon">{feedback.isCorrect ? <IconCheck size={22} /> : <IconX size={22} />}</span><div><strong>{feedback.isCorrect ? '回答正确' : '回答错误'}</strong><span>你的答案：{feedback.userAnswer.join('、')}</span><span>标准答案：{feedback.correctAnswer.join('、')}</span><span>掌握状态：{masteryLabel[feedback.mastery.status]} · 连续正确 {feedback.mastery.consecutiveCorrectRounds} 个复习轮次</span></div></section> : null;
  const answers = feedback ? new Set(feedback.userAnswer) : new Set<string>();
  const correct = feedback ? new Set(feedback.correctAnswer) : new Set<string>();
  const questionBody = current ? <><div className="mistake-question-meta"><span className="question-type-chip">{current.question.type === 'single' ? '单选题' : current.question.type === 'multiple' ? '多选题' : '判断题'}</span><span className={`mastery-pill is-${current.question.masteryStatus}`}>{masteryLabel[current.question.masteryStatus]}</span><span>历史错误 {current.question.wrongCount} 次</span></div><h2>{current.question.stem}</h2><div className="answer-options">{Object.entries(current.question.options).map(([letter, label]) => {
    const isCorrect = correct.has(letter); const isWrong = feedback && answers.has(letter) && !isCorrect;
    return <button key={letter} type="button" disabled={Boolean(feedback) || current.submitted} className={`answer-option${selected.includes(letter) ? ' is-selected' : ''}${feedback && isCorrect ? ' is-correct' : ''}${isWrong ? ' is-wrong' : ''}`} aria-pressed={selected.includes(letter)} onClick={() => select(letter)}><span className={current.question.type === 'multiple' ? 'option-checkbox' : 'option-radio'}>{feedback && isCorrect ? <IconCheck size={13} /> : isWrong ? <IconX size={13} /> : selected.includes(letter) ? current.question.type === 'multiple' ? <IconCheck size={13} /> : <i /> : null}</span><strong>{letter}.</strong><span>{label}</span></button>;
  })}</div>{feedback && <div className="standard-answer">标准答案：{feedback.correctAnswer.map(letter => `${letter}. ${feedback.correctOptions[letter]}`).join('；')}<small>{feedback.explanation}</small></div>}</> : null;
  const actions = current && round ? <div className="mistake-answer-actions"><button className="mobile-button is-secondary" disabled={loading || current.position <= 1} onClick={() => void move(current.position - 1)}>上一题</button>{!feedback ? <button className="mobile-button" disabled={submitting || !selected.length} onClick={() => void submit()}>{submitting ? '正在保存…' : '提交答案'}</button> : round.status === 'completed' ? <Link className="mobile-button" to={preview ? href('/mistakes') : `/mistakes/history/${encodeURIComponent(round.id)}`}>查看本轮结果</Link> : <button className="mobile-button" disabled={loading || current.position >= current.total} onClick={() => void move(current.position + 1)}>下一题 <IconChevronRight size={18} /></button>}<button className="mobile-button is-secondary" disabled={loading} onClick={() => void exit()}>暂时退出</button></div> : null;

  return <><div className="mobile-route"><MobileScreen className="mistakes-screen review-answer-screen"><MobileHeader title="错题复习" /><PreviewBadge />{reduced && <p className="mistake-reduced-note">符合筛选条件的错题为 {reduced} 道，少于选择的 {requested} 道；本轮按实际数量复习 {reduced} 道题。</p>}
    {loading && <div className="mistake-empty"><IconRefresh size={24} /><strong>正在恢复复习轮次…</strong></div>}{error && !current && <ErrorBox onRetry={() => setRetryKey(value => value + 1)}>{error}</ErrorBox>}
    {current && <><div className="review-position"><span>第 <strong>{current.position}</strong> / {current.total} 题</span><span>已完成 {round?.submittedCount ?? 0} 题</span></div>{feedbackPanel}<section className="mistake-question-card">{questionBody}</section>{error && <p className="form-error" role="alert">{error}</p>}{actions}</>}
  </MobileScreen></div><div className="desktop-route"><main className="desktop-practice-page desktop-practice-question"><div className="desktop-practice-heading"><div><span>学习中心 / 错题复习</span><h1>复习答题</h1></div>{current && <strong>{current.position} / {current.total}</strong>}</div>{error && !current && <ErrorBox>{error}</ErrorBox>}{loading ? <div className="desktop-practice-empty">正在恢复复习轮次…</div> : current && round ? <><div className="review-position"><span>已提交 {round.submittedCount} / {round.questionCount} 题</span><span>{masteryLabel[current.question.masteryStatus]} · 错误 {current.question.wrongCount} 次</span></div>{feedbackPanel}<section className="desktop-question-card">{questionBody}</section>{error && <p className="form-error">{error}</p>}{actions}</> : <div className="desktop-practice-empty">{error || '复习轮次不存在或当前账号无权访问。'}</div>}</main></div></>;
}

export function ReviewHistoryDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getReviewResults>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) {
      const now = new Date().toISOString();
      const round: ReviewRound = { id: 'preview-round', bankId: 'preview-bank', bankVersionId: 'preview-version', questionType: 'single', strategy: 'weak', quantity: '10', masteryStatus: 'pending', availableCount: 3, questionCount: 3, currentPosition: 3, submittedCount: 3, status: 'completed', createdAt: now, updatedAt: now, completedAt: now, exitedAt: null, reducedToAvailable: true };
      const result = (isCorrect: boolean, position: number): ReviewFeedback => ({ attemptId: `preview-attempt-${position}`, isCorrect, userAnswer: isCorrect ? ['A'] : ['B'], correctAnswer: ['A'], correctOptions: { A: previewQuestion.options.A! }, explanation: '原题库未提供解析', submittedAt: now, mastery: { status: isCorrect ? 'mastered' : 'review', consecutiveCorrectRounds: isCorrect ? 2 : 0 }, progress: { submittedCount: 3, totalQuestions: 3, currentPosition: position, status: 'completed' } });
      setLoading(false); setData({ round, items: [1, 2, 3].map(position => ({ position, question: previewQuestion, result: result(position !== 2, position) })) }); return;
    }
    if (!id) { setLoading(false); setError('复习轮次编号无效。'); return; }
    let alive = true; setLoading(true); setError('');
    getReviewResults(id).then(value => { if (alive) setData(value); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : '复习结果读取失败。'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, retry]);
  const correctCount = data?.items.filter(item => item.result.isCorrect).length ?? 0;
  const answeredCount = data?.items.length ?? 0;
  return <><div className="mobile-route"><MobileScreen className="mistakes-screen review-history-detail"><MobileHeader title="复习结果" /><PreviewBadge />{loading ? <div className="mistake-empty"><IconRefresh size={24} /><strong>正在读取复习记录…</strong></div> : error ? <ErrorBox onRetry={() => setRetry(value => value + 1)}>{error}</ErrorBox> : data ? <><section className="review-complete-card"><span className="review-complete-icon"><IconCircleCheck size={30} /></span><strong>{data.round.status === 'completed' ? '本轮复习已完成' : data.round.status === 'exited' ? '本轮复习已退出' : '复习进行中'}</strong><p>{correctCount} / {answeredCount} 道已答题目正确 · 本轮固定题目 {data.round.questionCount} 道</p><div><span>{answeredCount} 已答</span><span>{data.round.questionCount - answeredCount} 未答</span><span>{data.round.strategy === 'weak' ? '薄弱优先' : '随机抽取'}</span></div></section>{data.items.map(item => <article className="review-result-item" key={item.result.attemptId}><div className="review-result-heading"><strong>第 {item.position} 题 · {item.question.type === 'single' ? '单选' : item.question.type === 'multiple' ? '多选' : '判断'}</strong><span className={`mastery-pill is-${item.result.mastery.status}`}>{item.result.isCorrect ? '正确' : '错误'} · {masteryLabel[item.result.mastery.status]}</span></div><p>{item.question.stem}</p><small>你的答案：{item.result.userAnswer.join('、')}　标准答案：{item.result.correctAnswer.join('、')}</small><small>掌握进度：连续正确 {item.result.mastery.consecutiveCorrectRounds} 个复习轮次</small></article>)}<Link className="mobile-button" to={href('/mistakes')}>返回错题本</Link></> : <div className="mistake-empty"><IconBook size={25} /><strong>{preview ? '预览数据与正式历史隔离' : '没有已保存的复习结果'}</strong><span>正式复习历史由服务端保存。</span><Link className="mobile-button" to={href('/mistakes')}>返回错题本</Link></div>}</MobileScreen></div><div className="desktop-route"><main className="desktop-practice-page desktop-mistake-results"><div className="desktop-practice-heading"><div><span>学习中心 / 错题复习 / 历史</span><h1>复习结果</h1></div><Link className="button button-outline" to="/mistakes">返回错题本</Link></div>{loading ? <div className="desktop-practice-empty">正在读取复习记录…</div> : error ? <ErrorBox>{error}</ErrorBox> : data ? <><section className="review-complete-card"><strong>{data.round.status === 'completed' ? '本轮复习已完成' : data.round.status === 'exited' ? '本轮复习已退出' : '复习进行中'}</strong><p>{correctCount} / {answeredCount} 道已答题目正确 · 共 {data.round.questionCount} 题</p></section>{data.items.map(item => <article className="review-result-item" key={item.result.attemptId}><div className="review-result-heading"><strong>第 {item.position} 题 · {item.question.type === 'single' ? '单选' : item.question.type === 'multiple' ? '多选' : '判断'}</strong><span className={`mastery-pill is-${item.result.mastery.status}`}>{item.result.isCorrect ? '正确' : '错误'} · {masteryLabel[item.result.mastery.status]}</span></div><p>{item.question.stem}</p><small>你的答案：{item.result.userAnswer.join('、')}　标准答案：{item.result.correctAnswer.join('、')}</small></article>)}</> : <div className="desktop-practice-empty">{error || (preview ? '预览数据与正式历史隔离。' : '没有已保存的复习结果。')}</div>}</main></div></>;
}
