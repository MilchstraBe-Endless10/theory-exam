import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest, authSessionEvent, currentToken, previewMode, savedServerAddress, serverConfigEvent, type ApiUser } from '../services/api';

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
    const address = savedServerAddress();
    setServerAddress(address);
    if (!address) { setServerStatus('disconnected'); return; }
    void refreshServer();
    if (!currentToken()) return;
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
  </AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
