import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  Select,
  Option,
  Card,
  FormHelperText,
  Button,
  IconButton,
  Input,
} from '@mui/joy';
import { useColorScheme } from '@mui/joy/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import { useTranslation } from 'react-i18next';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';

import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import UserAvatar from '../UserAvatar';

const VOICE_LANGUAGES = [
  { code: '', labelKey: 'voiceLangBrowserDefault' },
  { code: 'en-US', labelKey: 'voiceLangEnUS' },
  { code: 'en-GB', labelKey: 'voiceLangEnGB' },
  { code: 'es-ES', labelKey: 'voiceLangEsES' },
  { code: 'es-MX', labelKey: 'voiceLangEsMX' },
  { code: 'fr-FR', labelKey: 'voiceLangFrFR' },
  { code: 'de-DE', labelKey: 'voiceLangDeDe' },
  { code: 'it-IT', labelKey: 'voiceLangItIT' },
  { code: 'pt-BR', labelKey: 'voiceLangPtBR' },
  { code: 'pt-PT', labelKey: 'voiceLangPtPT' },
  { code: 'zh-CN', labelKey: 'voiceLangZhCN' },
  { code: 'zh-TW', labelKey: 'voiceLangZhTW' },
  { code: 'ja-JP', labelKey: 'voiceLangJaJP' },
  { code: 'ko-KR', labelKey: 'voiceLangKoKR' },
  { code: 'ru-RU', labelKey: 'voiceLangRuRU' },
  { code: 'ar-SA', labelKey: 'voiceLangArSA' },
  { code: 'hi-IN', labelKey: 'voiceLangHiIN' },
  { code: 'nl-NL', labelKey: 'voiceLangNlNL' },
  { code: 'pl-PL', labelKey: 'voiceLangPlPL' },
  { code: 'sv-SE', labelKey: 'voiceLangSvSE' },
  { code: 'da-DK', labelKey: 'voiceLangDaDK' },
  { code: 'fi-FI', labelKey: 'voiceLangFiFI' },
  { code: 'nb-NO', labelKey: 'voiceLangNbNO' },
  { code: 'tr-TR', labelKey: 'voiceLangTrTR' },
  { code: 'uk-UA', labelKey: 'voiceLangUkUA' },
  { code: 'cs-CZ', labelKey: 'voiceLangCsCZ' },
  { code: 'ro-RO', labelKey: 'voiceLangRoRO' },
  { code: 'el-GR', labelKey: 'voiceLangElGR' },
  { code: 'he-IL', labelKey: 'voiceLangHeIL' },
  { code: 'th-TH', labelKey: 'voiceLangThTH' },
  { code: 'vi-VN', labelKey: 'voiceLangViVN' },
  { code: 'id-ID', labelKey: 'voiceLangIdID' },
  { code: 'ms-MY', labelKey: 'voiceLangMsMY' },
  { code: 'ca-ES', labelKey: 'voiceLangCaES' },
  { code: 'gl-ES', labelKey: 'voiceLangGlES' },
  { code: 'eu-ES', labelKey: 'voiceLangEuES' },
];

/* ── Mini-mockup card for theme preview ──────────────────────────────────── */

