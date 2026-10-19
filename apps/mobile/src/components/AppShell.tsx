import { IconBook, IconChevronDown, IconUserFilled } from '@tabler/icons-react';
import { Outlet, useLocation } from 'react-router-dom';
import MobileNav from './MobileNav';
import Sidebar from './Sidebar';

const pageNames: Record<string, string> = {
  '/': '概览',
  '/practice': '日常练习',
  '/exams': '模拟考试',
  '/mistakes': '错题复习',
  '/records': '考试记录',
  '/favorites': '我的收藏',
  '/me': '我的',
};

export default function AppShell() {
  const { pathname } = useLocation();
  const pageName = pageNames[pathname] ?? '概览';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumbs" aria-label="当前位置">
            <span>学习空间</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{pageName}</strong>
          </div>
          <div className="topbar-actions">
            <div className="connection-status">
              <span className="status-dot" />
              <span>未连接本地服务</span>
            </div>
            <details className="user-menu">
              <summary aria-label="用户菜单">
                <span className="avatar avatar-small"><IconUserFilled size={21} /></span>
                <span className="user-menu-label">未登录</span>
                <IconChevronDown className="user-menu-chevron" size={16} stroke={1.8} />
              </summary>
              <div className="user-menu-popover">
                <strong>学习用户</strong>
                <span>连接本地服务后登录</span>
              </div>
            </details>
          </div>
          <div className="mobile-brand" aria-label="理论考试学习空间">
            <span className="brand-mark brand-mark-small"><IconBook size={22} stroke={2.1} /></span>
            <strong>理论考试</strong>
          </div>
        </header>
        <div className="page-region">
          <Outlet />
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
