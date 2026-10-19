import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { IconShieldLock } from '@tabler/icons-react';
import { apiRequest, authSessionEvent, persistentSession, previewMode, saveSession, savedServerAddress, serverConfigEvent, type ApiSession, type ApiUser } from '../services/api';

interface AuthState {
  user: ApiUser | null;
  serverAddress: string;
  serverStatus: 'disconnected' | 'checking' | 'connected' | 'unavailable';
  sessionExpired: boolean;
  setUser: (user: ApiUser | null) => void;
  refreshServer: () => Promise<void>;
  dismissExpired: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { search } = useLocation();
  const preview = previewMode(search);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [serverAddress, setServerAddress] = useState(savedServerAddress());
  const [serverStatus, setServerStatus] = useState<AuthState['serverStatus']>('disconnected');
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef<ApiUser | null>(null);

  useEffect(() => { userRef.current = user; }, [user]);

  const refreshServer = async () => {
    const address = savedServerAddress();
    setServerAddress(address);
    if (!address || preview) { setServerStatus('disconnected'); return; }
    setServerStatus('checking');
    try {
      await apiRequest('/api/health', { base: address, auth: false, timeoutMs: 5000 });
      setServerStatus('connected');
    } catch { setServerStatus('unavailable'); }
  };

  useEffect(() => {
    const syncSession = (event: Event) => {
      const detail = (event as CustomEvent<{ user?: ApiUser | null; expired?: boolean }>).detail;
      setUser(detail?.user ?? null);
      if (detail?.expired) setSessionExpired(true);
      else if (detail?.user) setSessionExpired(false);
    };
    const syncServer = () => { setServerAddress(savedServerAddress()); void refreshServer(); };
    window.addEventListener(authSessionEvent, syncSession);
    window.addEventListener(serverConfigEvent, syncServer);
    return () => {
      window.removeEventListener(authSessionEvent, syncSession);
      window.removeEventListener(serverConfigEvent, syncServer);
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    let active = true;
    let listener: { remove: () => Promise<void> } | undefined;
    let renewal: Promise<void> | null = null;
    const refreshSession = () => {
      void refreshServer();
      const address = savedServerAddress();
      if (!address || !userRef.current || userRef.current.mustChangePassword || renewal) return;
      renewal = apiRequest<ApiSession>('/api/auth/renew', { base: address, method: 'POST', body: {} })
        .then(async session => {
          await saveSession(session, persistentSession());
          if (active) setUser(session.user);
        })
        .catch(() => undefined)
        .finally(() => { renewal = null; });
    };
    if (Capacitor.isNativePlatform()) {
      void Network.getStatus().then(status => { if (active && !status.connected) setServerStatus('unavailable'); });
      void Network.addListener('networkStatusChange', status => {
        if (!active) return;
        if (!status.connected) setServerStatus('unavailable');
        else refreshSession();
      }).then(handle => { listener = handle; if (!active) void handle.remove(); });
      window.addEventListener('theory-exam:app-resume', refreshSession);
    } else {
      const onVisible = () => { if (document.visibilityState === 'visible') refreshSession(); };
      document.addEventListener('visibilitychange', onVisible);
      return () => { active = false; document.removeEventListener('visibilitychange', onVisible); };
    }
    return () => { active = false; void listener?.remove(); window.removeEventListener('theory-exam:app-resume', refreshSession); };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    const address = savedServerAddress();
    setServerAddress(address);
    if (!address) { setServerStatus('disconnected'); return; }
    void refreshServer();
    apiRequest<ApiUser>('/api/auth/me', { base: address }).then(setUser).catch(() => setUser(null));
  }, [preview]);

  const value = useMemo<AuthState>(() => ({
    user, serverAddress, serverStatus, sessionExpired,
    setUser,
    refreshServer,
    dismissExpired: () => setSessionExpired(false),
  }), [user, serverAddress, serverStatus, sessionExpired]);

  return <AuthContext.Provider value={value}>
    {sessionExpired && !preview && <div className="session-expired-banner" role="alert"><span>登录已失效，请重新登录。</span><button onClick={() => setSessionExpired(false)}>知道了</button></div>}
    {children}
    <FirstPasswordChangeGate />
  </AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

function FirstPasswordChangeGate() {
  const { user, setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user?.mustChangePassword) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) { setError('两次输入的新密码不一致。'); return; }
    setSaving(true);
    try {
      const session = await apiRequest<ApiSession>('/api/auth/password', {
        method: 'POST', body: { currentPassword, newPassword },
      });
      await saveSession(session, persistentSession());
      setUser(session.user);
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '密码修改失败，请重试。');
    } finally { setSaving(false); }
  };

  return <div className="password-gate-backdrop">
    <section className="password-gate-card" role="dialog" aria-modal="true" aria-labelledby="password-gate-title">
      <span className="password-gate-icon" aria-hidden="true"><IconShieldLock size={22} /></span>
      <h1 id="password-gate-title">请先修改初始密码</h1>
      <p>首次登录需要设置新密码。保存后，初始密码和已有登录会话将失效。</p>
      <form onSubmit={submit}>
        <label>当前初始密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label>
        <label>新密码（至少 12 位）<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label>
        <label>确认新密码<input type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="mobile-button" disabled={saving}>{saving ? '正在安全保存…' : '修改密码并继续'}</button>
      </form>
    </section>
  </div>;
}
