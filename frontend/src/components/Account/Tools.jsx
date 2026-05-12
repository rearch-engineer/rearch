import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  Button,
  Input,
  FormControl,
  FormLabel,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/joy";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { api } from "../../api/client";

export default function Tools() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const { t } = useTranslation("Account");

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getPublicIntegrationsSettings();
        if (!cancelled) setSettings(data);
      } catch (err) {
        console.error("Failed to load integrations settings:", err);
        if (!cancelled) setSettings({ githubCopilotEnabled: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copilot = user?.tools?.github_copilot;
  const isConnected = copilot?.connected === true;

  const formatDate = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return "";
    }
  };

  const handleConnect = async (e) => {
    e?.preventDefault?.();
    if (!token.trim()) return;
    setConnecting(true);
    try {
      await api.connectGithubCopilot(token.trim());
      await refreshUser();
      setToken("");
      toast.success(t("githubCopilotConnectedToast"));
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Unknown error";
      toast.error(t("githubCopilotConnectFailed", { message }));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.disconnectGithubCopilot();
      await refreshUser();
      toast.success(t("githubCopilotDisconnectedToast"));
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Unknown error";
      toast.error(t("githubCopilotDisconnectFailed", { message }));
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          flex: 1,
          p: { xs: 2, sm: 3, md: 4 },
          bgcolor: "var(--bg-primary)",
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const githubCopilotEnabled = settings?.githubCopilotEnabled === true;

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
        overflow: "auto",
      }}
    >
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        <Box sx={{ mb: 4 }}>
          <Typography
            level="h2"
            sx={{
              mb: 1,
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: { xs: "1.5rem", md: "1.75rem" },
            }}
          >
            {t("tools")}
          </Typography>
          <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
            {t("toolsDescription")}
          </Typography>
        </Box>

        <Card variant="outlined" sx={{ width: "100%" }}>
          <Typography level="title-md" sx={{ mb: 1 }}>
            {t("githubCopilot")}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          {!githubCopilotEnabled ? (
            <Alert
              color="neutral"
              variant="soft"
              startDecorator={<InfoOutlinedIcon />}
            >
              {t("githubCopilotNotEnabled")}
            </Alert>
          ) : isConnected ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Alert
                color="success"
                variant="soft"
                startDecorator={<CheckCircleOutlinedIcon />}
              >
                <Box>
                  <Typography level="body-sm">
                    {t("githubCopilotConnected")}
                  </Typography>
                  {copilot?.connected_at && (
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-secondary)", mt: 0.5 }}
                    >
                      {t("githubCopilotConnectedAt", {
                        date: formatDate(copilot.connected_at),
                      })}
                    </Typography>
                  )}
                </Box>
              </Alert>

              <Button
                variant="outlined"
                color="danger"
                onClick={handleDisconnect}
                loading={disconnecting}
                sx={{ alignSelf: "flex-start" }}
              >
                {t("githubCopilotDisconnect")}
              </Button>
            </Box>
          ) : (
            <form onSubmit={handleConnect}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Typography
                  level="body-sm"
                  sx={{ color: "var(--text-secondary)" }}
                >
                  {t("githubCopilotConnectDescription")}
                </Typography>

                <FormControl>
                  <FormLabel>{t("githubCopilot")}</FormLabel>
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t("githubCopilotTokenPlaceholder")}
                    autoComplete="off"
                  />
                </FormControl>

                <Button
                  type="submit"
                  loading={connecting}
                  disabled={!token.trim()}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {t("githubCopilotConnect")}
                </Button>
              </Box>
            </form>
          )}
        </Card>
      </Box>
    </Box>
  );
}
