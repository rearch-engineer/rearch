import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Card,
  Button,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/joy";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
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
  const [disconnecting, setDisconnecting] = useState(false);

  // Device-flow state machine: idle | started | polling | error
  const [flowState, setFlowState] = useState("idle");
  const [deviceCode, setDeviceCode] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollIntervalRef = useRef(null);

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

  // Ensure any active polling is cleared when the component unmounts
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
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

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const handleCancel = () => {
    stopPolling();
    setDeviceCode(null);
    setErrorMsg("");
    setFlowState("idle");
  };

  const handleCopyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("githubCopilotCodeCopied"));
    } catch {
      // Ignore — non-fatal
    }
  };

  const startPolling = (codeData) => {
    stopPolling();
    const intervalMs = Math.max(1, codeData.interval || 5) * 1000;

    const tick = async () => {
      try {
        const result = await api.pollGithubCopilotDeviceFlow(
          codeData.device_code_token,
        );

        if (result.status === "authorized") {
          stopPolling();
          await refreshUser();
          setDeviceCode(null);
          setFlowState("idle");
          toast.success(t("githubCopilotConnectedToast"));
          return;
        }

        if (result.status === "expired") {
          stopPolling();
          setErrorMsg(t("githubCopilotExpired"));
          setFlowState("error");
          return;
        }

        if (result.status === "denied") {
          stopPolling();
          setErrorMsg(t("githubCopilotDenied"));
          setFlowState("error");
          return;
        }

        if (result.status === "pending") {
          // Update interval if GitHub asked us to slow down
          if (result.interval && pollIntervalRef.current) {
            const newMs = Math.max(1, result.interval) * 1000;
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = setInterval(tick, newMs);
          }
          return;
        }

        // Unknown status — surface as error
        stopPolling();
        setErrorMsg(
          t("githubCopilotFlowFailed", {
            message: result.message || "unknown",
          }),
        );
        setFlowState("error");
      } catch (err) {
        stopPolling();
        const message =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Unknown error";
        setErrorMsg(t("githubCopilotFlowFailed", { message }));
        setFlowState("error");
      }
    };

    pollIntervalRef.current = setInterval(tick, intervalMs);
  };

  const handleStart = async () => {
    setErrorMsg("");
    setFlowState("started");
    try {
      const data = await api.startGithubCopilotDeviceFlow();
      setDeviceCode(data);
      setFlowState("polling");
      startPolling(data);
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Unknown error";
      setErrorMsg(t("githubCopilotFlowFailed", { message }));
      setFlowState("error");
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
          ) : flowState === "polling" && deviceCode ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography
                level="body-sm"
                sx={{ color: "var(--text-secondary)" }}
              >
                {t("githubCopilotEnterCode", {
                  url: deviceCode.verification_uri,
                })}
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: 2,
                  bgcolor: "var(--bg-secondary)",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px solid var(--border-color)",
                  alignSelf: "flex-start",
                }}
              >
                <Typography
                  level="h3"
                  sx={{
                    fontFamily: "monospace",
                    letterSpacing: "0.15em",
                    color: "var(--text-primary)",
                  }}
                >
                  {deviceCode.user_code}
                </Typography>
                <Button
                  variant="plain"
                  size="sm"
                  onClick={() => handleCopyCode(deviceCode.user_code)}
                  startDecorator={<ContentCopyOutlinedIcon fontSize="small" />}
                >
                  {t("githubCopilotCopy")}
                </Button>
              </Box>

              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Button
                  component="a"
                  href={deviceCode.verification_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  startDecorator={<OpenInNewOutlinedIcon />}
                >
                  {t("githubCopilotOpenGitHub")}
                </Button>
                <Button variant="outlined" onClick={handleCancel}>
                  {t("githubCopilotCancel")}
                </Button>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mt: 1,
                  color: "var(--text-secondary)",
                }}
              >
                <CircularProgress size="sm" />
                <Typography level="body-sm">
                  {t("githubCopilotWaitingAuth")}
                </Typography>
              </Box>
            </Box>
          ) : flowState === "error" ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Alert color="danger" variant="soft">
                {errorMsg}
              </Alert>
              <Button
                onClick={handleStart}
                sx={{ alignSelf: "flex-start" }}
              >
                {t("githubCopilotTryAgain")}
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography
                level="body-sm"
                sx={{ color: "var(--text-secondary)" }}
              >
                {t("githubCopilotStartFlow")}
              </Typography>

              <Button
                onClick={handleStart}
                loading={flowState === "started"}
                sx={{ alignSelf: "flex-start" }}
              >
                {t("githubCopilotConnect")}
              </Button>
            </Box>
          )}
        </Card>
      </Box>
    </Box>
  );
}
