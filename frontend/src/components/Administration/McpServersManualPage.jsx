import React, { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Button, Typography, FormControl, FormLabel,
  Input, Textarea, Stack, Switch, Select, Option,
} from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

const EMPTY_FORM = {
  name: '',
  type: 'remote',
  url: '',
  command: '',
  headers: '',
  environment: '',
  enabled: true,
};

export default function McpServersManualPage() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  // Pre-fill from gallery selection (passed via navigation state)
  const prefill = location.state || {};
  const [formData, setFormData] = useState({
    ...EMPTY_FORM,
    ...(prefill.name ? {
      name: prefill.name,
      type: prefill.type || 'remote',
      url: prefill.url || '',
      headers: prefill.headers || '',
    } : {}),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!/^[a-zA-Z0-9_-]+$/.test(formData.name)) {
      toast.error(t("mcpManual.nameValidationError"));
      return;
    }

    let headers = undefined;
    if (formData.headers.trim()) {
      try { headers = JSON.parse(formData.headers); }
      catch { toast.error(t("mcpManual.headersMustBeValidJson")); return; }
    }

    let environment = undefined;
    if (formData.environment.trim()) {
      try { environment = JSON.parse(formData.environment); }
      catch { toast.error(t("mcpManual.environmentMustBeValidJson")); return; }
    }

    const payload = {
      name: formData.name,
      type: formData.type,
      enabled: formData.enabled,
    };

    if (formData.type === 'remote') {
      payload.url = formData.url;
      if (headers) payload.headers = headers;
    } else {
      payload.command = formData.command.split('\n').map((s) => s.trim()).filter(Boolean);
      if (environment) payload.environment = environment;
    }

    try {
      setSaving(true);
      await api.createMcpServer(payload);
      toast.success(t("mcpManual.serverAdded"));
      navigate('/administration/mcp-servers');
    } catch (err) {
      toast.error(t("mcpManual.failedToSaveServer", { message: err.response?.data?.error || err.message }));
    } finally {
      setSaving(false);
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
      <Box sx={{ maxWidth: 640, mx: 'auto' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Button
            variant="plain"
            color="neutral"
            size="sm"
            startDecorator={<ArrowBackIcon />}
            onClick={() => navigate('/administration/mcp-servers/new')}
          >
            {t("mcpManual.back")}
          </Button>
        </Stack>
        <Typography
          level="h2"
          sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
        >
          {t("mcpManual.addServerManually")}
        </Typography>


        {/* Form */}
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                {t("mcpManual.name")}
              </FormLabel>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("mcpManual.namePlaceholder")}
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              />
            </FormControl>

            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                {t("mcpManual.type")}
              </FormLabel>
              <Select
                value={formData.type}
                onChange={(_, val) => setFormData({ ...formData, type: val })}
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <Option value="remote">{t("mcpManual.remote")}</Option>
                <Option value="local">{t("mcpManual.local")}</Option>
              </Select>
            </FormControl>

            {formData.type === 'remote' && (
              <FormControl required>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  {t("mcpManual.url")}
                </FormLabel>
                <Input
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="e.g. https://mcp.example.com/mcp"
                  sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                />
              </FormControl>
            )}

            {formData.type === 'local' && (
              <FormControl required>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  {t("mcpManual.command")}
                </FormLabel>
                <Textarea
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  placeholder={"One argument per line, e.g.\nnpx\n-y\n@modelcontextprotocol/server-filesystem"}
                  minRows={3}
                  sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }}
                />
              </FormControl>
            )}

            {formData.type === 'remote' && (
              <FormControl>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  {t("mcpManual.headersJson")}
                </FormLabel>
                <Textarea
                  value={formData.headers}
                  onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                  placeholder='e.g. {"Authorization": "Bearer token"}'
                  minRows={2}
                  sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }}
                />
              </FormControl>
            )}

            {formData.type === 'local' && (
              <FormControl>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  {t("mcpManual.environmentJson")}
                </FormLabel>
                <Textarea
                  value={formData.environment}
                  onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                  placeholder='e.g. {"API_KEY": "abc123"}'
                  minRows={2}
                  sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }}
                />
              </FormControl>
            )}

            <FormControl>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', m: 0 }}>
                  {t("mcpManual.enabled")}
                </FormLabel>
              </Stack>
            </FormControl>

            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => navigate('/administration/mcp-servers')}
                sx={{ borderColor: 'var(--border-color)' }}
              >
                {t("mcpManual.cancel")}
              </Button>
              <Button type="submit" variant="solid" color="primary" loading={saving} startDecorator={<AddIcon />}>
                {t("mcpManual.addServer")}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Box>
    </Box>
  );
}
