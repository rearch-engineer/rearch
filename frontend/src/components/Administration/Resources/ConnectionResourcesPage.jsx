import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Chip,
  Stack,
  Input,
  Button,
  FormControl,
} from "@mui/joy";
import { Search, Add, ArrowBack } from "@mui/icons-material";
import { api } from "../../../api/client";
import ResourceImportModal from "./ResourceImportModal";

function getKindLabel(resource, t) {
  switch (resource.kind) {
    case "repository":
      return t("subResourcesList.repositories");
    default:
      return resource.kind;
  }
}

function getProviderChipColor(provider) {
  switch (provider) {
    case "bitbucket":
      return "#10a37f";
    case "github":
      return "#24292f";
    default:
      return "#6b7280";
  }
}

function getProviderLabel(provider, t) {
  switch (provider) {
    case "bitbucket":
    case "github":
      return t("subResourcesList.repositories");
    default:
      return t("subResourcesList.subResources");
  }
}

function getResourceSubtitle(resource) {
  if (resource.kind === "repository") {
    return resource.data?.fullName || null;
  }
  return null;
}

function ResourceCard({ resource, onClick }) {
  const { t } = useTranslation("Administration");
  const subtitle = getResourceSubtitle(resource);
  const typeColor = getProviderChipColor(resource.provider);

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
      <Box sx={{ display: "flex", flexDirection: "row", minHeight: 90 }}>
        {/* Color accent bar */}
        <Box
          sx={{
            width: 6,
            minWidth: 6,
            bgcolor: typeColor,
            opacity: 0.7,
          }}
        />

        {/* Content area */}
        <Box
          sx={{
            flex: 1,
            px: 2.5,
            py: 2,
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

          <Stack direction="row" spacing={1} alignItems="center">
            {subtitle && (
              <Typography
                level="body-sm"
                sx={{ color: "var(--text-secondary)" }}
              >
                {subtitle}
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Arrow indicator */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            pr: 2,
            color: "var(--text-tertiary)",
          }}
        >
          <Typography level="body-sm" sx={{ fontSize: "1.1rem" }}>
            ›
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}

function ConnectionResourcesPage() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const { id } = useParams();
  const [connection, setResource] = useState(null);
  const [resources, setResources] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    if (id) {
      loadAll(id);
    }
  }, [id]);

  const loadAll = async (connectionId) => {
    try {
      setLoading(true);
      const [res, subs] = await Promise.all([
        api.getAdminConnection(connectionId),
        api.getAdminConnectionResources(connectionId),
      ]);
      setResource(res);
      setResources(subs);
    } catch (error) {
      console.error("Error loading sub-connections:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSuccess = () => {
    setImportModalOpen(false);
    loadAll(id);
  };

  const filteredResources = resources.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const listLabel = connection
    ? getProviderLabel(connection.provider, t)
    : t("subResourcesList.subResources");

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
        <Button
          variant="plain"
          color="neutral"
          startDecorator={<ArrowBack />}
          onClick={() => navigate(`/administration/connections/connections/${id}`)}
          sx={{ mb: 2 }}
        >
          {t("subResourcesList.backTo", { name: connection?.name || "Connection" })}
        </Button>

        <Box sx={{ mb: 3 }}>
          <Typography level="h3" sx={{ mb: 3 }}>
            {listLabel}
          </Typography>
        </Box>

        {/* Search & Import */}
        <Box sx={{ mb: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems="flex-end"
          >
            <FormControl sx={{ flex: 1 }}>
              <Input
                size="sm"
                placeholder={`Search ${listLabel.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startDecorator={
                  <Search sx={{ color: "var(--text-secondary)" }} />
                }
                sx={{
                  bgcolor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              />
            </FormControl>
            <Button
              data-testid="import-btn"
              size="sm"
              variant="solid"
              color="primary"
              startDecorator={<Add />}
              onClick={() => setImportModalOpen(true)}
              sx={{ flexShrink: 0 }}
            >
              {t("subResourcesList.import")}
            </Button>
          </Stack>
        </Box>
      </Box>
      {/* Sub-connection list */}
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {loading ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
              {t("subResourcesList.loading")}
            </Typography>
          </Box>
        ) : filteredResources.length === 0 ? (
          <Card
            variant="outlined"
            sx={{
              borderColor: "var(--border-color)",
              bgcolor: "var(--bg-primary)",
              overflow: "auto",
            }}
          >
            <Box sx={{ textAlign: "center", py: 8 }}>
              {searchQuery ? (
                <>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    {t("subResourcesList.noResults", { query: searchQuery })}
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)" }}
                  >
                    {t("subResourcesList.tryDifferentSearch")}
                  </Typography>
                </>
              ) : (
                <>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    {t("subResourcesList.noItemsYet", {
                      items: listLabel.toLowerCase(),
                    })}
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)", mb: 3 }}
                  >
                    {t("subResourcesList.importFirstOne")}
                  </Typography>
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<Add />}
                    onClick={() => setImportModalOpen(true)}
                  >
                    {t("subResourcesList.import")}
                  </Button>
                </>
              )}
            </Box>
          </Card>
        ) : (
          <Stack spacing={2}>
            {filteredResources.map((resource) => (
              <ResourceCard
                key={resource._id}
                resource={resource}
                onClick={() =>
                  navigate(
                    `/administration/connections/connections/${id}/resources/${resource._id}`,
                  )
                }
              />
            ))}
          </Stack>
        )}
      </Box>
      {connection && (
        <ResourceImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          connection={connection}
          onImportSuccess={handleImportSuccess}
        />
      )}
    </Box>
  );
}

export default ConnectionResourcesPage;
