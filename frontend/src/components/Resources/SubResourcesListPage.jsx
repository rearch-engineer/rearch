import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Chip,
  Stack,
  Input,
  Button,
} from "@mui/joy";
import { Search, Add, ArrowBack } from "@mui/icons-material";
import { api } from "../../api/client";
import SubResourceImportModal from "./SubResourceImportModal";

function getTypeLabel(type) {
  switch (type) {
    case "jira-ticket":
      return "Ticket";
    case "bitbucket-repository":
      return "Repository";
    default:
      return type;
  }
}

function getTypeChipColor(type) {
  switch (type) {
    case "jira-ticket":
      return "#0052CC";
    case "bitbucket-repository":
      return "#10a37f";
    default:
      return "#6b7280";
  }
}

function getProviderLabel(provider) {
  switch (provider) {
    case "jira":
      return "Jira Tickets";
    case "bitbucket":
      return "Repositories";
    default:
      return "Sub-resources";
  }
}

function getSubResourceSubtitle(subResource) {
  if (subResource.type === "jira-ticket") {
    return subResource.data?.key
      ? `${subResource.data.key}${subResource.data.status ? ` · ${subResource.data.status}` : ""}`
      : null;
  }
  if (subResource.type === "bitbucket-repository") {
    return subResource.data?.fullName || null;
  }
  return null;
}

function SubResourceCard({ subResource, onClick }) {
  const subtitle = getSubResourceSubtitle(subResource);
  const typeColor = getTypeChipColor(subResource.type);

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
            {subResource.name}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="sm"
              variant="soft"
              sx={{
                bgcolor: `${typeColor}18`,
                color: typeColor,
                fontWeight: 600,
                fontSize: "0.7rem",
                borderRadius: "4px",
                height: "22px",
              }}
            >
              {getTypeLabel(subResource.type)}
            </Chip>

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

function SubResourcesListPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [resource, setResource] = useState(null);
  const [subResources, setSubResources] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    if (id) {
      loadAll(id);
    }
  }, [id]);

  const loadAll = async (resourceId) => {
    try {
      setLoading(true);
      const [res, subs] = await Promise.all([
        api.getResource(resourceId),
        api.getSubResources(resourceId),
      ]);
      setResource(res);
      setSubResources(subs);
    } catch (error) {
      console.error("Error loading sub-resources:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSuccess = () => {
    setImportModalOpen(false);
    loadAll(id);
  };

  const filteredSubResources = subResources.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const listLabel = resource ? getProviderLabel(resource.provider) : "Sub-resources";

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
          onClick={() => navigate(`/resources/${id}`)}
          sx={{ mb: 2 }}
        >
          Back to {resource?.name || "Resource"}
        </Button>

        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          spacing={2}
        >
          <Box>
            <Typography
              level="h2"
              sx={{
                mb: 1,
                color: "var(--text-primary)",
                fontWeight: 700,
                fontSize: { xs: "1.5rem", md: "1.75rem" },
              }}
            >
              {listLabel}
            </Typography>
            {resource && (
              <Typography
                level="body-lg"
                sx={{ color: "var(--text-secondary)", fontSize: "1rem" }}
              >
                {resource.name}
              </Typography>
            )}
          </Box>
          <Button
            data-testid="import-btn"
            variant="solid"
            color="primary"
            startDecorator={<Add />}
            onClick={() => setImportModalOpen(true)}
            sx={{ flexShrink: 0, mt: 0.5 }}
          >
            Import
          </Button>
        </Stack>
      </Box>

      {/* Search */}
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 3 }}>
        <Input
          placeholder={`Search ${listLabel.toLowerCase()}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          startDecorator={<Search />}
          size="md"
          sx={{
            maxWidth: 400,
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
          }}
        />
      </Box>

      {/* Sub-resource list */}
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {loading ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
              Loading...
            </Typography>
          </Box>
        ) : filteredSubResources.length === 0 ? (
          <Card variant="outlined" sx={{ borderColor: "var(--border-color)", bgcolor: "var(--bg-primary)", overflow: "auto" }}>
            <Box sx={{ textAlign: "center", py: 8 }}>
              {searchQuery ? (
                <>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    No results for "{searchQuery}"
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)" }}
                  >
                    Try a different search term
                  </Typography>
                </>
              ) : (
                <>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    No {listLabel.toLowerCase()} yet
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)", mb: 3 }}
                  >
                    Import your first one to get started
                  </Typography>
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<Add />}
                    onClick={() => setImportModalOpen(true)}
                  >
                    Import
                  </Button>
                </>
              )}
            </Box>
          </Card>
        ) : (
          <Stack spacing={2}>
            {filteredSubResources.map((subResource) => (
              <SubResourceCard
                key={subResource._id}
                subResource={subResource}
                onClick={() =>
                  navigate(
                    `/resources/${id}/subresources/${subResource._id}`
                  )
                }
              />
            ))}
          </Stack>
        )}
      </Box>

      {resource && (
        <SubResourceImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          resource={resource}
          onImportSuccess={handleImportSuccess}
        />
      )}
    </Box>
  );
}

export default SubResourcesListPage;
