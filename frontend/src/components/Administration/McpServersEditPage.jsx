import React, { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Button, Typography, FormControl, FormLabel,
  Input, Textarea, Stack, Switch, Select, Option, Card, CardContent, Chip, Divider,
} from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function McpServersEditPage() {
  const { t } = useTranslation("Administration");
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
  // OpenAPI ("API Definition") editing state
  const [baseUrl, setBaseUrl] = useState('');
  const [specFileId, setSpecFileId] = useState(null);
  const [operations, setOperations] = useState([]);

  useEffect(() => {
    loadServer();
  }, [id]);

  const loadServer = async () => {
    try {
      setLoading(true);
      const servers = await api.getMcpServers();
      const server = (servers || []).find((s) => s.name === id);
      if (!server) {
        toast.error(t("mcpEdit.serverNotFound"));
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
      setBaseUrl(server.baseUrl || '');
      setSpecFileId(server.specFileId || null);
      setOperations(Array.isArray(server.operations) ? server.operations : []);
    } catch (err) {
      toast.error(t("mcpEdit.failedToLoadServer", { message: err.message }));
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
      catch { toast.error(t("mcpEdit.headersMustBeValidJson")); return; }
    }

    let environment = undefined;
    if (formData.environment.trim()) {
      try { environment = JSON.parse(formData.environment); }
      catch { toast.error(t("mcpEdit.environmentMustBeValidJson")); return; }
    }

    const payload = {
      type: formData.type,
      enabled: formData.enabled,
    };

    if (formData.type === 'remote') {
      payload.url = formData.url;
      if (headers) payload.headers = headers;
    } else if (formData.type === 'openapi') {
      const enabledOps = operations.filter((o) => o.enabled !== false);
      if (enabledOps.length === 0) {
        toast.error(t("mcpEdit.selectAtLeastOne"));
        return;
      }
      for (const op of enabledOps) {
        if (!/^[a-zA-Z0-9_]+$/.test(op.toolName || '')) {
          toast.error(t("mcpEdit.toolNameValidationError", { name: op.toolName || '(empty)' }));
          return;
        }
      }
      payload.baseUrl = baseUrl;
      payload.specFileId = specFileId;
      payload.operations = operations.map((op) => ({
        operationId: op.operationId,
        method: op.method,
        path: op.path,
        toolName: op.toolName,
        description: op.description || '',
        enabled: op.enabled !== false,
        parameters: (op.parameters || []).map((p) => ({
          name: p.name,
          in: p.in,
          required: !!p.required,
          type: p.type || 'string',
          description: p.description || '',
        })),
        requestBodySchema: op.requestBodySchema || null,
      }));
      if (headers) payload.headers = headers;
    } else {
      payload.command = formData.command.split('\n').map((s) => s.trim()).filter(Boolean);
      if (environment) payload.environment = environment;
    }

    try {
      setSaving(true);
      await api.updateMcpServer(id, payload);
      toast.success(t("mcpEdit.serverUpdated"));
      navigate('/administration/mcp-servers');
    } catch (err) {
      toast.error(t("mcpEdit.failedToSaveServer", { message: err.response?.data?.error || err.message }));
    } finally {
      setSaving(false);
    }
  };

  const updateOperation = (index, patch) => {
    setOperations((prev) => prev.map((op, i) => (i === index ? { ...op, ...patch } : op)));
  };
  const updateParameter = (opIndex, paramIndex, patch) => {
    setOperations((prev) => prev.map((op, i) => {
      if (i !== opIndex) return op;
      const parameters = (op.parameters || []).map((p, j) => (j === paramIndex ? { ...p, ...patch } : p));
      return { ...op, parameters };
    }));
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>{t("mcpEdit.loading")}</Typography>
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
            {t("mcpEdit.back")}
          </Button>
        </Stack>
        <Typography
          level="h2"
          sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
        >
          {t("mcpEdit.editServer")}
        </Typography>


        {/* Form */}
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                {t("mcpEdit.name")}
              </FormLabel>
              <Input
                value={formData.name}
                disabled
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              />
            </FormControl>

            <FormControl required>
              <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                {t("mcpEdit.type")}
              </FormLabel>
              <Select
                value={formData.type}
                onChange={(_, val) => setFormData({ ...formData, type: val })}
                disabled={formData.type === 'openapi'}
                sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <Option value="remote">{t("mcpEdit.remote")}</Option>
                <Option value="local">{t("mcpEdit.local")}</Option>
                {formData.type === 'openapi' && (
                  <Option value="openapi">{t("mcpServers.typeApiDefinition")}</Option>
                )}
              </Select>
            </FormControl>

            {formData.type === 'remote' && (
              <FormControl required>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  {t("mcpEdit.url")}
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
                  {t("mcpEdit.command")}
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
                  {t("mcpEdit.headersJson")}
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
                  {t("mcpEdit.environmentJson")}
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

            {formData.type === 'openapi' && (
              <>
                <FormControl required>
                  <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                    {t("mcpOpenApi.baseUrl")}
                  </FormLabel>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="e.g. https://api.example.com/v1"
                    sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                    {t("mcpEdit.headersJson")}
                  </FormLabel>
                  <Textarea
                    value={formData.headers}
                    onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                    placeholder='e.g. {"Authorization": "Bearer token"}'
                    minRows={2}
                    sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }}
                  />
                </FormControl>

                <Divider />

                <Typography level="title-md" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                  {t("mcpOpenApi.operationsTitle", { count: operations.length })}
                </Typography>

                {operations.map((op, i) => (
                  <Card
                    key={`${op.method}-${op.path}-${i}`}
                    variant="outlined"
                    sx={{ borderColor: 'var(--border-color)', bgcolor: 'var(--bg-primary)', opacity: op.enabled === false ? 0.6 : 1 }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                        <Switch
                          size="sm"
                          checked={op.enabled !== false}
                          onChange={(e) => updateOperation(i, { enabled: e.target.checked })}
                        />
                        <Chip size="sm" variant="soft" color="primary">{op.method}</Chip>
                        <Typography level="body-sm" sx={{ fontFamily: 'monospace', color: 'var(--text-secondary)', flex: 1, minWidth: 0 }} noWrap>
                          {op.path}
                        </Typography>
                      </Stack>
                      <Stack spacing={1.5} sx={{ pl: { xs: 0, sm: 5 } }}>
                        <FormControl>
                          <FormLabel sx={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {t("mcpOpenApi.toolName")}
                          </FormLabel>
                          <Input
                            size="sm"
                            value={op.toolName || ''}
                            onChange={(e) => updateOperation(i, { toolName: e.target.value })}
                            disabled={op.enabled === false}
                            sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }}
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel sx={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {t("mcpOpenApi.description")}
                          </FormLabel>
                          <Textarea
                            size="sm"
                            value={op.description || ''}
                            onChange={(e) => updateOperation(i, { description: e.target.value })}
                            disabled={op.enabled === false}
                            minRows={2}
                            sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                          />
                        </FormControl>
                        {(op.parameters || []).length > 0 && (
                          <Box>
                            <Typography level="body-xs" sx={{ color: 'var(--text-secondary)', fontWeight: 600, mb: 0.5 }}>
                              {t("mcpOpenApi.parameters")}
                            </Typography>
                            <Stack spacing={1}>
                              {op.parameters.map((p, j) => (
                                <Stack key={`${p.in}-${p.name}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                  <Chip size="sm" variant="soft" color="neutral" sx={{ minWidth: 0 }}>
                                    {p.name}{p.required ? '*' : ''} · {p.in} · {p.type}
                                  </Chip>
                                  <Input
                                    size="sm"
                                    value={p.description || ''}
                                    onChange={(e) => updateParameter(i, j, { description: e.target.value })}
                                    disabled={op.enabled === false}
                                    sx={{ flex: 1, bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                                  />
                                </Stack>
                              ))}
                            </Stack>
                          </Box>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}

            <FormControl>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', m: 0 }}>
                  {t("mcpEdit.enabled")}
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
                {t("mcpEdit.cancel")}
              </Button>
              <Button type="submit" variant="solid" color="primary" loading={saving} startDecorator={<EditIcon />}>
                {t("mcpEdit.saveChanges")}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Box>
    </Box>
  );
}
