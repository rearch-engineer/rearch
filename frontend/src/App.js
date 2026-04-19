import { useEffect, useState } from "react";
import i18n from "./i18n";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import config, { isTauri, applyTauriConfig } from "./config";
import ServerSetupPage from "./pages/ServerSetupPage";
import { Box } from "@mui/joy";
import { useColorScheme } from "@mui/joy/styles";
import MainMenu from "./components/MainMenu";
import ErrorBoundary from "./components/ErrorBoundary";
import ConversationsPage from "./pages/ConversationsPage";
import AdministrationPage from "./pages/AdministrationPage";
import AccountPage from "./pages/AccountPage";
import CommandPalette from "./components/CommandPalette";
import LoginPage from "./pages/LoginPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import StartPage from "./pages/StartPage";
import { ResourcesProvider } from "./contexts/ResourcesContext";
import { SkillsProvider } from "./contexts/SkillsContext";
import { JobsProvider } from "./contexts/JobsContext";
import { SocketProvider } from "./contexts/SocketContext";
import { ConversationsProvider } from "./contexts/ConversationsContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import "./App.css";

/**
 * Route guard: redirects to /login if the user is not authenticated.
 * Saves the current URL (including hash) so the user can be redirected
 * back after login.
 */
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        {i18n.t('loading', { ns: 'App' })}
      </Box>
    );
  }

  if (!isAuthenticated) {
    // Save the intended URL (path + hash) so we can redirect after login.
    // window.location.hash is not available via React Router's location object,
    // so we read it from the browser directly.
    const intended = window.location.pathname + window.location.hash;
    if (intended && intended !== "/" && intended !== "/login") {
      sessionStorage.setItem("start_redirect", intended);
    }
    return <Navigate to="/login" replace />;
  }

  return children;
}

/**
 * Route guard: redirects to / if the user is already authenticated.
 * Checks for a saved redirect URL (e.g. /start#repo) to honour deep links.
 */
function RedirectIfAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        {i18n.t('loading', { ns: 'App' })}
      </Box>
    );
  }

  if (isAuthenticated) {
    const redirect = sessionStorage.getItem("start_redirect");
    if (redirect) {
      sessionStorage.removeItem("start_redirect");
      return <Navigate to={redirect} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * Applies the user's saved language preference on load.
 */
function LanguageApplier() {
  const { user } = useAuth();

  useEffect(() => {
    const savedLang = user?.profile?.preferences?.language;
    if (savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, [user]);

  return null;
}

/**
 * Applies the user's saved theme preference on load.
 * Rendered inside CssVarsProvider so it can use useColorScheme().
 */
function ThemeApplier() {
  const { user } = useAuth();
  const { setMode } = useColorScheme();

  useEffect(() => {
    const savedTheme = user?.profile?.preferences?.theme;
    if (savedTheme && ["light", "dark", "system"].includes(savedTheme)) {
      setMode(savedTheme);
    }
  }, [user, setMode]);

  return null;
}

/**
 * On mount, checks if there is a saved redirect URL (e.g. from /start#repo links
 * that were visited before authentication). If found, navigates there once.
 * Works for all auth modes including KEYCLOAK_FIREWALL.
 */
function StartRedirectHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const redirect = sessionStorage.getItem("start_redirect");
    if (redirect) {
      sessionStorage.removeItem("start_redirect");
      navigate(redirect, { replace: true });
    }
  }, [navigate]);

  return null;
}

/**
 * The authenticated app layout with navigation, providers, and protected routes.
 */
function AuthenticatedApp() {
  return (
    <SocketProvider>
      <JobsProvider>
        <ResourcesProvider>
            <SkillsProvider>
              <ConversationsProvider>
                <LanguageApplier />
                <ThemeApplier />
                <StartRedirectHandler />
                <CommandPalette />
                <Box
                  sx={{
                    width: "100%",
                    height: "100vh",
                    display: "flex",
                    overflow: "hidden",
                  }}
                >
                  <div className="main-menu-wrapper">
                    <MainMenu />
                  </div>
                  <ErrorBoundary>
                    <Routes>
                      <Route
                        path="/"
                        element={<Navigate to="/conversations/new" replace />}
                      />
                      <Route path="/start" element={<StartPage />} />
                      <Route
                        path="/conversations/:id"
                        element={<ConversationsPage />}
                      />
                      <Route
                        path="/administration/*"
                        element={<AdministrationPage />}
                      />
                      <Route path="/account/*" element={<AccountPage />} />
                    </Routes>
                  </ErrorBoundary>
                </Box>
              </ConversationsProvider>
            </SkillsProvider>
        </ResourcesProvider>
      </JobsProvider>
    </SocketProvider>
  );
}

function App() {
  const [tauriReady, setTauriReady] = useState(!isTauri);
  const [needsServerSetup, setNeedsServerSetup] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    applyTauriConfig().then(() => {
      // Show server setup only if the Tauri store returned an empty URL
      // AND there are no defaults from __RUNTIME_CONFIG__ / config.js.
      // In dev mode, the defaults (localhost:5000) are fine — skip setup.
      if (!config.API_BASE_URL) {
        setNeedsServerSetup(true);
      }
      setTauriReady(true);
    });
  }, []);

  if (!tauriReady) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Loading...
      </Box>
    );
  }

  if (needsServerSetup) {
    return <ServerSetupPage />;
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route
                path="/login"
                element={
                  <RedirectIfAuth>
                    <LoginPage />
                  </RedirectIfAuth>
                }
              />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />

              {/* Protected routes */}
              <Route
                path="/*"
                element={
                  <RequireAuth>
                    <AuthenticatedApp />
                  </RequireAuth>
                }
              />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
