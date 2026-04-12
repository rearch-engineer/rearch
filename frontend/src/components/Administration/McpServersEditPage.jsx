import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Button, Typography, FormControl, FormLabel,
  Input, Textarea, Stack, Switch, Select, Option,
} from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function McpServersEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'remote',
    url: '',
    command: '',
    headers: '',
    environment: '',
    enabled: true,
  });

  useEffect(() => {
    loadServer();
  }, [id]);

  const loadServer = async () => {
    try {
      setLoading(true);
      const servers = await api.getMcpServers();
      const server = (servers || []).find((s) => s.name === id);
      if (!server) {
        toast.error('Server not found');
        navigate('/administration/mcp-servers');
        return;
      }
      setFormData({
        name: server.name,
        type: server.type || 'remote',
        url: server.url || '',
        command: Array.isArray(server.command) ? server.command.join('\n') : '',
        headers: server.headers && Object.keys(server.headers).length > 0
          ? JSON.stringify(server.headers, null, 2) : '',
        environment: server.environment && Object.keys(server.environment).length > 0
          ? JSON.stringify(server.environment, null, 2) : '',
        enabled: server.enabled !== false,
      });
    } catch (err) {
      toast.error('Failed to load server: ' + err.message);
      navigate('/administration/mcp-servers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let headers = undefined;
    if (formData.headers.trim()) {
      try { headers = JSON.parse(formData.headers); }
      catch { toast.error('Headers must be valid JSON'); return; }
    }

    let environment = undefined;
    if (formData.environment.trim()) {
      try { environment = JSON.parse(formData.environment); }
      catch { toast.error('Environment variables must be valid JSON'); return; }
    }

    const payload = {
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
      await api.updateMcpServer(id, payload);
      toast.success('Server updated');
      navigate('/administration/mcp-servers');
    } catch (err) {
      toast.error('Failed to save server: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>Loading...</Typography>
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
      <Box sx={{ maxWidth: 640, mx: 'auto' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Button
            variant="plain"
            color="neutral"
            size="sm"
            startDecorator={<ArrowBackIcon />}
            onClick={() => navigate('/administration/mcp-servers')}
          >
            Back
          </Button>
        </Stack>
        <Typography
          level="h2"
          sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
        >
          Edit Server
        </Typography>


        {/* Form */}
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                Name
              </FormLabel>
              <Input
                value={formData.name}
                disabled
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              />
            </FormControl>

            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                Type
              </FormLabel>
              <Select
                value={formData.type}
                onChange={(_, val) => setFormData({ ...formData, type: val })}
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <Option value="remote">Remote</Option>
                <Option value="local">Local</Option>
              </Select>
            </FormControl>

            {formData.type === 'remote' && (
              <FormControl required>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  URL
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
                  Command
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
                  Headers (JSON)
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
                  Environment Variables (JSON)
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
                  Enabled
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
                Cancel
              </Button>
              <Button type="submit" variant="solid" color="primary" loading={saving} startDecorator={<EditIcon />}>
                Save Changes
              </Button>
            </Stack>
          </Stack>
        </form>
      </Box>
    </Box>
  );
}
