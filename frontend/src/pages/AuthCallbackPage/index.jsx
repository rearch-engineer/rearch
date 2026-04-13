import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Card, Typography, CircularProgress, Button } from '@mui/joy';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

/**
 * OIDC callback page.
 * Mounted at /auth/callback. The OIDC provider redirects here after authentication.
 * Extracts the `code` and `state` from URL params, sends them to the backend,
 * and either logs the user in or shows a pending/error message.
 */
export default function AuthCallbackPage() {
  const { t } = useTranslation("AuthCallbackPage");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleOAuthCallback } = useAuth();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const processedRef = useRef(false);

  useEffect(() => {
    // Prevent double-processing in React StrictMode
    if (processedRef.current) return;
    processedRef.current = true;

    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const stateToken = sessionStorage.getItem('oauth_state_token');

      // Clean up
      sessionStorage.removeItem('oauth_state_token');

      if (!code || !state) {
        toast.error(t('missingAuthCode'));
        navigate('/login', { replace: true });
        return;
      }

      if (!stateToken) {
        toast.error(t('missingStateToken'));
        navigate('/login', { replace: true });
        return;
      }

      try {
        const result = await handleOAuthCallback(code, state, stateToken);
        if (result.token) {
          // Successful login — redirect to the originally intended URL if present
          const redirect = sessionStorage.getItem("start_redirect");
          sessionStorage.removeItem("start_redirect");
          navigate(redirect || '/', { replace: true });
        }
      } catch (err) {
        const status = err.response?.status;
        const message = err.response?.data?.error || t('authFailed');

        if (status === 403 && err.response?.data?.status === 'pending_verification') {
          setPending(true);
        } else {
          toast.error(message);
          navigate('/login', { replace: true });
        }
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, navigate]);

  if (pending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: 'background.level1' }}>
        <Card variant="outlined" sx={{ width: 450, p: 4, textAlign: 'center' }}>
          <Typography level="h4" sx={{ mb: 2 }}>{t('accountPendingApproval')}</Typography>
          <Typography level="body-md" sx={{ mb: 3, color: 'text.secondary' }}>
            {t('accountPendingMessage')}
          </Typography>
          <Button variant="outlined" onClick={() => navigate('/login', { replace: true })}>
            {t('backToLogin')}
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: 'background.level1' }}>
      <Card variant="outlined" sx={{ width: 300, p: 4, textAlign: 'center' }}>
        <CircularProgress sx={{ mx: 'auto', mb: 2 }} />
        <Typography level="body-md">{t('completingSignIn')}</Typography>
      </Card>
    </Box>
  );
}
