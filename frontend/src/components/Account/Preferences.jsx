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
} from '@mui/joy';
import { useColorScheme } from '@mui/joy/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';

import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import UserAvatar from '../UserAvatar';

const VOICE_LANGUAGES = [
  { code: '', label: 'Browser default' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'fr-FR', label: 'French (France)' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'ru-RU', label: 'Russian' },
  { code: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'nl-NL', label: 'Dutch' },
  { code: 'pl-PL', label: 'Polish' },
  { code: 'sv-SE', label: 'Swedish' },
  { code: 'da-DK', label: 'Danish' },
  { code: 'fi-FI', label: 'Finnish' },
  { code: 'nb-NO', label: 'Norwegian' },
  { code: 'tr-TR', label: 'Turkish' },
  { code: 'uk-UA', label: 'Ukrainian' },
  { code: 'cs-CZ', label: 'Czech' },
  { code: 'ro-RO', label: 'Romanian' },
  { code: 'el-GR', label: 'Greek' },
  { code: 'he-IL', label: 'Hebrew' },
  { code: 'th-TH', label: 'Thai' },
  { code: 'vi-VN', label: 'Vietnamese' },
  { code: 'id-ID', label: 'Indonesian' },
  { code: 'ms-MY', label: 'Malay' },
  { code: 'ca-ES', label: 'Catalan' },
  { code: 'gl-ES', label: 'Galician' },
  { code: 'eu-ES', label: 'Basque' },
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
    label: 'Light',
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
    label: 'Auto',
    preview: <AutoThemePreviewCard />,
  },
  {
    value: 'dark',
    label: 'Dark',
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

  const [voiceLanguage, setVoiceLanguage] = useState('');
  const [theme, setTheme] = useState('system');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef(null);

  // Initialise from user profile when available
  useEffect(() => {
    if (user?.profile?.preferences?.voice_language !== undefined) {
      setVoiceLanguage(user.profile.preferences.voice_language);
    }
    if (user?.profile?.preferences?.theme) {
      setTheme(user.profile.preferences.theme);
    }
  }, [user]);

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
      setAvatarError('Only image files are allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be smaller than 2 MB.');
      return;
    }

    setAvatarUploading(true);
    try {
      await api.uploadAvatar(file);
      await refreshUser();
    } catch (err) {
      setAvatarError(err?.response?.data?.error || 'Upload failed. Please try again.');
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
      setAvatarError('Failed to remove avatar.');
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
            Preferences
          </Typography>
        </Box>

        {/* ── Avatar ──────────────────────────────────────────────────── */}
        <Card variant="outlined" sx={{ width: '100%', mb: 3 }}>
          <Typography level="title-md" sx={{ mb: 1 }}>
            Avatar
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2, color: 'text.secondary' }}>
            Upload a profile picture. Images are resized to 256&times;256 and served publicly.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <UserAvatar
              avatarFileId={user?.profile?.avatar_fileId}
              fallbackName={user?.profile?.display_name || user?.email || user?.username}
              size="lg"
              sx={{ width: 72, height: 72, fontSize: '1.75rem' }}
            />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarFileChange}
              />
              <Button
                size="sm"
                variant="outlined"
                color="neutral"
                loading={avatarUploading}
                startDecorator={<PhotoCameraOutlinedIcon />}
                onClick={() => avatarInputRef.current?.click()}
              >
                {user?.profile?.avatar_fileId ? 'Change avatar' : 'Upload avatar'}
              </Button>

              {user?.profile?.avatar_fileId && (
                <Button
                  size="sm"
                  variant="plain"
                  color="danger"
                  loading={avatarUploading}
                  startDecorator={<DeleteOutlineIcon />}
                  onClick={handleAvatarDelete}
                >
                  Remove avatar
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
            Appearance
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2, color: 'text.secondary' }}>
            Color mode
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
                  {opt.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Card>

        {/* ── Voice Input ─────────────────────────────────────────────── */}
        <Card variant="outlined" sx={{ width: '100%' }}>
          <Typography level="title-md" sx={{ mb: 2 }}>
            Voice Input
          </Typography>

          <FormControl>
            <FormLabel>Voice recognition language</FormLabel>
            <Select
              value={voiceLanguage}
              onChange={(_, value) => handleVoiceLanguageChange(value ?? '')}
              placeholder="Select a language"
              sx={{ maxWidth: 320 }}
            >
              {VOICE_LANGUAGES.map((lang) => (
                <Option key={lang.code} value={lang.code}>
                  {lang.label}{lang.code ? ` (${lang.code})` : ''}
                </Option>
              ))}
            </Select>
            <FormHelperText>
              Language used for the microphone voice-to-text feature. Leave as
              "Browser default" to use your browser's language.
            </FormHelperText>
          </FormControl>
        </Card>
      </Box>
    </Box>
  );
}
