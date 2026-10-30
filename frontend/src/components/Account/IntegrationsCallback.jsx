import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Card, Typography, CircularProgress, Button, Alert } from "@mui/joy";
import { useTranslation } from "react-i18next";

import { useToast } from "../../contexts/ToastContext";
import { api } from "../../api/client";
import { INTEGRATION_STATE_KEY, INTEGRATION_SERVER_KEY } from "./Integrations";

/**
 * OAuth redirect target for per-user MCP integrations.
 * Mounted at /account/integrations/callback. The authorization server sends
 * the user here with `code` + `state`; we post them (plus the state token we
 * stashed before redirecting) to the backend, which finishes the exchange.
 */
export default function IntegrationsCallback() {
  const { t } = useTranslation("Account");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [error, setError] = useState("");
  const processedRef = useRef(false);

  useEffect(() => {
    // Prevent double-processing in React StrictMode
    if (processedRef.current) return;
    processedRef.current = true;

    const run = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const oauthError = searchParams.get("error");
      const oauthErrorDescription = searchParams.get("error_description");
      const stateToken = sessionStorage.getItem(INTEGRATION_STATE_KEY);
      const server = sessionStorage.getItem(INTEGRATION_SERVER_KEY);

      sessionStorage.removeItem(INTEGRATION_STATE_KEY);
      sessionStorage.removeItem(INTEGRATION_SERVER_KEY);

      if (oauthError) {
        setError(oauthErrorDescription || oauthError);
        return;
      }
      if (!code || !state || !stateToken || !server) {
        setError(t("integrationCallbackMissing"));
        return;
      }

      try {
        const result = await api.completeIntegrationAuth(server, { code, state, stateToken });
        toast.success(t("integrationConnectedToast", { name: result?.title || server }));
        navigate("/account/integrations", { replace: true });
      } catch (err) {
        setError(err?.response?.data?.error || err?.message || t("integrationCallbackFailed"));
      }
    };

    run();
  }, [searchParams, navigate, t, toast]);

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <Card variant="outlined" sx={{ width: 460, p: 3, textAlign: "center" }}>
        {error ? (
          <>
            <Typography level="h4" sx={{ mb: 2 }}>
              {t("integrationCallbackErrorTitle")}
            </Typography>
            <Alert color="danger" variant="soft" sx={{ mb: 3, textAlign: "left" }}>
              {error}
            </Alert>
            <Button onClick={() => navigate("/account/integrations", { replace: true })}>
              {t("integrationBackToIntegrations")}
            </Button>
          </>
        ) : (
          <>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography level="body-md" sx={{ color: "var(--text-secondary)" }}>
              {t("integrationCallbackWorking")}
            </Typography>
          </>
        )}
      </Card>
    </Box>
  );
}
