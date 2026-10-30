import React, { useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import {
  Box, Button, Typography, FormControl, FormLabel, FormHelperText,
  Input, Select, Option, Alert, Stack, IconButton,
} from '@mui/joy';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

/** Default authentication state for the admin forms. */
export const DEFAULT_AUTH = {
  mode: 'shared',
  scopes: '',
  registration: 'dynamic',
  clientId: '',
  clientSecret: '',
};

/**
 * Build the `auth` payload sent to the backend from the form state.
 * Returns null for non-remote servers (auth only applies to remote ones).
 */
export function buildAuthPayload(auth) {
  const mode = auth?.mode === 'oauth-user' ? 'oauth-user' : 'shared';
  const payload = { mode, oauth: { scopes: (auth?.scopes || '').trim() } };
  if (mode === 'oauth-user') {
    const registration = auth?.registration === 'manual' ? 'manual' : 'dynamic';
    payload.oauth.registration = registration;
    if (registration === 'manual') {
      payload.oauth.clientId = (auth?.clientId || '').trim();
      if (auth?.clientSecret) payload.oauth.clientSecret = auth.clientSecret;
    }
  }
  return payload;
}

/**
 * Authentication block for remote MCP servers (shared headers vs. per-user
 * OAuth). Used by both the "add manually" and "edit" pages.
 *
 * Props:
 *   - auth:      { mode, scopes, registration, clientId, clientSecret }
 *   - onChange:  (nextAuth) => void
 *   - url:       the server URL (used by the "Check OAuth support" probe)
 *   - oauthInfo: discovered/registered metadata from the saved server (optional)
 */
export default function McpAuthFields({ auth, onChange, url, oauthInfo }) {
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [probe, setProbe] = useState(null); // { supported, dynamicRegistration, authorizationServer, error }
  const [redirectUri, setRedirectUri] = useState('');

  const mode = auth?.mode || 'shared';
  const registration = auth?.registration || 'dynamic';

  useEffect(() => {
    if (mode !== 'oauth-user' || redirectUri) return;
    let cancelled = false;
    api.getMcpOAuthConfig()
      .then((cfg) => { if (!cancelled) setRedirectUri(cfg?.redirectUri || ''); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode, redirectUri]);

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

  const handleCopyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.success(t("mcpAuth.redirectUriCopied"));
    } catch {
      // non-fatal
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
            <FormLabel sx={labelSx}>{t("mcpAuth.registration")}</FormLabel>
            <Select
              value={registration}
              onChange={(_, val) => onChange({ ...auth, registration: val || 'dynamic' })}
              sx={inputSx}
            >
              <Option value="dynamic">{t("mcpAuth.registrationDynamic")}</Option>
              <Option value="manual">{t("mcpAuth.registrationManual")}</Option>
            </Select>
            <FormHelperText sx={{ color: 'var(--text-tertiary)' }}>
              {registration === 'manual'
                ? t("mcpAuth.registrationManualHelp")
                : t("mcpAuth.registrationDynamicHelp")}
            </FormHelperText>
          </FormControl>

          {registration === 'manual' && (
            <>
              <FormControl>
                <FormLabel sx={labelSx}>{t("mcpAuth.redirectUri")}</FormLabel>
                <Input
                  value={redirectUri}
                  readOnly
                  endDecorator={
                    <IconButton size="sm" variant="plain" onClick={handleCopyRedirect} disabled={!redirectUri}>
                      <ContentCopyOutlinedIcon fontSize="small" />
                    </IconButton>
                  }
                  sx={{ ...inputSx, fontFamily: 'monospace' }}
                />
                <FormHelperText sx={{ color: 'var(--text-tertiary)' }}>
                  {t("mcpAuth.redirectUriHelp")}
                </FormHelperText>
              </FormControl>

              <FormControl required>
                <FormLabel sx={labelSx}>{t("mcpAuth.clientId")}</FormLabel>
                <Input
                  value={auth?.clientId || ''}
                  onChange={(e) => onChange({ ...auth, clientId: e.target.value })}
                  placeholder="e.g. Iv1.0123456789abcdef"
                  sx={{ ...inputSx, fontFamily: 'monospace' }}
                />
              </FormControl>

              <FormControl>
                <FormLabel sx={labelSx}>{t("mcpAuth.clientSecret")}</FormLabel>
                <Input
                  type="password"
                  value={auth?.clientSecret || ''}
                  onChange={(e) => onChange({ ...auth, clientSecret: e.target.value })}
                  placeholder={oauthInfo?.hasClientSecret ? t("mcpAuth.clientSecretUnchanged") : ''}
                  autoComplete="new-password"
                  sx={{ ...inputSx, fontFamily: 'monospace' }}
                />
                <FormHelperText sx={{ color: 'var(--text-tertiary)' }}>
                  {t("mcpAuth.clientSecretHelp")}
                </FormHelperText>
              </FormControl>
            </>
          )}

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
              <Alert color={probe.dynamicRegistration || registration === 'manual' ? 'success' : 'warning'} variant="soft">
                <Box>
                  <Typography level="body-sm">
                    {t("mcpAuth.oauthSupported", { server: probe.authorizationServer })}
                  </Typography>
                  <Typography level="body-xs" sx={{ mt: 0.5 }}>
                    {probe.dynamicRegistration
                      ? t("mcpAuth.oauthDynamicRegistration")
                      : t("mcpAuth.oauthNoDynamicRegistration")}
                  </Typography>
                  {Array.isArray(probe.scopesSupported) && probe.scopesSupported.length > 0 && (
                    <Typography level="body-xs" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
                      {t("mcpAuth.oauthScopesSupported", { scopes: probe.scopesSupported.join(' ') })}
                    </Typography>
                  )}
                </Box>
              </Alert>
            ) : (
              <Alert color="danger" variant="soft">
                {t("mcpAuth.oauthNotSupported", { message: probe.error })}
              </Alert>
            )
          )}

          {oauthInfo?.clientId && registration === 'dynamic' && (
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
