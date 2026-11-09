import React from 'react';
import ReactDOM from 'react-dom/client';
import { useEffect } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';

const SystemBars = registerPlugin<{ setVisible(options: { visible: boolean }): Promise<void> }>('SystemBars');

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('capacitor-native');
  void NativeApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('theory-exam:app-resume'));
  });
  void NativeApp.addListener('appRestoredResult', result => {
    window.dispatchEvent(new CustomEvent('theory-exam:app-restored-result', { detail: result }));
  });
}

function NativeStatusBar() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const immersive = pathname === '/start';
    const background = pathname === '/connect' || pathname === '/login' ? '#ffffff' : '#f8fafd';
    let active = true;
    void (async () => {
      await StatusBar.setOverlaysWebView({ overlay: immersive });
      if (!active) return;
      await StatusBar.setStyle({ style: immersive ? Style.Dark : Style.Light });
      if (!active) return;
      await SystemBars.setVisible({ visible: !immersive });
      if (!active || immersive) return;
      await StatusBar.setBackgroundColor({ color: background });
    })().catch(error => console.warn('Native status bar update failed', error));
    return () => { active = false; };
  }, [pathname]);

  return null;
}

function NativeBackButtonHandler() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let listener: { remove: () => Promise<void> } | undefined;
    void NativeApp.addListener('backButton', ({ canGoBack }) => {
      if (document.body.classList.contains('barcode-scanner-active')) {
        window.dispatchEvent(new Event('theory-exam:scanner-back'));
        return;
      }
      const historyIndex = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
      if (canGoBack || historyIndex > 0) navigate(-1);
      else if (pathname !== '/') {
        const parent = ['/practice/', '/exams/', '/mistakes/'].find(prefix => pathname.startsWith(prefix));
        navigate(parent ? parent.slice(0, -1) : '/', { replace: true });
      } else void NativeApp.minimizeApp();
    }).then(handle => {
      listener = handle;
      if (!active) void handle.remove();
    });
    return () => { active = false; void listener?.remove(); };
  }, [navigate, pathname]);

  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NativeStatusBar />
      <NativeBackButtonHandler />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
