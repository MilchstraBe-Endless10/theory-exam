import {
  IconBook,
  IconChartBar,
  IconChevronRight,
  IconCircleDot,
  IconClipboardText,
  IconHomeFilled,
  IconPencil,
  IconStar,
  IconUserFilled,
} from '@tabler/icons-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const links = [
  { to: '/', label: '概览', icon: IconHomeFilled, end: true },
  { to: '/practice', label: '日常练习', icon: IconPencil },
  { to: '/exams', label: '模拟考试', icon: IconClipboardText },
  { to: '/mistakes', label: '错题复习', icon: IconCircleDot },
  { to: '/records', label: '考试记录', icon: IconChartBar },
  { to: '/favorites', label: '我的收藏', icon: IconStar },
];

export default function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="sidebar">
      <NavLink className="brand" to="/" aria-label="理论考试学习空间首页">
        <span className="brand-mark"><IconBook size={28} stroke={2.1} /></span>
        <span className="brand-copy">
          <strong>理论考试</strong>
          <small>LEARNING STUDIO</small>
        </span>
      </NavLink>

      <nav className="side-navigation" aria-label="主导航">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' is-active' : ''}`}>
            <Icon size={23} stroke={1.9} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <NavLink to="/me" className="sidebar-profile">
        <span className="avatar"><IconUserFilled size={25} /></span>
        <span className="sidebar-profile-label">{user?.username ?? '未登录'}</span>
        <IconChevronRight className="profile-chevron" size={19} stroke={1.8} />
      </NavLink>
    </aside>
  );
}
