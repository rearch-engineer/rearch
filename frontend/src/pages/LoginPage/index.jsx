import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Input,
  Button,
  FormControl,
  FormLabel,
  FormHelperText,
  Divider,
  Link,
  CircularProgress,
} from "@mui/joy";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { api } from "../../api/client";

export default function LoginPage() {
  const { t } = useTranslation("LoginPage");
  const navigate = useNavigate();
  const {
    authMode,
    login,
    register,
    getOAuthAuthorizeUrl,
    loading: authLoading,
  } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [loading, setLoading] = useState(false);

  // Signup restriction state
  const [signupRestricted, setSignupRestricted] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState([]);
  const [signupSettingsLoaded, setSignupSettingsLoaded] = useState(false);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Fetch signup restriction settings on mount
  React.useEffect(() => {
    if (authMode === "LOCAL") {
      api
        .getSignupSettings()
        .then((data) => {
          setSignupRestricted(data.restrictSignups || false);
          setAllowedDomains(data.allowedDomains || []);
        })
        .catch(() => {
          // If fetch fails, allow registration by default
        })
        .finally(() => setSignupSettingsLoaded(true));
    } else {
      setSignupSettingsLoaded(true);
    }
  }, [authMode]);

  const canRegister = signupSettingsLoaded && !signupRestricted;

  const handleLocalLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      const redirect = sessionStorage.getItem("start_redirect");
      sessionStorage.removeItem("start_redirect");
      navigate(redirect || "/", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || t("loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await register(email, username, password, displayName);
      toast.success(result.message || t("registrationSuccess"));
      setMode("login");
      setPassword("");
    } catch (err) {
      toast.error(err.response?.data?.error || t("registrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async () => {
    setLoading(true);
    try {
      const { url, stateToken } = await getOAuthAuthorizeUrl();
      // Store stateToken so the callback page can use it
      sessionStorage.setItem("oauth_state_token", stateToken);
      // Redirect to the OIDC provider
      window.location.href = url;
    } catch (err) {
      toast.error(err.response?.data?.error || t("oauthFailed"));
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // ─── KEYCLOAK_FIREWALL mode ───────────────────────────────────────────────
  // In Keycloak mode, the AuthContext handles the redirect via keycloak-js.
  // If we reach the login page, it means Keycloak init is in progress.
  if (authMode === "KEYCLOAK_FIREWALL") {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography level="body-md" sx={{ color: "text.secondary" }}>
          {t("redirectingToProvider")}
        </Typography>
      </Box>
    );
  }

  // ─── NONE mode ─────────────────────────────────────────────────────────────
  // Auto-login is handled in AuthContext. Show a spinner while it completes.
  if (authMode === "NONE") {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography level="body-md" sx={{ color: "text.secondary" }}>
          {t("signingIn")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        bgcolor: "background.level1",
        p: 2,
      }}
    >
      <Card
        variant="plain"
        sx={{ width: 400, p: 4, bgcolor: "transparent", boxShadow: "none" }}
      >
        <Typography level="h3" sx={{ mb: 2, textAlign: "center" }}>
          {mode === "login" || !canRegister ? t("signIn") : t("createAccount")}
        </Typography>

        {authMode === "OAUTH" ? (
          // ─── OAUTH mode ───────────────────────────────────────────────
          <Box>
            <Typography
              level="body-md"
              sx={{ mb: 3, textAlign: "center", color: "text.secondary" }}
            >
              {t("signInWithProvider")}
            </Typography>
            <Button
              fullWidth
              size="lg"
              onClick={handleOAuthLogin}
              loading={loading}
            >
              {t("signInWithSSO")}
            </Button>
          </Box>
        ) : (
          // ─── LOCAL mode ───────────────────────────────────────────────
          <Box>
            {mode === "login" || !canRegister ? (
              <form onSubmit={handleLocalLogin} data-testid="login-form">
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>{t("email")}</FormLabel>
                  <Input
                    data-testid="login-email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </FormControl>
                <FormControl sx={{ mb: 3 }}>
                  <FormLabel>{t("password")}</FormLabel>
                  <Input
                    data-testid="login-password"
                    type="password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </FormControl>
                <Button
                  data-testid="login-submit"
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={loading}
                >
                  {t("signIn")}
                </Button>
                {canRegister && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography level="body-sm" sx={{ textAlign: "center" }}>
                      {t("dontHaveAccount")}{" "}
                      <Link
                        component="button"
                        onClick={() => {
                          setMode("register");
                        }}
                      >
                        {t("createOne")}
                      </Link>
                    </Typography>
                  </>
                )}
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>{t("email")}</FormLabel>
                  <Input
                    type="email"
                    placeholder={
                      allowedDomains.length > 0
                        ? `you@${allowedDomains[0]}`
                        : "you@example.com"
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  {allowedDomains.length > 0 && (
                    <FormHelperText>
                      {t("allowedDomains", {
                        domains: allowedDomains.join(", "),
                      })}
                    </FormHelperText>
                  )}
                </FormControl>
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>{t("username")}</FormLabel>
                  <Input
                    type="text"
                    placeholder={t("usernamePlaceholder")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </FormControl>
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>{t("displayName")}</FormLabel>
                  <Input
                    type="text"
                    placeholder={t("displayNamePlaceholder")}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </FormControl>
                <FormControl sx={{ mb: 3 }}>
                  <FormLabel>{t("password")}</FormLabel>
                  <Input
                    type="password"
                    placeholder={t("passwordMinLengthPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </FormControl>
                <Button type="submit" fullWidth size="lg" loading={loading}>
                  {t("createAccount")}
                </Button>
                <Divider sx={{ my: 2 }} />
                <Typography level="body-sm" sx={{ textAlign: "center" }}>
                  {t("alreadyHaveAccount")}{" "}
                  <Link
                    component="button"
                    onClick={() => {
                      setMode("login");
                    }}
                  >
                    {t("signInLink")}
                  </Link>
                </Typography>
              </form>
            )}
          </Box>
        )}
      </Card>
    </Box>
  );
}
