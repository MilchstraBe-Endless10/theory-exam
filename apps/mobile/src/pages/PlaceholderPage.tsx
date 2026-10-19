import { IconArrowLeft, IconCloudOff } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

const pageDetails = {
  practice: { title: '日常练习', description: '顺序练习、随机练习、题型专项与收藏练习。' },
  exams: { title: '模拟考试', description: '四级考试规则：180 道题、90 分钟、100 分满分。' },
  mistakes: { title: '错题复习', description: '按题型筛选错题，结合随机或薄弱优先开始复习。' },
  records: { title: '考试记录', description: '查看每场考试的成绩、用时和完整试卷。' },
  favorites: { title: '我的收藏', description: '集中查看和练习自己收藏的题目。' },
  me: { title: '我的', description: '账号、服务器连接和个人设置。' },
};

type PageKey = keyof typeof pageDetails;

export default function PlaceholderPage({ page }: { page: PageKey }) {
  const { title, description } = pageDetails[page];

  return (
    <main className="placeholder-page">
      <div className="page-intro">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <section className="card placeholder-card">
        <span className="placeholder-icon"><IconCloudOff size={30} stroke={1.7} /></span>
        <h2>等待本地服务端接入</h2>
        <p>这个页面已预留导航与布局。目前尚无服务端连接，因此不会展示演示题目或虚构的个人学习数据。</p>
        <Link className="button button-primary" to="/"><IconArrowLeft size={18} /> 返回学习首页</Link>
      </section>
    </main>
  );
}
