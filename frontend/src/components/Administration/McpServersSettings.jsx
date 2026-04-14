import React, { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Typography, Stack, IconButton, Table, Chip, Input,
} from '@mui/joy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import CircleIcon from '@mui/icons-material/Circle';
import SearchIcon from '@mui/icons-material/Search';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

export default function McpServersSettings() {
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [proxyStatus, setProxyStatus] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadServers();
    loadProxyStatus();
  }, []);

  const loadServers = async () => {
    try {
      setLoading(true);
      const data = await api.getMcpServers();
      setServers(data || []);
    } catch (err) {
      toast.error(t("mcpServers.failedToLoadServers", { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const loadProxyStatus = async () => {
    try {
      const data = await api.getMcpStatus();
      setProxyStatus(data);
    } catch {
      setProxyStatus(null);
    }
  };

  const handleReloadProxy = async () => {
    try {
      setReloading(true);
      await api.reloadMcpProxy();
      toast.success(t("mcpServers.proxyReloaded"));
      loadProxyStatus();
    } catch (err) {
      toast.error(t("mcpServers.failedToReloadProxy", { message: err.message }));
    } finally {
      setReloading(false);
    }
  };

  const handleDelete = async (name) => {
    if (await confirm({ title: t("mcpServers.deleteServer"), message: t("mcpServers.deleteServerConfirm", { name }), confirmText: t("mcpServers.delete"), confirmColor: "danger" })) {
      try {
        await api.deleteMcpServer(name);
        loadServers();
        toast.success(t("mcpServers.serverDeleted"));
      } catch (err) {
        toast.error(t("mcpServers.failedToDeleteServer", { message: err.response?.data?.error || err.message }));
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>{t("mcpServers.loading")}</Typography>
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
      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography level="h3" sx={{ mb: 3 }}>
            {t("mcpServers.title")}
          </Typography>
        </Box>

        {/* Proxy error */}
        {proxyStatus && proxyStatus.healthy === false && (
          <Box sx={{ mb: 3, p: 2, borderRadius: 'sm', bgcolor: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.3)' }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <CircleIcon sx={{ fontSize: 12, color: '#dc2626' }} />
              <Typography level="body-sm" sx={{ color: '#dc2626', fontWeight: 600 }}>
                {t("mcpServers.proxyUnavailable")}
              </Typography>
            </Stack>
          </Box>
        )}

        {/* Search & actions */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Input
            size="sm"
            placeholder={t("mcpServers.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startDecorator={<SearchIcon sx={{ color: 'var(--text-secondary)' }} />}
            sx={{
              flex: 1,
              bgcolor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
            }}
          />
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              startDecorator={<RefreshIcon />}
              onClick={handleReloadProxy}
              loading={reloading}
              sx={{ borderColor: 'var(--border-color)' }}
            >
              {t("mcpServers.reloadProxy")}
            </Button>
            <Button
              size="sm"
              variant="solid"
              onClick={() => navigate('/administration/mcp-servers/new')}
              sx={{ bgcolor: '#fff', color: '#000', '&:hover': { bgcolor: '#e5e5e5' } }}
            >
              {t("mcpServers.addServer")}
            </Button>
          </Stack>
        </Stack>

        {/* Servers table */}
        <Box sx={{ bgcolor: 'var(--bg-primary)', overflow: 'auto' }}>
          {servers.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography level="body-sm" sx={{ color: 'var(--text-tertiary)' }}>
                {t("mcpServers.emptyState")}
              </Typography>
            </Box>
          ) : (
            <Table
              sx={{
                '& thead th': {
                  bgcolor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  borderBottom: '1px solid var(--border-color)',
                },
                '& tbody tr': {
                  borderBottom: '1px solid var(--border-color)',
                  '&:last-child': { borderBottom: 'none' },
                },
                '& tbody td': { color: 'var(--text-primary)' },
              }}
            >
              <thead>
                <tr>
                  <th>{t("mcpServers.tableName")}</th>
                  <th>{t("mcpServers.tableType")}</th>
                  <th>{t("mcpServers.tableUrlCommand")}</th>
                  <th>{t("mcpServers.tableStatus")}</th>
                  <th style={{ width: 100 }}>{t("mcpServers.tableActions")}</th>
                </tr>
              </thead>
              <tbody>
                {servers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())).map((server) => (
                  <tr key={server._id || server.name}>
                    <td>
                      <Typography level="body-sm" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {server.name}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={server.type === 'remote' ? 'primary' : 'success'}>
                        {server.type}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-sm" sx={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {server.type === 'remote'
                          ? (server.url || '\u2014')
                          : (Array.isArray(server.command) ? server.command.join(' ') : '\u2014')}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={server.enabled !== false ? 'success' : 'neutral'}>
                        {server.enabled !== false ? t("mcpServers.active") : t("mcpServers.disabled")}
                      </Chip>
                    </td>
                    <td>
                      <Stack direction="row" spacing={0.5}>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="neutral"
                          onClick={() => navigate(`/administration/mcp-servers/${server.name}`)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDelete(server.name)}>
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Box>
      </Box>
    </Box>
  );
}
