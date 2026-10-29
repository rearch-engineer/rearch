import React, { useState } from 'react';
import { useTranslation } from "react-i18next";
import {
  Box, Button, Typography, FormControl, FormLabel, FormHelperText,
  Input, Select, Option, Alert, Stack,
} from '@mui/joy';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { api } from '../../api/client';

/**
 * Authentication block for remote MCP servers (shared headers vs. per-user
 * OAuth). Used by both the "add manually" and "edit" pages.
 *
 * Props:
 *   - auth:      { mode: 'shared' | 'oauth-user', scopes: string }
 *   - onChange:  (nextAuth) => void
 *   - url:       the server URL (used by the "Check OAuth support" probe)
 *   - oauthInfo: discovered/registered metadata from the saved server (optional)
 */
export default function McpAuthFields({ auth, onChange, url, oauthInfo }) {
  const { t } = useTranslation("Administration");
  const [checking, setChecking] = useState(false);
  const [probe, setProbe] = useState(null); // { supported, dynamicRegistration, authorizationServer, error }

  const mode = auth?.mode || 'shared';

  const handleCheck = async () => {
    if (!url) return;
    setChecking(true);
    setProbe(null);
    try {
      const result = await api.discoverMcpOAuth(url);
      setProbe(result);
    } catch (err) {
      setProbe({
        supported: false,
        error: err.response?.data?.error || err.message,
      });
    } finally {
      setChecking(false);
    }
  };

  const labelSx = { color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' };
  const inputSx = { bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' };

  return (
    <>
      <FormControl>
        <FormLabel sx={labelSx}>{t("mcpAuth.authentication")}</FormLabel>
        <Select
          value={mode}
          onChange={(_, val) => onChange({ ...auth, mode: val || 'shared' })}
          sx={inputSx}
        >
          <Option value="shared">{t("mcpAuth.authShared")}</Option>
          <Option value="oauth-user">{t("mcpAuth.authOAuthUser")}</Option>
        </Select>
        {mode === 'oauth-user' && (
          <FormHelperText sx={{ color: 'var(--text-tertiary)' }}>
            {t("mcpAuth.authOAuthUserHelp")}
          </FormHelperText>
        )}
      </FormControl>

      {mode === 'oauth-user' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl>
            <FormLabel sx={labelSx}>{t("mcpAuth.oauthScopes")}</FormLabel>
            <Input
              value={auth?.scopes || ''}
              onChange={(e) => onChange({ ...auth, scopes: e.target.value })}
              placeholder={t("mcpAuth.oauthScopesPlaceholder")}
              sx={{ ...inputSx, fontFamily: 'monospace' }}
            />
          </FormControl>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              startDecorator={<VerifiedUserIcon />}
              onClick={handleCheck}
              loading={checking}
              disabled={!url}
              sx={{ borderColor: 'var(--border-color)' }}
            >
              {checking ? t("mcpAuth.oauthChecking") : t("mcpAuth.oauthCheck")}
            </Button>
          </Stack>

          {probe && (
            probe.supported ? (
              <Alert color={probe.dynamicRegistration ? 'success' : 'warning'} variant="soft">
                <Box>
                  <Typography level="body-sm">
                    {t("mcpAuth.oauthSupported", { server: probe.authorizationServer })}
                  </Typography>
                  <Typography level="body-xs" sx={{ mt: 0.5 }}>
                    {probe.dynamicRegistration
                      ? t("mcpAuth.oauthDynamicRegistration")
                      : t("mcpAuth.oauthNoDynamicRegistration")}
                  </Typography>
                </Box>
              </Alert>
            ) : (
              <Alert color="danger" variant="soft">
                {t("mcpAuth.oauthNotSupported", { message: probe.error })}
              </Alert>
            )
          )}

          {oauthInfo?.clientId && (
            <Typography level="body-xs" sx={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {t("mcpAuth.oauthRegisteredClient", { clientId: oauthInfo.clientId })}
              {oauthInfo.authorizationServer ? ` · ${oauthInfo.authorizationServer}` : ''}
            </Typography>
          )}
        </Box>
      )}
    </>
  );
}
