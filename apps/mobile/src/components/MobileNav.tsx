import { IconChartBar, IconCircleDot, IconHomeFilled, IconPencil, IconUserFilled } from '@tabler/icons-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: '首页', icon: IconHomeFilled, end: true },
  { to: '/practice', label: '练习', icon: IconPencil },
  { to: '/exams', label: '考试', icon: IconChartBar },
  { to: '/mistakes', label: '错题', icon: IconCircleDot },
  { to: '/me', label: '我的', icon: IconUserFilled },
];

export default function MobileNav() {
  return (
    <nav className="mobile-navigation" aria-label="移动端主导航">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-link${isActive ? ' is-active' : ''}`}>
          <Icon size={21} stroke={1.9} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
