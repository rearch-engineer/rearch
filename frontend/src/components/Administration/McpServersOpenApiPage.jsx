import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Typography, FormControl, FormLabel,
  Input, Textarea, Stack, Switch, Sheet, Card, CardContent, Chip, Divider,
} from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

export default function McpServersOpenApiPage() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const [isDragOver, setIsDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Server-level fields
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Spec / parse state
  const [specFileId, setSpecFileId] = useState(null);
  const [specInfo, setSpecInfo] = useState(null);
  const [operations, setOperations] = useState([]);

  // ─── Upload + parse ─────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    try {
      setParsing(true);
      const uploaded = await api.uploadFiles([file]);
      const fileId = uploaded?.[0]?.fileId;
      if (!fileId) throw new Error('Upload failed');

      const result = await api.parseOpenApiSpec({ specFileId: fileId });

      setSpecFileId(fileId);
      setSpecInfo(result.info || null);
      setOperations(result.operations || []);
      if (result.defaultBaseUrl && !baseUrl) setBaseUrl(result.defaultBaseUrl);
      if (result.info?.title && !name) {
        setName(result.info.title.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50));
      }
      toast.success(t("mcpOpenApi.specParsed", { count: (result.operations || []).length }));
    } catch (err) {
      toast.error(t("mcpOpenApi.parseFailed", { message: err.response?.data?.error || err.message }));
    } finally {
      setParsing(false);
    }
  }, [baseUrl, name, t, toast]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);
  const handleDragOver = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ─── Operation editing ────────────────────────────────────────────────────
  const updateOperation = (index, patch) => {
    setOperations((prev) => prev.map((op, i) => (i === index ? { ...op, ...patch } : op)));
  };
  const updateParameter = (opIndex, paramIndex, patch) => {
    setOperations((prev) => prev.map((op, i) => {
      if (i !== opIndex) return op;
      const parameters = op.parameters.map((p, j) => (j === paramIndex ? { ...p, ...patch } : p));
      return { ...op, parameters };
    }));
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      toast.error(t("mcpOpenApi.nameValidationError"));
      return;
    }
    if (!specFileId) {
      toast.error(t("mcpOpenApi.uploadFirst"));
      return;
    }
    const enabledOps = operations.filter((o) => o.enabled !== false);
    if (enabledOps.length === 0) {
      toast.error(t("mcpOpenApi.selectAtLeastOne"));
      return;
    }
    for (const op of enabledOps) {
      if (!/^[a-zA-Z0-9_]+$/.test(op.toolName || '')) {
        toast.error(t("mcpOpenApi.toolNameValidationError", { name: op.toolName || '(empty)' }));
        return;
      }
    }

    let parsedHeaders = undefined;
    if (headers.trim()) {
      try { parsedHeaders = JSON.parse(headers); }
      catch { toast.error(t("mcpOpenApi.headersMustBeValidJson")); return; }
    }

    const payload = {
      name,
      type: 'openapi',
      baseUrl,
      specFileId,
      operations: operations.map((op) => ({
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
      })),
      enabled,
    };
    if (parsedHeaders) payload.headers = parsedHeaders;

    try {
      setSaving(true);
      await api.createMcpServer(payload);
      toast.success(t("mcpOpenApi.serverAdded"));
      navigate('/administration/mcp-servers');
    } catch (err) {
      toast.error(t("mcpOpenApi.failedToSaveServer", { message: err.response?.data?.error || err.message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, bgcolor: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'auto' }}>
      <Box sx={{ maxWidth: 820, mx: 'auto' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Button
            variant="plain"
            color="neutral"
            size="sm"
            startDecorator={<ArrowBackIcon />}
            onClick={() => navigate('/administration/mcp-servers/new')}
          >
            {t("mcpOpenApi.back")}
          </Button>
        </Stack>
        <Typography level="h2" sx={{ mb: 0.5, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
          {t("mcpOpenApi.title")}
        </Typography>
        <Typography level="body-sm" sx={{ mb: 3, color: 'var(--text-secondary)' }}>
          {t("mcpOpenApi.subtitle")}
        </Typography>

        {/* Dropzone */}
        <Sheet
          variant="outlined"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          sx={{
            mb: 3,
            p: 4,
            borderRadius: 'md',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: isDragOver ? 'var(--joy-palette-primary-400, #3b82f6)' : 'var(--border-color)',
            bgcolor: isDragOver ? 'var(--bg-secondary)' : 'var(--bg-primary)',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.15s, background-color 0.15s',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.yaml,.yml,application/json,text/yaml"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
          <UploadFileIcon sx={{ fontSize: 40, color: 'var(--text-secondary)', mb: 1 }} />
          <Typography level="title-md" sx={{ color: 'var(--text-primary)', mb: 0.5 }}>
            {parsing ? t("mcpOpenApi.parsing") : t("mcpOpenApi.dropzoneTitle")}
          </Typography>
          <Typography level="body-xs" sx={{ color: 'var(--text-secondary)' }}>
            {t("mcpOpenApi.dropzoneHint")}
          </Typography>
          {specInfo && (
            <Chip size="sm" variant="soft" color="success" sx={{ mt: 1.5 }}>
              {specInfo.title || t("mcpOpenApi.specLoaded")}{specInfo.version ? ` v${specInfo.version}` : ''}
            </Chip>
          )}
        </Sheet>

        {operations.length > 0 && (
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {/* Server-level fields */}
              <FormControl required>
                <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem' }}>
                  {t("mcpOpenApi.name")}
                </FormLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("mcpOpenApi.namePlaceholder")}
                  sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                />
              </FormControl>

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
                  {t("mcpOpenApi.headersJson")}
                </FormLabel>
                <Textarea
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder='e.g. {"Authorization": "Bearer token"}'
                  minRows={2}
                  sx={{ bgcolor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', fontFamily: 'monospace' }}
                />
              </FormControl>

              <Divider />

              <Typography level="title-md" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                {t("mcpOpenApi.operationsTitle", { count: operations.length })}
              </Typography>

              {/* Operations list */}
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
                          placeholder={t("mcpOpenApi.descriptionPlaceholder")}
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
                                  placeholder={t("mcpOpenApi.paramDescriptionPlaceholder")}
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

              <FormControl>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  <FormLabel sx={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', m: 0 }}>
                    {t("mcpOpenApi.enabled")}
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
                  {t("mcpOpenApi.cancel")}
                </Button>
                <Button type="submit" variant="solid" color="primary" loading={saving} startDecorator={<AddIcon />}>
                  {t("mcpOpenApi.addServer")}
                </Button>
              </Stack>
            </Stack>
          </form>
        )}
      </Box>
    </Box>
  );
}
