import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
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
import { ToolsProvider } from "./contexts/ToolsContext";
import { SkillsProvider } from "./contexts/SkillsContext";
import { JobsProvider } from "./contexts/JobsContext";
import { SocketProvider } from "./contexts/SocketContext";
import { ConversationsProvider } from "./contexts/ConversationsContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
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
        Loading...
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
        Loading...
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
          <ToolsProvider>
            <SkillsProvider>
              <ConversationsProvider>
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
          </ToolsProvider>
        </ResourcesProvider>
      </JobsProvider>
    </SocketProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
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
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
