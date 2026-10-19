import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('capacitor-native');
  void StatusBar.setOverlaysWebView({ overlay: false });
  void StatusBar.setStyle({ style: Style.Light });
  void StatusBar.setBackgroundColor({ color: '#f8fafd' });
  void NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void NativeApp.minimizeApp();
  });
  void NativeApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('theory-exam:app-resume'));
  });
  void NativeApp.addListener('appRestoredResult', result => {
    window.dispatchEvent(new CustomEvent('theory-exam:app-restored-result', { detail: result }));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
