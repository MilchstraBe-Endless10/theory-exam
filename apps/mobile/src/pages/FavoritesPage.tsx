import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconBook, IconChevronLeft, IconChevronRight, IconRefresh, IconStar, IconWifi } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBanks } from '../services/banks';
import { ApiError, previewMode } from '../services/api';
import {
  createPracticeSession,
  getActivePracticeSession,
  getFavorites,
  resumePracticeSession,
  setQuestionFavorite,
  type PracticeQuestion,
  type PracticeSession,
} from '../services/practice';

interface FavoriteData {
  scope: string;
  status: 'loading' | 'loaded' | 'error';
  items: PracticeQuestion[];
  count: number;
  error?: string;
}

interface SessionData {
  scope: string;
  status: 'loading' | 'loaded' | 'error';
  session: PracticeSession | null;
  error?: string;
}

function ResponsivePage({ children, desktop }: { children: ReactNode; desktop: ReactNode }) {
  return <><div className="mobile-route">{children}</div><div className="desktop-route">{desktop}</div></>;
}

export default function FavoritesPage() {
  const { user, serverAddress, serverStatus, sessionExpired } = useAuth();
  const { activeBank: bank, banks, loading: banksLoading, error: banksError, preview, reload: reloadBanks } = useBanks();
  const navigate = useNavigate();
  const isPreview = preview || previewMode();
  const scope = user && bank && serverAddress ? `${serverAddress}\u001f${user.id}\u001f${bank.id}` : '';
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [favoriteData, setFavoriteData] = useState<FavoriteData | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [removing, setRemoving] = useState<{ scope: string; questionId: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [operationError, setOperationError] = useState<{ scope: string; message: string } | null>(null);

  useEffect(() => {
    setRemoving(null);
    setStarting(false);
    setOperationError(null);
    if (isPreview || !scope || !bank || banksLoading || banksError) {
      setFavoriteData(null);
      setSessionData(null);
      return;
    }

    let active = true;
    setFavoriteData({ scope, status: 'loading', items: [], count: 0 });
    setSessionData({ scope, status: 'loading', session: null });

    getFavorites(bank.id)
      .then(result => {
        if (active) setFavoriteData({ scope, status: 'loaded', items: result.items, count: result.count });
      })
      .catch(reason => {
        if (active) setFavoriteData({ scope, status: 'error', items: [], count: 0, error: errorMessage(reason, '收藏读取失败。') });
      });

    getActivePracticeSession(bank.id)
      .then(result => {
        if (active) setSessionData({ scope, status: 'loaded', session: result.session });
      })
      .catch(reason => {
        if (active) setSessionData({ scope, status: 'error', session: null, error: errorMessage(reason, '未完成练习读取失败。') });
      });

    return () => { active = false; };
  }, [bank, banksError, banksLoading, isPreview, retryVersion, scope]);

  const favorites = favoriteData?.scope === scope ? favoriteData : null;
  const activeSession = sessionData?.scope === scope ? sessionData : null;
  const operationMessage = operationError?.scope === scope ? operationError.message : '';

  const retry = () => {
    setFavoriteData(scope ? { scope, status: 'loading', items: [], count: 0 } : null);
    setSessionData(scope ? { scope, status: 'loading', session: null } : null);
    setOperationError(null);
    setRetryVersion(version => version + 1);
  };

  const removeFavorite = async (question: PracticeQuestion) => {
    if (!scope || !bank || removing) return;
    setRemoving({ scope, questionId: question.id });
    setOperationError(null);
    try {
      const result = await setQuestionFavorite(question.id, bank.id, false);
      if (scopeRef.current !== scope) return;
      if (result.favorite) throw new Error('服务器未确认取消收藏，请重试。');
      setFavoriteData(current => {
        if (!current || current.scope !== scope || current.status !== 'loaded') return current;
        const existed = current.items.some(item => item.id === question.id);
        const items = current.items.filter(item => item.id !== question.id);
        return { ...current, items, count: Math.max(0, current.count - Number(existed)) };
      });
    } catch (reason) {
      if (scopeRef.current === scope) setOperationError({ scope, message: errorMessage(reason, '取消收藏失败，原收藏仍保留。') });
    } finally {
      if (scopeRef.current === scope) setRemoving(null);
    }
  };

  const openSession = async (session: PracticeSession, expectedScope: string) => {
    await resumePracticeSession(session.id);
    if (scopeRef.current === expectedScope) navigate(`/practice/answer?session=${encodeURIComponent(session.id)}`);
  };

  const startFavoritesPractice = async () => {
    if (!scope || !bank || !favorites || favorites.status !== 'loaded' || favorites.count < 1 || starting) return;
    setStarting(true);
    setOperationError(null);
    try {
      const active = await getActivePracticeSession(bank.id);
      if (scopeRef.current !== scope) return;
      setSessionData({ scope, status: 'loaded', session: active.session });
      if (active.session) {
        if (active.session.mode === 'favorites') {
          await openSession(active.session, scope);
          return;
        }
        setOperationError({ scope, message: `当前有未完成的${practiceModeLabel(active.session.mode)}。请先继续或退出该练习，再开始收藏练习。` });
        return;
      }
      const result = await createPracticeSession(bank.id, 'favorites');
      if (scopeRef.current === scope) navigate(`/practice/answer?session=${encodeURIComponent(result.session.id)}`);
    } catch (reason) {
      if (scopeRef.current === scope) setOperationError({ scope, message: errorMessage(reason, '收藏专项练习启动失败。') });
    } finally {
      if (scopeRef.current === scope) setStarting(false);
    }
  };

  const resumeActiveSession = async () => {
    if (!activeSession?.session || !scope || starting) return;
    setStarting(true);
    setOperationError(null);
    try {
      await openSession(activeSession.session, scope);
    } catch (reason) {
      if (scopeRef.current === scope) setOperationError({ scope, message: errorMessage(reason, '恢复未完成练习失败。') });
    } finally {
      if (scopeRef.current === scope) setStarting(false);
    }
  };

  const view = renderFavoritesContent({
    isPreview, serverAddress, user, sessionExpired, serverStatus, bank, banks, banksLoading, banksError,
    favorites, activeSession, onRetry: retry, onRetryBanks: reloadBanks,
    onRemove: question => void removeFavorite(question), removing,
    onStartPractice: () => void startFavoritesPractice(), onResumeSession: () => void resumeActiveSession(),
    starting, operationError: operationMessage,
  });

  return <ResponsivePage desktop={<main className="favorites-page">{view.desktop}</main>}>
    <main className="mobile-screen favorites-mobile-screen">{view.mobile}</main>
  </ResponsivePage>;
}

function renderFavoritesContent({
  isPreview, serverAddress, user, sessionExpired, serverStatus, bank, banks, banksLoading, banksError,
  favorites, activeSession, onRetry, onRetryBanks, onRemove, removing, onStartPractice, onResumeSession,
  starting, operationError,
}: {
  isPreview: boolean;
  serverAddress: string;
  user: ReturnType<typeof useAuth>['user'];
  sessionExpired: boolean;
  serverStatus: ReturnType<typeof useAuth>['serverStatus'];
  bank: ReturnType<typeof useBanks>['activeBank'];
  banks: ReturnType<typeof useBanks>['banks'];
  banksLoading: boolean;
  banksError: string;
  favorites: FavoriteData | null;
  activeSession: SessionData | null;
  onRetry: () => void;
  onRetryBanks: () => void;
  onRemove: (question: PracticeQuestion) => void;
  removing: { scope: string; questionId: string } | null;
  onStartPractice: () => void;
  onResumeSession: () => void;
  starting: boolean;
  operationError: string;
}) {
  const pageState = getPageState({ isPreview, serverAddress, user, sessionExpired, serverStatus, bank, banks, banksLoading, banksError });
  const bankName = bank?.name ?? '';
  const count = favorites?.status === 'loaded' ? favorites.count : null;
  const items = favorites?.status === 'loaded' ? favorites.items : [];
  const session = activeSession?.status === 'loaded' ? activeSession.session : null;
  const sessionLoading = !pageState && (!activeSession || activeSession.status === 'loading');
  const sessionError = !pageState && activeSession?.status === 'error' ? activeSession.error : '';
  const canStart = !pageState && favorites?.status === 'loaded' && favorites.count > 0 && !sessionLoading && !sessionError && !starting && (!session || session.mode === 'favorites');
  const canReload = !pageState && favorites?.status !== 'loading';
  const startLabel = session?.mode === 'favorites' ? '继续收藏专项练习' : session ? '请先完成当前练习' : '开始收藏专项练习';
  const operationFailed = operationError && !pageState;
  const stateContent = pageState
    ? <FavoriteStatus state={pageState} onRetry={pageState.retryBanks ? onRetryBanks : onRetry} />
    : favorites?.status === 'loading' || !favorites
      ? <FavoriteStatus state={{ icon: 'loading', title: '正在读取收藏…', detail: '正在同步当前账号和题库的收藏记录。' }} />
      : favorites.status === 'error'
        ? <FavoriteStatus state={{ icon: 'error', title: serverStatus === 'unavailable' ? '服务器暂时无法连接' : '收藏读取失败', detail: favorites.error || '请检查服务器连接后重试。', retry: true }} onRetry={onRetry} />
        : favorites.items.length === 0
          ? <FavoriteStatus state={{ icon: 'empty', title: '还没有收藏的题目。', detail: '在日常练习中点亮星标后，题目会显示在这里。', practiceLink: true }} />
          : <FavoriteQuestionList items={items} count={count ?? items.length} removing={removing} onRemove={onRemove} />;

  return {
    desktop: <>
      <div className="favorites-heading">
        <div className="page-intro"><h1>我的收藏</h1><p>集中查看和练习自己收藏的题目。</p></div>
        <div className="favorites-heading-actions">
          {bankName && <span className="favorites-bank-label"><IconBook size={17} />{bankName}</span>}
          <button className="favorites-reload-button" type="button" aria-label="重新加载收藏" onClick={onRetry} disabled={!canReload}><IconRefresh size={17} />重新加载</button>
        </div>
      </div>
      <section className="card favorites-summary">
        <div><span>当前题库</span><strong>{bankName || pageState?.bankLabel || '读取中…'}</strong></div>
        <div><span>收藏题目</span><strong>{count === null ? '—' : `${count} 题`}</strong></div>
        <button className="favorites-start-button" type="button" disabled={!canStart} onClick={onStartPractice}><IconStar size={19} />{starting ? '正在打开…' : startLabel}</button>
      </section>
      {session && session.mode !== 'favorites' && <ActiveSessionNotice session={session} onResume={onResumeSession} starting={starting} />}
      {sessionError && <p className="favorites-session-error" role="alert">{sessionError}<button type="button" onClick={onRetry}>重试</button></p>}
      {operationFailed && <p className="favorites-operation-error" role="alert">{operationError}<button type="button" onClick={onRetry}>重新加载</button></p>}
      {stateContent}
    </>,
    mobile: <>
      <div className="mobile-statusbar" aria-hidden="true"><span>9:41</span><span className="status-icons"><span className="signal-bars"><i /><i /><i /><i /></span><span className="battery"><i /></span></span></div>
      <header className="mobile-page-header"><Link className="back-button" to="/me" aria-label="返回"><IconChevronLeft size={24} /></Link><h1>我的收藏</h1><button className="header-icon" type="button" aria-label="重新加载收藏" onClick={onRetry} disabled={!canReload}><IconRefresh size={20} /></button></header>
      {bankName && <p className="favorites-mobile-bank"><IconBook size={15} />{bankName}</p>}
      <section className="favorites-mobile-summary"><span>当前题库收藏</span><strong>{count === null ? '—' : `${count} 题`}</strong></section>
      <button className="favorites-start-button" type="button" disabled={!canStart} onClick={onStartPractice}><IconStar size={18} />{starting ? '正在打开…' : startLabel}</button>
      {session && session.mode !== 'favorites' && <ActiveSessionNotice session={session} onResume={onResumeSession} starting={starting} />}
      {sessionError && <p className="favorites-session-error" role="alert">{sessionError}<button type="button" onClick={onRetry}>重试</button></p>}
      {operationFailed && <p className="favorites-operation-error" role="alert">{operationError}<button type="button" onClick={onRetry}>重新加载</button></p>}
      {stateContent}
    </>,
  };
}

interface FavoritesPageState {
  icon: 'loading' | 'error' | 'connect' | 'login' | 'bank' | 'preview' | 'empty';
  title: string;
  detail: string;
  retry?: boolean;
  retryBanks?: boolean;
  practiceLink?: boolean;
  connectLink?: boolean;
  loginLink?: boolean;
  bankLabel?: string;
}

function getPageState(input: {
  isPreview: boolean;
  serverAddress: string;
  user: ReturnType<typeof useAuth>['user'];
  sessionExpired: boolean;
  serverStatus: ReturnType<typeof useAuth>['serverStatus'];
  bank: ReturnType<typeof useBanks>['activeBank'];
  banks: ReturnType<typeof useBanks>['banks'];
  banksLoading: boolean;
  banksError: string;
}): FavoritesPageState | null {
  if (input.isPreview) return { icon: 'preview', title: '开发预览不展示收藏数据。', detail: '请使用已连接服务器并登录的账号查看真实收藏。' };
  if (!input.serverAddress) return { icon: 'connect', title: '尚未连接服务器', detail: '收藏数据由当前学习服务端保存。', connectLink: true };
  if (input.sessionExpired) return { icon: 'login', title: '登录已失效', detail: '请重新登录后查看你的收藏。', loginLink: true };
  if (!input.user) return { icon: 'login', title: '请先登录', detail: '登录后才能查看当前账号的收藏题目。', loginLink: true };
  if (input.user.mustChangePassword) return { icon: 'login', title: '请先修改初始密码', detail: '完成首次密码修改后即可查看收藏。' };
  if (input.banksLoading) return { icon: 'loading', title: '正在读取题库…', detail: '正在获取当前账号可用的题库。' };
  if (input.banksError) return {
    icon: 'error', title: input.serverStatus === 'unavailable' ? '服务器暂时无法连接' : '题库读取失败',
    detail: input.banksError, retry: true, retryBanks: true,
  };
  if (!input.bank) return {
    icon: 'bank', title: input.banks.length ? '没有可用的当前题库' : '当前没有可用题库',
    detail: '请在“我的”中选择一个已启用题库，或联系本机管理员导入题库。', bankLabel: '未选择题库',
  };
  return null;
}

function FavoriteStatus({ state, onRetry }: { state: FavoritesPageState; onRetry?: () => void }) {
  return <section className={`favorite-state is-${state.icon}`} role={state.icon === 'error' ? 'alert' : state.icon === 'loading' ? 'status' : 'region'}>
    <span className="favorite-state-icon">{state.icon === 'loading' ? <IconRefresh size={23} /> : state.icon === 'connect' || state.icon === 'login' || state.icon === 'bank' ? <IconBook size={23} /> : state.icon === 'preview' ? <IconWifi size={23} /> : state.icon === 'empty' ? <IconStar size={23} /> : <IconWifi size={23} />}</span>
    <strong>{state.title}</strong><span>{state.detail}</span>
    {state.practiceLink && <Link className="favorites-secondary-link" to="/practice">前往日常练习<IconChevronRight size={16} /></Link>}
    {state.connectLink && <Link className="favorites-secondary-link" to="/connect">连接服务器<IconChevronRight size={16} /></Link>}
    {state.loginLink && <Link className="favorites-secondary-link" to="/login">前往登录<IconChevronRight size={16} /></Link>}
    {state.retry && <button className="favorites-retry-button" type="button" onClick={onRetry}>重试</button>}
  </section>;
}

function ActiveSessionNotice({ session, onResume, starting }: { session: PracticeSession; onResume: () => void; starting: boolean }) {
  return <section className="favorites-active-session">
    <div><strong>发现未完成的{practiceModeLabel(session.mode)}</strong><span>第 {session.currentPosition} / {session.questionCount} 题 · 进度已保存在服务端。</span></div>
    <button type="button" onClick={onResume} disabled={starting}>继续练习<IconChevronRight size={17} /></button>
  </section>;
}

function FavoriteQuestionList({ items, count, removing, onRemove }: {
  items: PracticeQuestion[];
  count: number;
  removing: { scope: string; questionId: string } | null;
  onRemove: (question: PracticeQuestion) => void;
}) {
  return <section className="favorites-list" aria-label="收藏题目列表">
    <div className="favorites-list-heading"><strong>收藏题目</strong><span>{count} 道</span></div>
    {items.map((question, index) => <article className="card favorites-question" key={question.id}>
      <div className="favorites-question-heading"><span className={`question-type-chip type-${question.type}`}>{questionTypeLabel(question.type)}</span><span>第 {index + 1} 题</span></div>
      <p className="favorites-question-stem">{question.stem}</p>
      {Object.keys(question.options ?? {}).length > 0 && <div className="favorites-option-summary" aria-label="选项摘要">
        {Object.entries(question.options).slice(0, 3).map(([key, value]) => <span key={key}><b>{key}.</b>{value}</span>)}
        {Object.keys(question.options).length > 3 && <small>另有 {Object.keys(question.options).length - 3} 个选项</small>}
      </div>}
      <button className="favorites-remove-button" type="button" disabled={removing?.questionId === question.id} onClick={() => onRemove(question)}>
        <IconStar size={17} />{removing?.questionId === question.id ? '正在取消…' : '取消收藏'}
      </button>
    </article>)}
  </section>;
}

function practiceModeLabel(mode: PracticeSession['mode']) {
  if (mode === 'favorites') return '收藏专项练习';
  if (mode === 'mistakes') return '错题专项练习';
  return '日常练习';
}

function questionTypeLabel(type: PracticeQuestion['type']) {
  return type === 'single' ? '单选题' : type === 'multiple' ? '多选题' : '判断题';
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof Error ? reason.message : fallback;
}
