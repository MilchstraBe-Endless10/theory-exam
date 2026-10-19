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
import { MobileDashboard } from './MobilePages';

const masteryTypes = [
  { name: '单选题', key: 'single', tone: 'mint' },
  { name: '多选题', key: 'multiple', tone: 'blue' },
  { name: '判断题', key: 'judgement', tone: 'purple' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeBank: bank, loading, error } = useBanks();
  const rules = bank?.examRules;
  const examCount = rules ? rules.singleCount + rules.multipleCount + rules.judgementCount : null;
  const examScore = rules ? rules.singleCount * rules.singlePoints + rules.multipleCount * rules.multiplePoints + rules.judgementCount * rules.judgementPoints : null;
  const bankLabel = bank?.name ?? (loading ? '正在读取题库…' : user ? '暂无已启用题库' : '请连接并登录本地服务');

  return (
    <>
    <div className="desktop-route">
    <main className="dashboard-page">
      <div className="page-intro">
        <h1>从今天的进步开始。</h1>
        <p>{bank ? `${bank.name} · 稳步完成每一次练习` : error || '连接并登录本地服务后读取已启用题库'}</p>
      </div>

      <section className="stat-grid" aria-label="学习数据概览">
        <StatCard label="已学习题目" detail="连接服务端后显示" to="/practice" icon={IconBook} tone="mint" />
        <StatCard label="整体正确率" detail="连接服务端后显示" to="/records" icon={IconChartBar} tone="blue" />
        <StatCard label="待复习错题" detail="连接服务端后显示" to="/mistakes" icon={IconFileText} tone="red" />
        <StatCard label="最近模拟成绩" detail="连接服务端后显示" to="/records" icon={IconTrophy} tone="amber" />
      </section>

      <section className="dashboard-grid primary-grid" aria-label="学习入口">
        <article className="card continue-card">
          <div className="card-heading">
            <span className="large-icon icon-tile blue"><IconBook size={31} stroke={1.8} /></span>
            <div className="heading-copy">
              <h2>继续练习</h2>
              <p>顺序练习 · 按题库顺序逐题练习</p>
            </div>
            <span className="bank-chip">{bankLabel}</span>
          </div>
          <div className="progress-summary">
            <span>练习进度将在连接服务端后显示</span>
            <span className="unavailable-value">—</span>
          </div>
          <div className="progress-track" role="img" aria-label="尚无练习进度"><span className="progress-fill mint-fill" /></div>
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
              <h2>题型掌握情况</h2>
            </div>
            <Link className="text-link" to="/records">查看详情 <IconChevronRight size={16} /></Link>
          </div>
          <div className="mastery-list">
              {masteryTypes.map((item) => (
              <div className="mastery-row" key={item.name}>
                <div className="mastery-label"><strong>{item.name}</strong><span>（共 {bank?.activeVersion?.typeCounts[item.key] ?? '—'} 题）</span></div>
                <div className="progress-track mastery-track" role="img" aria-label={`${item.name}暂无掌握统计`}>
                  <span className={`progress-fill ${item.tone}-fill`} />
                </div>
                <span className="mastery-value">—</span>
              </div>
            ))}
          </div>
          <p className="card-footnote">{bank ? '题型题量来自当前服务端题库版本；掌握度待学习记录接入' : '当前没有可读取的题库版本；掌握度待学习记录接入'}</p>
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
              <span><small>待复习</small><strong>— <em>题</em></strong></span>
            </div>
            <div className="review-state review-learning">
              <span className="review-state-icon"><IconClockHour4 size={22} stroke={1.8} /></span>
              <span><small>巩固中</small><strong>— <em>题</em></strong></span>
            </div>
            <div className="review-state review-mastered">
              <span className="review-state-icon"><IconCircleCheck size={22} stroke={1.8} /></span>
              <span><small>已掌握</small><strong>— <em>题</em></strong></span>
            </div>
          </div>
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
            <tbody>
              <tr>
                <td colSpan={5}>
                  <div className="table-empty">
                    <span>暂无练习记录</span>
                    <small>连接本地服务端后，这里会显示真实的练习历史。</small>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
    </div>
    <MobileDashboard />
    </>
  );
}
