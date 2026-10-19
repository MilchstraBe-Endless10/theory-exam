import { useEffect, useState } from 'react';
import {
  IconBook,
  IconChartBar,
  IconCircleCheck,
  IconChevronRight,
  IconClockHour4,
  IconFileText,
  IconRefresh,
  IconTrophy,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import StatCard from '../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { useBanks } from '../services/banks';
import { useLearningProgress, type PracticeQuestionType } from '../services/practice';
import { previewMode } from '../services/api';
import { getExamHistory } from '../services/exams';
import { useMistakeStats } from '../services/reviews';
import { MobileDashboard } from './MobilePages';

const masteryTypes: Array<{ name: string; key: PracticeQuestionType; tone: string }> = [
  { name: '单选题', key: 'single', tone: 'mint' },
  { name: '多选题', key: 'multiple', tone: 'blue' },
  { name: '判断题', key: 'judgement', tone: 'purple' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeBank: bank, loading, error } = useBanks();
  const { progress, loading: progressLoading, error: progressError } = useLearningProgress(bank?.id, user?.id);
  const { stats: mistakeStats } = useMistakeStats(bank?.id, user?.id);
  const preview = previewMode();
  const [latestExam, setLatestExam] = useState<{ totalScore: number; submittedAt: string | null } | null>(null);
  const [examHistoryLoading, setExamHistoryLoading] = useState(false);
  const rules = bank?.examRules;
  const examCount = rules ? rules.singleCount + rules.multipleCount + rules.judgementCount : null;
  const examScore = rules ? rules.singleCount * rules.singlePoints + rules.multipleCount * rules.multiplePoints + rules.judgementCount * rules.judgementPoints : null;
  const bankLabel = bank?.name ?? (loading ? '正在读取题库…' : user ? '暂无已启用题库' : '请连接并登录本地服务');

  useEffect(() => {
    if (preview || !user || user.mustChangePassword) { setLatestExam(null); setExamHistoryLoading(false); return; }
    let active = true;
    setExamHistoryLoading(true);
    getExamHistory(bank?.id).then(({ items }) => {
      if (!active) return;
      const row = items.find(item => typeof item.totalScore === 'number' && item.status !== 'in_progress');
      setLatestExam(row ? { totalScore: Number(row.totalScore), submittedAt: typeof row.submittedAt === 'string' ? row.submittedAt : null } : null);
    }).catch(() => { if (active) setLatestExam(null); }).finally(() => { if (active) setExamHistoryLoading(false); });
    return () => { active = false; };
  }, [preview, user?.id, user?.mustChangePassword, bank?.id]);

  return (
    <>
    <div className="desktop-route">
    <main className="dashboard-page">
      <div className="page-intro">
        <h1>从今天的进步开始。</h1>
        <p>{bank ? `${bank.name} · 稳步完成每一次练习` : error || '连接并登录本地服务后读取已启用题库'}</p>
      </div>

      <section className="stat-grid" aria-label="学习数据概览">
        <StatCard label="已接触题目" value={preview ? '426' : progress ? String(progress.touchedCount) : progressLoading ? '…' : '—'} detail={progress ? `当前题库共 ${progress.questionCount} 题` : preview ? '开发预览数据' : progressError || '提交练习后统计'} to="/practice" icon={IconBook} tone="mint" />
        <StatCard label="练习正确率" value={preview ? '82.6%' : progress?.accuracyRate === null || !progress ? '—' : `${progress.accuracyRate}%`} detail={progress ? `${progress.submissionCount} 次有效作答` : preview ? '开发预览数据' : progressError || '暂无正式答题记录'} to="/records" icon={IconChartBar} tone="blue" />
        <StatCard label="待复习错题" value={preview ? '38' : mistakeStats ? String(mistakeStats.review + mistakeStats.reinforcing) : progressLoading ? '…' : '—'} detail={mistakeStats ? `巩固中 ${mistakeStats.reinforcing} 题` : preview ? '开发预览数据' : progressError || '错题记录来自正式作答'} to="/mistakes" icon={IconFileText} tone="red" />
        <StatCard label="最近模拟成绩" value={preview ? '—' : latestExam ? `${latestExam.totalScore} 分` : '—'} detail={preview ? '开发预览不展示真实成绩' : latestExam?.submittedAt ? new Date(latestExam.submittedAt).toLocaleDateString('zh-CN') : examHistoryLoading ? '正在读取考试记录…' : '暂无已完成的模拟考试'} to="/records" icon={IconTrophy} tone="amber" />
      </section>

      <section className="dashboard-grid primary-grid" aria-label="学习入口">
        <article className="card continue-card">
          <div className="card-heading">
            <span className="large-icon icon-tile blue"><IconBook size={31} stroke={1.8} /></span>
            <div className="heading-copy">
              <h2>继续练习</h2>
            <p>{progress?.recentSessions[0]?.mode === 'sequential' ? '继续最近的顺序练习' : '顺序练习 · 按题库顺序逐题练习'}</p>
            </div>
            <span className="bank-chip">{bankLabel}</span>
          </div>
          <div className="progress-summary">
            <span>{progress ? `探索 ${progress.touchedCount} / ${progress.questionCount} 题 · 未作答 ${progress.unansweredCount} 题` : preview ? '开发预览 · 426 / 1283 题' : progressLoading ? '正在读取学习进度…' : '尚无正式练习记录'}</span>
            <span className="unavailable-value">{progress ? `${progress.explorationRate ?? 0}%` : preview ? '33.2%' : '—'}</span>
          </div>
          <div className="progress-track" role="img" aria-label="题库探索进度"><span className="progress-fill mint-fill" style={{ width: `${progress?.explorationRate ?? (preview ? 33.2 : 0)}%` }} /></div>
          <Link className="button button-primary button-wide" to="/practice">
            继续刷题 <IconChevronRight size={19} stroke={2} />
          </Link>
        </article>

        <article className="card exam-card">
          <div className="card-heading">
            <span className="large-icon icon-tile blue"><IconFileText size={30} stroke={1.8} /></span>
            <div className="heading-copy">
              <h2>模拟考试</h2>
              <p>全真模拟 · 随机组卷，限时完成</p>
            </div>
            <span className="bank-chip">{bankLabel}</span>
          </div>
          <div className="exam-facts" aria-label="当前题库考试规则">
            <div className="exam-fact"><IconFileText size={21} stroke={1.8} /><strong>{examCount === null ? '—' : `${examCount} 题`}</strong></div>
            <div className="exam-fact"><IconClockHour4 size={21} stroke={1.8} /><strong>{rules ? `${rules.durationMinutes} 分钟` : '—'}</strong></div>
            <div className="exam-fact"><IconTrophy size={21} stroke={1.8} /><strong>{examScore === null ? '—' : `满分 ${examScore} 分`}</strong></div>
          </div>
          <Link className="button button-outline button-wide" to="/exams">{rules ? '查看模拟考试规则' : '查看题库与考试设置'}</Link>
        </article>
      </section>

      <section className="dashboard-grid secondary-grid" aria-label="学习状态">
        <article className="card mastery-card">
          <div className="section-heading">
            <div className="section-title">
              <span className="small-icon icon-tile blue"><IconChartBar size={20} stroke={1.9} /></span>
              <h2>题型正确率</h2>
            </div>
            <Link className="text-link" to="/records">查看详情 <IconChevronRight size={16} /></Link>
          </div>
          <div className="mastery-list">
              {masteryTypes.map((item) => (
              <div className="mastery-row" key={item.name}>
                <div className="mastery-label"><strong>{item.name}</strong><span>（共 {progress?.byType[item.key]?.questionCount ?? bank?.activeVersion?.typeCounts[item.key] ?? '—'} 题）</span></div>
                <div className="progress-track mastery-track" role="img" aria-label={`${item.name}练习正确率`}>
                  <span className={`progress-fill ${item.tone}-fill`} style={{ width: `${progress?.byType[item.key]?.accuracyRate ?? 0}%` }} />
                </div>
                <span className="mastery-value">{progress?.byType[item.key]?.accuracyRate == null ? '—' : `${progress.byType[item.key].accuracyRate}%`}</span>
              </div>
            ))}
          </div>
          <p className="card-footnote">{progress ? `正确率按正式作答次数计算。${progress.submissionCount} 次有效提交。` : progressError || (bank ? '题型题量来自当前版本；正式答题后显示正确率' : '当前没有可读取的题库版本')}</p>
        </article>

        <article className="card review-card">
          <div className="card-heading review-heading">
            <span className="large-icon icon-tile mint"><IconRefresh size={30} stroke={1.9} /></span>
            <div className="heading-copy">
              <h2>错题复习</h2>
              <p>根据掌握程度，针对性复习错题</p>
            </div>
          </div>
          <div className="review-states">
            <div className="review-state review-pending">
              <span className="review-state-icon"><IconFileText size={22} stroke={1.8} /></span>
              <span><small>待复习</small><strong>{preview ? '38' : mistakeStats ? mistakeStats.review : '—'} <em>题</em></strong></span>
            </div>
            <div className="review-state review-learning">
              <span className="review-state-icon"><IconClockHour4 size={22} stroke={1.8} /></span>
              <span><small>连续复习</small><strong>{preview ? '12' : mistakeStats ? mistakeStats.reinforcing : '—'} <em>题</em></strong></span>
            </div>
            <div className="review-state review-mastered">
              <span className="review-state-icon"><IconCircleCheck size={22} stroke={1.8} /></span>
              <span><small>已掌握</small><strong>{preview ? '74' : mistakeStats ? mistakeStats.mastered : '—'} <em>题</em></strong></span>
            </div>
          </div>
          <p className="card-footnote">{progress ? `已收藏 ${progress.favoriteCount} 题 · 待复习 ${mistakeStats ? mistakeStats.review + mistakeStats.reinforcing : '—'} 题` : preview ? '开发预览数据' : progressError || '收藏和错题统计在登录后读取'}</p>
          <Link className="button button-primary button-wide" to="/mistakes">开始复习 <IconChevronRight size={19} stroke={2} /></Link>
        </article>
      </section>

      <section className="card recent-card" aria-labelledby="recent-title">
        <div className="section-heading recent-heading">
          <div className="section-title">
            <span className="recent-clock"><IconClockHour4 size={22} stroke={1.8} /></span>
            <h2 id="recent-title">最近练习</h2>
          </div>
          <Link className="text-link" to="/records">查看更多 <IconChevronRight size={16} /></Link>
        </div>
          <div className="table-scroll">
          <table>
            <thead>
              <tr><th>时间</th><th>练习模式</th><th>题目数量</th><th>正确率</th><th>操作</th></tr>
            </thead>
            <tbody>{progress?.recentSessions.length ? progress.recentSessions.map(session => {
              const modeLabels: Record<string, string> = { sequential: '顺序练习', random: '随机练习', single: '单选专项', multiple: '多选专项', judgement: '判断专项', unanswered: '未做练习', favorites: '收藏练习', mistakes: '错题专项' };
              const rate = session.attempts ? `${Math.round(session.correctCount / session.attempts * 1000) / 10}%` : '—';
              return <tr key={session.id}><td>{new Date(session.updatedAt).toLocaleString('zh-CN')}</td><td>{modeLabels[session.mode] ?? session.mode}</td><td>{session.submittedCount} / {session.questionCount}</td><td>{rate}</td><td><Link to={`/practice/answer?session=${session.id}`}>继续</Link></td></tr>;
            }) : <tr><td colSpan={5}><div className="table-empty"><span>{progressLoading ? '正在读取练习记录…' : progress ? '暂无练习记录' : progressError || '登录并选择题库后显示真实学习记录。'}</span><small>这里只显示服务端保存的正式练习数据。</small></div></td></tr>}</tbody>
          </table>
        </div>
      </section>
    </main>
    </div>
    <MobileDashboard progress={progress} progressLoading={progressLoading} progressError={progressError} />
    </>
  );
}
