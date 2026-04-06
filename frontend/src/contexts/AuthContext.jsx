import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import Keycloak from 'keycloak-js';
import config from '../config';

const AuthContext = createContext(null);
const API_BASE_URL = config.API_BASE_URL;
const TOKEN_KEY = 'auth_token';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authMode, setAuthMode] = useState(null); // 'LOCAL' | 'OAUTH' | 'KEYCLOAK_FIREWALL'
  const [loading, setLoading] = useState(true);
  const keycloakRef = useRef(null);
  const keycloakInitialized = useRef(false);

  // Fetch the auth mode from the backend
  const fetchAuthMode = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/auth/mode`);
      return res.data.mode;
    } catch (err) {
      console.error('Failed to fetch auth mode:', err);
      return 'LOCAL';
    }
  }, []);

  // Decode token and set user info
  const setSession = useCallback((jwt) => {
    if (!jwt) {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      return;
    }

    try {
      const decoded = jwtDecode(jwt);
      // Check if token is expired
      if (decoded.exp * 1000 < Date.now()) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        return;
      }

      localStorage.setItem(TOKEN_KEY, jwt);
      setToken(jwt);
      setUser({
        userId: decoded.userId,
        email: decoded.email,
        roles: decoded.roles || []
      });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  // Fetch the full user profile from /auth/me
  const fetchUserProfile = useCallback(async (jwt) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      setUser(prev => ({
        ...prev,
        ...res.data.account,
        profile: res.data.profile,
        roles: res.data.auth?.roles || prev?.roles || []
      }));
    } catch (err) {
      // If the token is invalid (401), clear the session
      if (err.response?.status === 401 || err.response?.status === 403) {
        setSession(null);
      }
    }
  }, [setSession]);

  // ─── Keycloak initialization ───────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initKeycloak = useCallback(async () => {
    try {
      // Get Keycloak config from backend (or use runtime config)
      let kcUrl = config.KEYCLOAK_URL;
      let kcRealm = config.KEYCLOAK_REALM;
      let kcClientId = config.KEYCLOAK_CLIENT_ID;

      // If not set in runtime config, fetch from backend
      if (!kcUrl || !kcRealm || !kcClientId) {
        try {
          const res = await axios.get(`${API_BASE_URL}/auth/keycloak/config`);
          kcUrl = kcUrl || res.data.url;
          kcRealm = kcRealm || res.data.realm;
          kcClientId = kcClientId || res.data.clientId;
        } catch (err) {
          console.error('Failed to fetch Keycloak config:', err);
          setLoading(false);
          return;
        }
      }

      if (!kcUrl || !kcRealm || !kcClientId) {
        console.error('Keycloak configuration is incomplete');
        setLoading(false);
        return;
      }

      const kc = new Keycloak({
        url: kcUrl,
        realm: kcRealm,
        clientId: kcClientId,
      });

      keycloakRef.current = kc;

      const authenticated = await kc.init({
        onLoad: 'login-required',
        checkLoginIframe: false,
        pkceMethod: 'S256',
      });

      if (authenticated) {
        await performKeycloakTokenExchange(kc);

        // Set up token refresh
        setInterval(async () => {
          try {
            const refreshed = await kc.updateToken(30); // refresh if expiring in 30s
            if (refreshed) {
              await performKeycloakTokenExchange(kc);
            }
          } catch (err) {
            console.error('Failed to refresh Keycloak token:', err);
            kc.login();
          }
        }, 30000); // check every 30 seconds
      }

      setLoading(false);
    } catch (err) {
      console.error('Keycloak init error:', err);
      setLoading(false);
    }
  }, []);

  /**
   * Exchange the Keycloak access token for an app JWT.
   * Stores the Keycloak token for API calls and the app JWT for Socket.IO.
   */
  const performKeycloakTokenExchange = useCallback(async (kc) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/keycloak/token-exchange`, {
        keycloakToken: kc.token,
      });

      const appJwt = res.data.token;
      const userData = res.data.user;

      // Store the Keycloak token as the primary auth token (for API calls)
      // and the app JWT in a separate key (for Socket.IO)
      localStorage.setItem(TOKEN_KEY, kc.token);
      localStorage.setItem('app_jwt', appJwt);
      setToken(kc.token);

      setUser({
        userId: userData._id || userData.account?.email,
        email: userData.account?.email,
        username: userData.account?.username,
        profile: userData.profile,
        roles: userData.auth?.roles || ['user'],
      });
    } catch (err) {
      console.error('Keycloak token exchange failed:', err);
      if (err.response?.status === 403) {
        // Account suspended/pending - show error but don't redirect
        setUser(null);
        setToken(null);
      }
    }
  }, []);

  // Initialize: load token from localStorage and fetch auth mode
  useEffect(() => {
    if (keycloakInitialized.current) return;
    keycloakInitialized.current = true;

    const init = async () => {
      const mode = await fetchAuthMode();
      setAuthMode(mode);

      if (mode === 'KEYCLOAK_FIREWALL') {
        // Before Keycloak redirects to the IdP, save the current URL
        // (including hash fragment) so we can restore it after login.
        // The hash is not preserved through Keycloak's redirect flow.
        // Only save /start paths — other pages don't need redirect preservation.
        const intended = window.location.pathname + window.location.hash;
        if (intended && intended.startsWith('/start')) {
          sessionStorage.setItem('start_redirect', intended);
        }
        await initKeycloak();
      } else {
        // LOCAL or OAUTH mode: use existing token flow
        const savedToken = localStorage.getItem(TOKEN_KEY);
        if (savedToken) {
          setSession(savedToken);
          await fetchUserProfile(savedToken);
        }
        setLoading(false);
      }
    };
    init();
  }, [fetchAuthMode, setSession, fetchUserProfile, initKeycloak]);

  // ─── LOCAL auth actions ─────────────────────────────────────────────────────

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
    setSession(res.data.token);
    setUser(prev => ({
      ...prev,
      ...res.data.user?.account,
      profile: res.data.user?.profile,
      roles: res.data.user?.auth?.roles || prev?.roles || []
    }));
    return res.data;
  }, [setSession]);

  const register = useCallback(async (email, username, password, display_name) => {
    const res = await axios.post(`${API_BASE_URL}/auth/register`, {
      email, username, password, display_name
    });
    return res.data;
  }, []);

  // ─── OAUTH actions ─────────────────────────────────────────────────────────

  const getOAuthAuthorizeUrl = useCallback(async () => {
    const res = await axios.get(`${API_BASE_URL}/auth/oauth/authorize`);
    return res.data; // { url, stateToken }
  }, []);

  const handleOAuthCallback = useCallback(async (code, state, stateToken) => {
    const res = await axios.post(`${API_BASE_URL}/auth/oauth/callback`, {
      code, state, stateToken
    });
    if (res.data.token) {
      setSession(res.data.token);
      setUser(prev => ({
        ...prev,
        ...res.data.user?.account,
        profile: res.data.user?.profile,
        roles: res.data.user?.auth?.roles || prev?.roles || []
      }));
    }
    return res.data;
  }, [setSession]);

  // ─── Logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    setSession(null);
    localStorage.removeItem('app_jwt');

    // In Keycloak mode, also log out of Keycloak
    if (keycloakRef.current) {
      keycloakRef.current.logout({
        redirectUri: window.location.origin + '/login',
      });
    }
  }, [setSession]);

  // ─── Role helpers ───────────────────────────────────────────────────────────

  const hasRole = useCallback((role) => {
    return user?.roles?.includes(role) || false;
  }, [user]);

  const isAdmin = useCallback(() => {
    return hasRole('admin');
  }, [hasRole]);

  // Refresh user profile from the server (e.g. after updating preferences)
  const refreshUser = useCallback(async () => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      await fetchUserProfile(currentToken);
    }
  }, [fetchUserProfile]);

  /**
   * Get the appropriate token for Socket.IO connections.
   * In Keycloak mode, returns the app JWT (from token exchange).
   * In other modes, returns the regular auth token.
   */
  const getSocketToken = useCallback(() => {
    if (authMode === 'KEYCLOAK_FIREWALL') {
      return localStorage.getItem('app_jwt') || localStorage.getItem(TOKEN_KEY);
    }
    return localStorage.getItem(TOKEN_KEY);
  }, [authMode]);

  const value = {
    user,
    token,
    authMode,
    loading,
    isAuthenticated: !!token && !!user,
    login,
    register,
    logout,
    refreshUser,
    getOAuthAuthorizeUrl,
    handleOAuthCallback,
    hasRole,
    isAdmin,
    getSocketToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
