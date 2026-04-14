import React, { useState } from 'react';
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  Input,
  Button,
  Alert,
  Card,
} from '@mui/joy';

import InfoIcon from '@mui/icons-material/Info';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function ChangePassword() {
  const { authMode } = useAuth();
  const toast = useToast();
  const { t } = useTranslation('Account');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (authMode === 'OAUTH') {
    return (
      <Box
        sx={{
          flex: 1,
          p: { xs: 2, sm: 3, md: 4 },
          bgcolor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          overflow: 'auto',
        }}
      >
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
          <Box sx={{ mb: 4 }}>
            <Typography
              level="h2"
              sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
            >
              {t('security')}
            </Typography>
          </Box>
          <Alert
            variant="soft"
            color="neutral"
            startDecorator={<InfoIcon />}
          >
            {t('oauthPasswordMessage')}
          </Alert>
        </Box>
      </Box>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error(t('passwordMinLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      toast.success(result.message || t('passwordChangeSuccess'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(
        err.response?.data?.error || t('passwordChangeFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        bgcolor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflow: 'auto',
      }}
    >
      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        <Box sx={{ mb: 4 }}>
          <Typography
            level="h2"
            sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
          >
            {t('security')}
          </Typography>
        </Box>

        <Card variant="outlined" sx={{ width: '100%' }}>
          <Typography level="title-md" sx={{ mb: 2 }}>
            {t('changePassword')}
          </Typography>

          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl required>
                <FormLabel>{t('currentPassword')}</FormLabel>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t('currentPasswordPlaceholder')}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>{t('newPassword')}</FormLabel>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('newPasswordPlaceholder')}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>{t('confirmNewPassword')}</FormLabel>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('confirmNewPasswordPlaceholder')}
                />
              </FormControl>

              <Button
                type="submit"
                loading={loading}
                sx={{ alignSelf: 'flex-start', mt: 1 }}
              >
                {t('updatePassword')}
              </Button>
            </Box>
          </form>
        </Card>
      </Box>
    </Box>
  );
}
