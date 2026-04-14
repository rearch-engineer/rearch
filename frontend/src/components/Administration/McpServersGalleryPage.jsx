import React, { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Typography, Card, CardContent, Stack, Sheet,
} from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExtensionIcon from '@mui/icons-material/Extension';
// Gallery icons
import MenuBookIcon from '@mui/icons-material/MenuBook';
import GitHubIcon from '@mui/icons-material/GitHub';
import BugReportIcon from '@mui/icons-material/BugReport';
import SearchIcon from '@mui/icons-material/Search';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import PaletteIcon from '@mui/icons-material/Palette';
import StorageIcon from '@mui/icons-material/Storage';
import CloudIcon from '@mui/icons-material/Cloud';
import WebAssetIcon from '@mui/icons-material/WebAsset';
import DnsIcon from '@mui/icons-material/Dns';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ForumIcon from '@mui/icons-material/Forum';
import DescriptionIcon from '@mui/icons-material/Description';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';

const ICON_MAP = {
  MenuBook: MenuBookIcon,
  GitHub: GitHubIcon,
  BugReport: BugReportIcon,
  Search: SearchIcon,
  TravelExplore: TravelExploreIcon,
  ViewKanban: ViewKanbanIcon,
  Palette: PaletteIcon,
  Storage: StorageIcon,
  Cloud: CloudIcon,
  WebAsset: WebAssetIcon,
  Dns: DnsIcon,
  CreditCard: CreditCardIcon,
  Forum: ForumIcon,
  Description: DescriptionIcon,
  RocketLaunch: RocketLaunchIcon,
};

function GalleryIcon({ name, ...props }) {
  const Icon = ICON_MAP[name] || ExtensionIcon;
  return <Icon {...props} />;
}

export default function McpServersGalleryPage() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const toast = useToast();
  const [gallery, setGallery] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getMcpGallery().catch(() => []),
      api.getMcpServers().catch(() => []),
    ]).then(([galleryData, serversData]) => {
      setGallery(galleryData || []);
      setServers(serversData || []);
      setLoading(false);
    });
  }, []);

  const installedNames = new Set(servers.map((s) => s.name));

  const selectFromGallery = (item) => {
    // Navigate to manual page with gallery item pre-filled via state
    navigate('/administration/mcp-servers/new/manual', {
      state: {
        name: item.id,
        type: item.type || 'remote',
        url: item.url || '',
        headers: item.headers && Object.keys(item.headers).length > 0
          ? JSON.stringify(item.headers, null, 2) : '',
      },
    });
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary)' }}>
        <Typography level="body-lg" sx={{ color: 'var(--text-secondary)' }}>{t("mcpGallery.loading")}</Typography>
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
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 4 }}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Button
                variant="plain"
                color="neutral"
                size="sm"
                startDecorator={<ArrowBackIcon />}
                onClick={() => navigate('/administration/mcp-servers')}
                sx={{ mr: 1 }}
              >
                {t("mcpGallery.back")}
              </Button>
            </Stack>
            <Typography
              level="h2"
              sx={{ mb: 1, color: 'var(--text-primary)', fontWeight: 700, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
            >
              {t("mcpGallery.addMcpServer")}
            </Typography>

          </Box>
          <Button
            variant="soft"
            color="primary"
            startDecorator={<SettingsIcon />}
            onClick={() => navigate('/administration/mcp-servers/new/manual')}
            sx={{ flexShrink: 0, mt: 0.5 }}
          >
            {t("mcpGallery.configureManually")}
          </Button>
        </Stack>

        {/* Gallery grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 1.5,
          }}
        >
          {gallery.map((item) => {
            const isInstalled = installedNames.has(item.id);
            return (
              <Card
                key={item.id}
                variant="outlined"
                sx={{
                  cursor: isInstalled ? 'default' : 'pointer',
                  borderColor: 'var(--border-color)',
                  bgcolor: 'var(--bg-primary)',
                  opacity: isInstalled ? 0.55 : 1,
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  ...(!isInstalled && {
                    '&:hover': {
                      borderColor: 'var(--joy-palette-primary-400, #3b82f6)',
                      boxShadow: '0 0 0 1px var(--joy-palette-primary-400, #3b82f6)',
                    },
                  }),
                }}
                onClick={() => !isInstalled && selectFromGallery(item)}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <Sheet
                      variant="soft"
                      color="primary"
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 'sm',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <GalleryIcon name={item.icon} sx={{ fontSize: 20 }} />
                    </Sheet>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography level="title-sm" noWrap sx={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {item.title}
                        </Typography>
                        {isInstalled && (
                          <CheckCircleIcon sx={{ fontSize: 14, color: '#16a34a', flexShrink: 0 }} />
                        )}
                      </Stack>
                    </Box>
                  </Stack>
                  <Typography
                    level="body-xs"
                    sx={{
                      color: 'var(--text-secondary)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.5,
                    }}
                  >
                    {item.description}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>

        {gallery.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography level="body-lg" sx={{ color: 'var(--text-secondary)', mb: 1 }}>
              {t("mcpGallery.noGalleryItems")}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'var(--text-tertiary)', mb: 3 }}>
              {t("mcpGallery.configureManuallyDescription")}
            </Typography>
            <Button
              variant="soft"
              color="primary"
              startDecorator={<SettingsIcon />}
              onClick={() => navigate('/administration/mcp-servers/new/manual')}
            >
              {t("mcpGallery.configureManually")}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
