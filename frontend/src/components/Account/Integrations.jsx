import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Card,
  Button,
  Alert,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Sheet,
} from "@mui/joy";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ExtensionIcon from "@mui/icons-material/Extension";
import { useTranslation } from "react-i18next";

import { useToast } from "../../contexts/ToastContext";
import { api } from "../../api/client";

export const INTEGRATION_STATE_KEY = "mcp_oauth_state_token";
export const INTEGRATION_SERVER_KEY = "mcp_oauth_server";

export default function Integrations() {
  const toast = useToast();
  const { t } = useTranslation("Account");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null); // server name currently being connected/disconnected

  const load = useCallback(async () => {
    try {
      const data = await api.getIntegrations();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Unknown error";
      toast.error(t("integrationsLoadFailed", { message }));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const formatDate = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return "";
    }
  };

  const handleConnect = async (server) => {
    setBusy(server);
    try {
      const { url, stateToken } = await api.startIntegrationAuth(server);
      sessionStorage.setItem(INTEGRATION_STATE_KEY, stateToken);
      sessionStorage.setItem(INTEGRATION_SERVER_KEY, server);
      window.location.href = url;
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Unknown error";
      toast.error(t("integrationConnectFailed", { message }));
      setBusy(null);
    }
  };

  const handleDisconnect = async (server) => {
    setBusy(server);
    try {
      const updated = await api.disconnectIntegration(server);
      setItems((prev) => prev.map((it) => (it.name === server ? updated : it)));
      toast.success(t("integrationDisconnectedToast", { name: updated.title || server }));
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Unknown error";
      toast.error(t("integrationDisconnectFailed", { message }));
    } finally {
      setBusy(null);
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
            {t("integrations")}
          </Typography>
          <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
            {t("integrationsDescription")}
          </Typography>
        </Box>

        {items.length === 0 ? (
          <Alert color="neutral" variant="soft" startDecorator={<InfoOutlinedIcon />}>
            {t("integrationsEmpty")}
          </Alert>
        ) : (
          <Stack spacing={2}>
            {items.map((item) => {
              const isBusy = busy === item.name;
              return (
                <Card key={item.name} variant="outlined" sx={{ width: "100%" }}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <Sheet
                      variant="soft"
                      color="primary"
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "sm",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <ExtensionIcon sx={{ fontSize: 20 }} />
                    </Sheet>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography level="title-md" noWrap>
                        {item.title || item.name}
                      </Typography>
                      <Typography
                        level="body-xs"
                        noWrap
                        sx={{ color: "var(--text-secondary)", fontFamily: "monospace" }}
                      >
                        {item.url}
                      </Typography>
                    </Box>
                    {item.connected ? (
                      <Chip size="sm" variant="soft" color="success">
                        {t("integrationStatusConnected")}
                      </Chip>
                    ) : item.needsReauth ? (
                      <Chip size="sm" variant="soft" color="warning">
                        {t("integrationStatusReauth")}
                      </Chip>
                    ) : (
                      <Chip size="sm" variant="soft" color="neutral">
                        {t("integrationStatusNotConnected")}
                      </Chip>
                    )}
                  </Stack>

                  {item.description && (
                    <Typography level="body-sm" sx={{ color: "var(--text-secondary)", mb: 1 }}>
                      {item.description}
                    </Typography>
                  )}

                  <Divider sx={{ my: 1 }} />

                  {item.connected ? (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <Alert color="success" variant="soft" startDecorator={<CheckCircleOutlinedIcon />}>
                        <Box>
                          <Typography level="body-sm">
                            {t("integrationConnected", { name: item.title || item.name })}
                          </Typography>
                          {item.connectedAt && (
                            <Typography level="body-xs" sx={{ color: "var(--text-secondary)", mt: 0.5 }}>
                              {t("integrationConnectedAt", { date: formatDate(item.connectedAt) })}
                            </Typography>
                          )}
                          {item.scope && (
                            <Typography level="body-xs" sx={{ color: "var(--text-secondary)", mt: 0.5 }}>
                              {t("integrationScopes", { scopes: item.scope })}
                            </Typography>
                          )}
                        </Box>
                      </Alert>
                      <Button
                        variant="outlined"
                        color="danger"
                        startDecorator={<LinkOffIcon />}
                        onClick={() => handleDisconnect(item.name)}
                        loading={isBusy}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        {t("integrationDisconnect")}
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {item.needsReauth && (
                        <Alert color="warning" variant="soft" startDecorator={<WarningAmberOutlinedIcon />}>
                          {t("integrationReauthRequired", { message: item.lastError || "" })}
                        </Alert>
                      )}
                      <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
                        {t("integrationStartFlow", { name: item.title || item.name })}
                      </Typography>
                      <Button
                        startDecorator={<LinkIcon />}
                        onClick={() => handleConnect(item.name)}
                        loading={isBusy}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        {item.needsReauth ? t("integrationReconnect") : t("integrationConnect")}
                      </Button>
                    </Box>
                  )}
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
