import { IconBook, IconChevronDown, IconUserFilled } from '@tabler/icons-react';
import { Outlet, useLocation } from 'react-router-dom';
import MobileNav from './MobileNav';
import Sidebar from './Sidebar';
import { isImmersiveRoute } from '../pages/MobilePages';
import { useAuth } from '../auth/AuthContext';

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
  const { user, serverStatus } = useAuth();
  const pageName = pathname.startsWith('/mistakes') ? '错题复习' : pageNames[pathname] ?? '概览';
  const immersive = isImmersiveRoute(pathname);
  const connectionLabel = serverStatus === 'connected' ? '已连接本地服务' : serverStatus === 'checking' ? '正在检查服务器' : serverStatus === 'unavailable' ? '服务器不可用' : '未连接本地服务';

  return (
    <div className={`app-layout${immersive ? ' mobile-immersive' : ''}`}>
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
              <span className={`status-dot${serverStatus === 'connected' ? ' is-online' : ''}`} />
              <span>{connectionLabel}</span>
            </div>
            <details className="user-menu">
              <summary aria-label="用户菜单">
                <span className="avatar avatar-small"><IconUserFilled size={21} /></span>
                <span className="user-menu-label">{user?.username ?? '未登录'}</span>
                <IconChevronDown className="user-menu-chevron" size={16} stroke={1.8} />
              </summary>
              <div className="user-menu-popover">
                <strong>{user?.username ?? '未登录'}</strong>
                <span>{user ? (user.role === 'admin' ? '本机管理员' : '已登录') : '连接本地服务后登录'}</span>
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
      {!immersive && <MobileNav />}
    </div>
  );
}