function ThemePreviewCard({ bgColor, barColor, textColor, accentDot, inputBg }) {
  return (
    <Box
      sx={{
        width: '100%',
        aspectRatio: '4 / 3',
        bgcolor: bgColor,
        borderRadius: 'sm',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        p: 1.2,
        gap: 0.8,
      }}
    >
      {/* Top bar with pill */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Box
          sx={{
            width: 48,
            height: 12,
            bgcolor: barColor,
            borderRadius: 99,
          }}
        />
      </Box>
      {/* Text lines */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
        <Box sx={{ width: '40%', height: 5, bgcolor: textColor, borderRadius: 99, opacity: 0.5 }} />
        <Box sx={{ width: '55%', height: 5, bgcolor: textColor, borderRadius: 99, opacity: 0.4 }} />
        <Box sx={{ width: '45%', height: 5, bgcolor: textColor, borderRadius: 99, opacity: 0.4 }} />
      </Box>
      {/* Bottom input area */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
        <Box
          sx={{
            flex: 1,
            height: 16,
            bgcolor: inputBg,
            borderRadius: 'xs',
          }}
        />
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: accentDot,
            flexShrink: 0,
          }}
        />
      </Box>
    </Box>
  );
}

/* ── Split (Auto) preview card ───────────────────────────────────────────── */

function AutoThemePreviewCard() {
  return (
    <Box
      sx={{
        width: '100%',
        aspectRatio: '4 / 3',
        borderRadius: 'sm',
        overflow: 'hidden',
        display: 'flex',
        position: 'relative',
      }}
    >
      {/* Left half – light */}
      <Box sx={{ flex: 1, bgcolor: '#ffffff', display: 'flex', flexDirection: 'column', p: 1.2, gap: 0.8 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Box sx={{ width: 24, height: 12, bgcolor: '#d9d9e3', borderRadius: 99 }} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
          <Box sx={{ width: '60%', height: 5, bgcolor: '#565869', borderRadius: 99, opacity: 0.5 }} />
          <Box sx={{ width: '80%', height: 5, bgcolor: '#565869', borderRadius: 99, opacity: 0.4 }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ flex: 1, height: 16, bgcolor: '#f7f7f8', borderRadius: 'xs' }} />
        </Box>
      </Box>
      {/* Right half – dark */}
      <Box sx={{ flex: 1, bgcolor: '#343541', display: 'flex', flexDirection: 'column', p: 1.2, gap: 0.8 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Box sx={{ width: 24, height: 12, bgcolor: '#565869', borderRadius: 99 }} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
          <Box sx={{ width: '60%', height: 5, bgcolor: '#c5c5d2', borderRadius: 99, opacity: 0.5 }} />
          <Box sx={{ width: '80%', height: 5, bgcolor: '#c5c5d2', borderRadius: 99, opacity: 0.4 }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ flex: 1, height: 16, bgcolor: '#40414f', borderRadius: 'xs' }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10a37f', flexShrink: 0 }} />
        </Box>
      </Box>
    </Box>
  );
}

/* ── Theme option configs ────────────────────────────────────────────────── */

const THEME_OPTIONS = [
  {
    value: 'light',
    labelKey: 'themeLight',
    preview: (
      <ThemePreviewCard
        bgColor="#ffffff"
        barColor="#d9d9e3"
        textColor="#565869"
        accentDot="#10a37f"
        inputBg="#f7f7f8"
      />
    ),
  },
  {
    value: 'system',
    labelKey: 'themeAuto',
    preview: <AutoThemePreviewCard />,
  },
  {
    value: 'dark',
    labelKey: 'themeDark',
    preview: (
      <ThemePreviewCard
        bgColor="#343541"
        barColor="#565869"
        textColor="#c5c5d2"
        accentDot="#10a37f"
        inputBg="#40414f"
      />
    ),
  },
];

export default function Preferences() {
  const { user, refreshUser } = useAuth();
  const { setMode } = useColorScheme();
  const { t, i18n } = useTranslation('Account');

  const [displayName, setDisplayName] = useState('');
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameError, setDisplayNameError] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState('');
  const [theme, setTheme] = useState('system');
  const [language, setLanguage] = useState('en');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef(null);

  // Initialise from user profile when available
  useEffect(() => {
    if (user?.profile?.display_name !== undefined) {
      setDisplayName(user.profile.display_name);
    }
    if (user?.profile?.preferences?.voice_language !== undefined) {
      setVoiceLanguage(user.profile.preferences.voice_language);
    }
    if (user?.profile?.preferences?.theme) {
      setTheme(user.profile.preferences.theme);
    }
    if (user?.profile?.preferences?.language) {
      setLanguage(user.profile.preferences.language);
    }
  }, [user]);

  const handleDisplayNameSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setDisplayNameError(t('displayNameEmpty'));
      return;
    }
    if (trimmed.length > 100) {
      setDisplayNameError(t('displayNameTooLong'));
      return;
    }
    setDisplayNameError('');
    setDisplayNameSaving(true);
    try {
      await api.updateProfile({ display_name: trimmed });
      await refreshUser();
    } catch (err) {
      setDisplayNameError(err?.response?.data?.error || t('displayNameUpdateFailed'));
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const handleThemeSelect = async (value) => {
    setTheme(value);
    setMode(value);
    try {
      await api.updateProfile({ theme: value });
      await refreshUser();
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }
  };

  const handleLanguageChange = async (value) => {
    setLanguage(value);
    i18n.changeLanguage(value);
    try {
      await api.updateProfile({ language: value });
      await refreshUser();
    } catch (err) {
      console.error('Failed to save language preference:', err);
    }
  };

  const handleVoiceLanguageChange = async (value) => {
    setVoiceLanguage(value);
    try {
      await api.updateProfile({ voice_language: value });
      await refreshUser();
    } catch (err) {
      console.error('Failed to save voice language preference:', err);
    }
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');

    if (!file.type.startsWith('image/')) {
      setAvatarError(t('avatarOnlyImages'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError(t('avatarTooLarge'));
      return;
    }

    setAvatarUploading(true);
    try {
      await api.uploadAvatar(file);
      await refreshUser();
    } catch (err) {
      setAvatarError(err?.response?.data?.error || t('avatarUploadFailed'));
    } finally {
      setAvatarUploading(false);
      // Reset input so the same file can be re-selected after removal
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarError('');
    setAvatarUploading(true);
    try {
      await api.deleteAvatar();
      await refreshUser();
    } catch (err) {
      setAvatarError(t('avatarRemoveFailed'));
    } finally {
      setAvatarUploading(false);
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
            {t('preferences')}
          </Typography>
        </Box>

        {/* ── Profile: Avatar + Display Name ────────────────────── */}
        <Card variant="outlined" sx={{ width: '100%', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {/* Avatar with hover overlay */}
            <Box
              onClick={() => avatarInputRef.current?.click()}
              sx={{
                position: 'relative',
                width: 80,
                height: 80,
                flexShrink: 0,
                borderRadius: '50%',
                cursor: 'pointer',
                overflow: 'hidden',
                '&:hover .avatar-overlay': {
                  opacity: 1,
                },
                '&:hover': {
                  boxShadow: '0 0 0 3px var(--joy-palette-primary-200)',
                },
                transition: 'box-shadow 0.2s',
              }}
            >
              <UserAvatar
                avatarFileId={user?.profile?.avatar_fileId}
                fallbackName={user?.profile?.display_name || user?.email || user?.username}
                size="lg"
                sx={{ width: 80, height: 80, fontSize: '2rem' }}
              />
              <Box
                className="avatar-overlay"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  bgcolor: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  borderRadius: '50%',
                }}
              >
                <PhotoCameraOutlinedIcon sx={{ color: '#fff', fontSize: 22 }} />
              </Box>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarFileChange}
              />
            </Box>

            {/* Display name */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography level="title-md">
                {t('displayName')}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <FormControl sx={{ flex: 1 }} error={!!displayNameError}>
                  <Input
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setDisplayNameError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDisplayNameSave();
                    }}
                    placeholder={t('displayNamePlaceholder')}
                    slotProps={{ input: { maxLength: 100 } }}
                  />
                  {displayNameError && (
                    <FormHelperText>{displayNameError}</FormHelperText>
                  )}
                </FormControl>
                <Button
                  size="sm"
                  loading={displayNameSaving}
                  disabled={displayName.trim() === (user?.profile?.display_name || '')}
                  onClick={handleDisplayNameSave}
                  sx={{ mt: '2px' }}
                >
                  {t('save')}
                </Button>
              </Box>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {t('displayNameDescription')}
              </Typography>
              {user?.profile?.avatar_fileId && (
                <Button
                  size="sm"
                  variant="plain"
                  color="danger"
                  loading={avatarUploading}
                  startDecorator={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                  onClick={handleAvatarDelete}
                  sx={{ alignSelf: 'flex-start', px: 0.5, py: 0, minHeight: 'unset', fontSize: '0.75rem' }}
                >
                  {t('removeAvatar')}
                </Button>
              )}
            </Box>
          </Box>

          {avatarError && (
            <Typography level="body-sm" color="danger" sx={{ mt: 1 }}>
              {avatarError}
            </Typography>
          )}
        </Card>

        {/* ── Appearance ──────────────────────────────────────────────── */}
        <Card variant="outlined" sx={{ width: '100%', mb: 3 }}>
          <Typography level="title-md" sx={{ mb: 1 }}>
            {t('appearance')}
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2, color: 'text.secondary' }}>
            {t('colorMode')}
          </Typography>

          <Box
            sx={{
              display: 'flex',
              gap: 3,
              flexWrap: 'wrap',
            }}
          >
            {THEME_OPTIONS.map((opt) => (
              <Box
                key={opt.value}
                onClick={() => handleThemeSelect(opt.value)}
                sx={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  width: { xs: 120, sm: 150 },
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    borderRadius: 'md',
                    overflow: 'hidden',
                    border: '3px solid',
                    borderColor: theme === opt.value ? 'primary.400' : 'transparent',
                    boxShadow: theme === opt.value ? '0 0 0 1px var(--joy-palette-primary-400)' : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    '&:hover': {
                      borderColor: theme === opt.value ? 'primary.400' : 'neutral.300',
                    },
                  }}
                >
                  {opt.preview}
                </Box>
                <Typography
                  level="body-sm"
                  sx={{
                    fontWeight: theme === opt.value ? 700 : 400,
                    color: theme === opt.value ? 'primary.plainColor' : 'text.secondary',
                  }}
                >
                  {t(opt.labelKey)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Card>

        {/* ── Language ─────────────────────────────────────────────────── */}
        <Card variant="outlined" sx={{ width: '100%' }}>
          <Typography level="title-md" sx={{ mb: 1 }}>
            {t('language')}
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2, color: 'text.secondary' }}>
            {t('languageDescription')}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <FormControl>
              <FormLabel>{t('language')}</FormLabel>
              <Select
                value={language}
                onChange={(_, value) => handleLanguageChange(value ?? 'en')}
                startDecorator={<LanguageOutlined />}
                sx={{ maxWidth: 320 }}
              >
                <Option value="en">{t('languageEn')}</Option>
                <Option value="es">{t('languageEs')}</Option>
                <Option value="fr">{t('languageFr')}</Option>
                <Option value="nl">{t('languageNl')}</Option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>{t('voiceRecognitionLanguage')}</FormLabel>
              <Select
                value={voiceLanguage}
                onChange={(_, value) => handleVoiceLanguageChange(value ?? '')}
                placeholder={t('selectLanguage')}
                sx={{ maxWidth: 320 }}
              >
                {VOICE_LANGUAGES.map((lang) => (
                  <Option key={lang.code} value={lang.code}>
                    {t(lang.labelKey)}{lang.code ? ` (${lang.code})` : ''}
                  </Option>
                ))}
              </Select>
              <FormHelperText>
                {t('voiceHelperText')}
              </FormHelperText>
            </FormControl>
          </Box>
        </Card>
      </Box>
    </Box>
  );
}
