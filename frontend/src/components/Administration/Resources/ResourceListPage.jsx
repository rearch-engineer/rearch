import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Stack,
  Input,
  Button,
  Modal,
  ModalDialog,
  ModalClose,
} from "@mui/joy";
import { Search, Delete, Add } from "@mui/icons-material";
import { api } from "../../../api/client";

// Bitbucket SVG logo component
const BitbucketIcon = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="bb-grad-list"
        x1="108.633"
        y1="67.735"
        x2="79.167"
        y2="45.1"
        gradientTransform="scale(2.56)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0.176" stopColor="#0052CC" />
        <stop offset="1" stopColor="#2684FF" />
      </linearGradient>
    </defs>
    <path
      d="M19.2 28.8c-3.84 0-7.04 3.2-6.4 7.04l34.56 209.92c.96 5.44 5.76 9.6 11.2 9.6h144.64c4.16 0 7.68-3.2 8.32-7.36L246.4 35.84c.64-3.84-2.56-7.04-6.4-7.04H19.2zm131.84 163.84h-46.72l-12.8-66.56h71.04l-11.52 66.56z"
      fill="#2684FF"
    />
    <path
      d="M233.6 126.08h-70.72l-11.52 66.56h-46.72l-55.04 62.08c2.24 1.92 5.12 3.2 8.32 3.2h144.64c4.16 0 7.68-3.2 8.32-7.36l21.76-124.48h-.04z"
      fill="url(#bb-grad-list)"
    />
  </svg>
);

// GitHub SVG logo component
const GitHubIcon = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 98 96"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      fill="currentColor"
    />
  </svg>
);

const providerMeta = {
  bitbucket: {
    label: "Bitbucket (Atlassian)",
    bgTint: "rgba(38, 132, 255, 0.08)",
    bgTintHover: "rgba(38, 132, 255, 0.13)",
    icon: (size) => <BitbucketIcon size={size} />,
  },
  github: {
    label: "GitHub",
    bgTint: "rgba(36, 41, 47, 0.08)",
    bgTintHover: "rgba(36, 41, 47, 0.13)",
    icon: (size) => <GitHubIcon size={size} />,
  },
};

function ResourceCard({ resource, onClick, onDelete }) {
  const { t } = useTranslation("Administration");
  const meta = providerMeta[resource.provider] || {
    label: resource.provider,

    bgTint: "rgba(107, 114, 128, 0.08)",
    bgTintHover: "rgba(107, 114, 128, 0.13)",
    icon: () => null,
  };

  const subtitle =
    resource.provider === "bitbucket"
      ? resource.data?.workspace
      : resource.provider === "github"
        ? `App ID: ${resource.data?.appId || "N/A"}`
        : null;

  return (
    <Card
      variant="outlined"
      sx={{
        cursor: "pointer",
        p: 0,
        overflow: "hidden",
        transition: "all 0.2s ease",
        borderColor: "var(--border-color)",
        bgcolor: "var(--bg-primary)",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 4px 12px var(--shadow-color)",
          borderColor: "var(--text-tertiary)",
        },
      }}
      onClick={onClick}
    >
      <Box sx={{ display: "flex", flexDirection: "row", minHeight: 120 }}>
        {/* Icon area */}
        <Box
          sx={{
            width: 120,
            minWidth: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: meta.bgTint,
            transition: "background-color 0.2s ease",
            ".MuiCard-root:hover &": {
              bgcolor: meta.bgTintHover,
            },
          }}
        >
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: "12px",
              bgcolor: "var(--bg-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 3px var(--shadow-color)",
            }}
          >
            {meta.icon(36)}
          </Box>
        </Box>

        {/* Content area */}
        <Box
          sx={{
            flex: 1,
            p: 2,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 0.75,
          }}
        >
          <Typography
            level="title-md"
            sx={{ fontWeight: 700, color: "var(--text-primary)" }}
          >
            {resource.name}
          </Typography>


          {subtitle && (
            <Typography
              level="body-sm"
              sx={{ color: "var(--text-secondary)", lineHeight: 1.4 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        {/* Delete button */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            pr: 2,
          }}
        >
          <Box
            component="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(resource);
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "6px",
              border: "none",
              bgcolor: "transparent",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              "&:hover": {
                bgcolor: "rgba(220, 38, 38, 0.1)",
                color: "#dc2626",
              },
            }}
            title={t("resources.deleteResource")}
          >
            <Delete sx={{ fontSize: 16 }} />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

function ResourceListPage() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const [resources, setResources] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState(null);

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminResources();
      setResources(data);
    } catch (error) {
      console.error("Error loading resources:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (resource) => {
    setResourceToDelete(resource);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await api.deleteResource(resourceToDelete._id);
      await loadResources();
      setDeleteConfirmOpen(false);
      setResourceToDelete(null);
    } catch (error) {
      console.error("Error deleting resource:", error);
    }
  };

  const filteredResources = resources.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
        overflow: "auto",
      }}
    >
      {/* Header */}
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 4 }}>
        <Typography level="h3" sx={{ mb: 3 }}>
          {t("resources.title")}
        </Typography>
      </Box>

      {/* Search & actions */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ maxWidth: 960, mx: "auto", mb: 3 }}>
        <Input
          placeholder={t("resources.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          startDecorator={<Search sx={{ color: "var(--text-secondary)" }} />}
          size="sm"
          sx={{
            flex: 1,
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
          }}
        />
        <Button
          data-testid="add-resource-btn"
          size="sm"
          variant="solid"
          onClick={() => navigate("/administration/resources/new")}
          sx={{ flexShrink: 0, bgcolor: "#fff", color: "#000", "&:hover": { bgcolor: "#e5e5e5" } }}
        >
          {t("resources.connect")}
        </Button>
      </Stack>

      {/* Resource list */}
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {loading ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
              {t("resources.loadingResources")}
            </Typography>
          </Box>
        ) : filteredResources.length === 0 ? (
          <Box sx={{ bgcolor: "var(--bg-primary)" }}>
            <Box sx={{ textAlign: "center", py: 8 }}>
              {searchQuery ? (
                <>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    {t("resources.noResourcesMatch", { query: searchQuery })}
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)" }}
                  >
                    {t("resources.tryDifferentSearch")}
                  </Typography>
                </>
              ) : (
                <>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    {t("resources.noResourcesYet")}
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)", mb: 3 }}
                  >
                    {t("resources.connectFirstIntegration")}
                  </Typography>
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<Add />}
                    onClick={() => navigate("/administration/resources/new")}
                  >
                    {t("resources.addResource")}
                  </Button>
                </>
              )}
            </Box>
          </Box>
        ) : (
          <Stack spacing={2}>
            {filteredResources.map((resource) => (
              <ResourceCard
                key={resource._id}
                resource={resource}
                onClick={() =>
                  navigate(`/administration/resources/${resource._id}`)
                }
                onDelete={handleDeleteClick}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <ModalDialog variant="outlined" role="alertdialog">
          <ModalClose />
          <Typography level="h4">{t("resources.confirmDelete")}</Typography>
          <Typography>
            {t("resources.confirmDeleteMessage", { name: resourceToDelete?.name })}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button color="danger" onClick={handleDeleteConfirm}>
              {t("resources.delete")}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              {t("resources.cancel")}
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}

export default ResourceListPage;
