import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  FormControl,
  FormLabel,
  Stack,
  Select,
  Option,
  Input,
  Alert,
  Chip,
  Divider,
} from '@mui/joy';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function LlmSettings() {
  const toast = useToast();

  const [providers, setProviders] = useState([]);
  const [currentSetting, setCurrentSetting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Form state
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [providerList, setting] = await Promise.all([
        api.getLlmProviders(),
        api.getLlmSettings(),
      ]);
      setProviders(providerList || []);
      setCurrentSetting(setting);
      if (setting?.provider) {
        setSelectedProvider(setting.provider);
        setSelectedModel(setting.model || '');
      }
    } catch (err) {
      toast.error('Failed to load LLM settings: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const availableModels =
    providers.find((p) => p.id === selectedProvider)?.models || [];

  const handleProviderChange = (_, value) => {
    setSelectedProvider(value || '');
    setSelectedModel('');
  };

  const handleSave = async () => {
    if (!selectedProvider) {
      toast.error('Please select a provider');
      return;
    }
    if (!selectedModel) {
      toast.error('Please select a model');
      return;
    }
    // Require API key only when no key is stored yet
    if (!apiKey.trim() && !currentSetting?.apiKeySet) {
      toast.error('Please enter an API key');
      return;
    }
    try {
      setSaving(true);
      const payload = { provider: selectedProvider, model: selectedModel };
      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }
      await api.updateLlmSettings(payload);
      toast.success('LLM settings saved successfully');
      setApiKey('');
      loadData();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error('Failed to save LLM settings: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Remove the configured LLM provider? The system will fall back to the ANTHROPIC_API_KEY environment variable.')) {
      return;
    }
    try {
      setClearing(true);
      await api.deleteLlmSettings();
      toast.success('LLM settings cleared');
      setSelectedProvider('');
      setSelectedModel('');
      setApiKey('');
      loadData();
    } catch (err) {
      toast.error('Failed to clear LLM settings: ' + err.message);
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>Loading…</Typography>
      </Box>
    );
  }

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
      <Box sx={{ maxWidth: 720, mx: 'auto' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
          <SmartToyIcon sx={{ color: 'var(--text-secondary)' }} />
          <Typography
            level="h2"
            sx={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
          >
            LLM Provider
          </Typography>
        </Stack>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)', mb: 4 }}>
          Select the AI provider and model that conversation containers will use. The API key is stored
          securely in the database and is never exposed to end-users.
        </Typography>

        {/* Current status */}
        {currentSetting?.configured ? (
          <Alert
            color="success"
            startDecorator={<CheckCircleIcon />}
            sx={{ mb: 3, bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography level="body-sm" sx={{ fontWeight: 600 }}>Active configuration:</Typography>
              <Chip size="sm" variant="soft" color="success">{currentSetting.provider}</Chip>
              <Chip size="sm" variant="outlined">{currentSetting.model}</Chip>
              <Typography level="body-sm" sx={{ color: 'var(--text-secondary)' }}>
                Key: {currentSetting.apiKeyPreview}
              </Typography>
            </Stack>
          </Alert>
        ) : (
          <Alert
            color="warning"
            startDecorator={<WarningIcon />}
            sx={{ mb: 3 }}
          >
            No LLM provider is configured via the admin UI. The system will use the{' '}
            <code>ANTHROPIC_API_KEY</code> environment variable as a fallback.
          </Alert>
        )}

        {/* Configuration form */}
        <Card variant="outlined" sx={{ borderColor: 'var(--border-color)', bgcolor: 'var(--bg-primary)', p: 3 }}>
          <Typography level="title-md" sx={{ mb: 2, fontWeight: 600, color: 'var(--text-primary)' }}>
            Configure Provider
          </Typography>
          <Divider sx={{ mb: 3 }} />

          <Stack spacing={3}>
            {/* Provider select */}
            <FormControl>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Provider</FormLabel>
              <Select
                placeholder="Select a provider…"
                value={selectedProvider || null}
                onChange={handleProviderChange}
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                {providers.map((p) => (
                  <Option key={p.id} value={p.id}>{p.label}</Option>
                ))}
              </Select>
            </FormControl>

            {/* Model select */}
            <FormControl disabled={!selectedProvider}>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Model</FormLabel>
              <Select
                placeholder={selectedProvider ? 'Select a model…' : 'Select a provider first'}
                value={selectedModel || null}
                onChange={(_, value) => setSelectedModel(value || '')}
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                {availableModels.map((m) => (
                  <Option key={m.id} value={m.id}>{m.label}</Option>
                ))}
              </Select>
            </FormControl>

            {/* API key input */}
            <FormControl>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                API Key
                {currentSetting?.apiKeySet && (
                  <Typography component="span" level="body-xs" sx={{ ml: 1, color: 'var(--text-secondary)' }}>
                    (leave blank to keep existing key)
                  </Typography>
                )}
              </FormLabel>
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder={
                  currentSetting?.apiKeySet
                    ? `Current: ${currentSetting.apiKeyPreview}`
                    : 'Enter API key…'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                endDecorator={
                  <Button
                    variant="plain"
                    color="neutral"
                    size="sm"
                    onClick={() => setShowKey((v) => !v)}
                    sx={{ minWidth: 0, px: 1 }}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </Button>
                }
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              />
            </FormControl>

            {/* Actions */}
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" flexWrap="wrap">
              {currentSetting?.configured && (
                <Button
                  variant="outlined"
                  color="danger"
                  startDecorator={<DeleteIcon />}
                  onClick={handleClear}
                  loading={clearing}
                >
                  Clear Configuration
                </Button>
              )}
              <Button
                variant="solid"
                color="primary"
                startDecorator={<SaveIcon />}
                onClick={handleSave}
                loading={saving}
                disabled={!selectedProvider || !selectedModel}
              >
                Save Settings
              </Button>
            </Stack>
          </Stack>
        </Card>

        {/* Help text */}
        <Card variant="soft" sx={{ mt: 3, bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
          <Typography level="body-sm" sx={{ color: 'var(--text-secondary)', fontWeight: 600, mb: 0.5 }}>
            How it works
          </Typography>
          <Typography level="body-xs" sx={{ color: 'var(--text-secondary)' }}>
            When a conversation container starts, the configured API key is injected as an environment
            variable (e.g. <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>) so OpenCode can
            authenticate with the chosen provider. The default model is also pre-configured inside the
            container via <code>OPENCODE_CONFIG_CONTENT</code>.
          </Typography>
        </Card>
      </Box>
    </Box>
  );
}
