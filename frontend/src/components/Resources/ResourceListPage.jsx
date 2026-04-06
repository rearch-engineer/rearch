import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Chip,
  Stack,
  Input,
  Button,
  Modal,
  ModalDialog,
  ModalClose,
} from "@mui/joy";
import { Search, Delete, Add } from "@mui/icons-material";
import { api } from "../../api/client";

// Jira SVG logo component
const JiraIcon = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="jira-grad-1-list"
        x1="243.352"
        y1="14.326"
        x2="141.037"
        y2="117.476"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0.18" stopColor="#0052CC" />
        <stop offset="1" stopColor="#2684FF" />
      </linearGradient>
      <linearGradient
        id="jira-grad-2-list"
        x1="12.959"
        y1="241.343"
        x2="115.274"
        y2="138.193"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0.18" stopColor="#0052CC" />
        <stop offset="1" stopColor="#2684FF" />
      </linearGradient>
    </defs>
    <path
      d="M244.658 0H121.707c0 55.502 44.99 100.492 100.492 100.492h11.129v10.721c0 55.502 44.99 100.492 100.492 100.492V11.162C333.82 4.997 328.823 0 322.658 0h-78z"
      transform="scale(0.77) translate(-2, -2)"
      fill="url(#jira-grad-1-list)"
    />
    <path
      d="M183.822 61.262H60.871c0 55.502 44.99 100.492 100.492 100.492h11.129v10.721c0 55.502 44.99 100.492 100.492 100.492V72.424c0-6.165-4.997-11.162-11.162-11.162h-78z"
      transform="scale(0.77) translate(-2, -2)"
      fill="#2684FF"
    />
    <path
      d="M122.951 122.489H0c0 55.502 44.99 100.492 100.492 100.492h11.129v10.721C111.621 289.204 156.611 334.194 212.113 334.194V133.651c0-6.165-4.997-11.162-11.162-11.162h-78z"
      transform="scale(0.77) translate(-2, -2)"
      fill="url(#jira-grad-2-list)"
    />
  </svg>
);

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

const providerMeta = {
  jira: {
    label: "Jira (Atlassian)",
    category: "Project Management",
    categoryColor: "#0052CC",
    bgTint: "rgba(0, 82, 204, 0.08)",
    bgTintHover: "rgba(0, 82, 204, 0.13)",
    icon: (size) => <JiraIcon size={size} />,
  },
  bitbucket: {
    label: "Bitbucket (Atlassian)",
    category: "Developer Tools",
    categoryColor: "#0052CC",
    bgTint: "rgba(38, 132, 255, 0.08)",
    bgTintHover: "rgba(38, 132, 255, 0.13)",
    icon: (size) => <BitbucketIcon size={size} />,
  },
};

function ResourceCard({ resource, onClick, onDelete }) {
  const meta = providerMeta[resource.provider] || {
    label: resource.provider,
    category: "Integration",
    categoryColor: "#6b7280",
    bgTint: "rgba(107, 114, 128, 0.08)",
    bgTintHover: "rgba(107, 114, 128, 0.13)",
    icon: () => null,
  };

  const subtitle =
    resource.provider === "jira"
      ? resource.data?.email
      : resource.provider === "bitbucket"
      ? resource.data?.workspace
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

          <Box>
            <Chip
              size="sm"
              variant="soft"
              sx={{
                bgcolor: `${meta.categoryColor}18`,
                color: meta.categoryColor,
                fontWeight: 600,
                fontSize: "0.7rem",
                borderRadius: "4px",
                height: "22px",
              }}
            >
              {meta.category}
            </Chip>
          </Box>

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
            title="Delete resource"
          >
            <Delete sx={{ fontSize: 16 }} />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

function ResourceListPage() {
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
      const data = await api.getResources();
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
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 1 }}
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
              Resources
            </Typography>
            <Typography
              level="body-lg"
              sx={{ color: "var(--text-secondary)", fontSize: "1rem" }}
            >
              Manage your connected integrations and tools.
            </Typography>
          </Box>
          <Button
            data-testid="add-resource-btn"
            variant="solid"
            color="primary"
            startDecorator={<Add />}
            onClick={() => navigate("/resources/new")}
            sx={{ flexShrink: 0, mt: 0.5 }}
          >
            Add Resource
          </Button>
        </Stack>
      </Box>

      {/* Search */}
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 3 }}>
        <Input
          placeholder="Search resources..."
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

      {/* Resource list */}
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {loading ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
              Loading resources...
            </Typography>
          </Box>
        ) : filteredResources.length === 0 ? (
          <Card variant="outlined" sx={{ borderColor: "var(--border-color)", bgcolor: "var(--bg-primary)", overflow: "auto" }}>
            <Box sx={{ textAlign: "center", py: 8 }}>
              {searchQuery ? (
                <>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    No resources match "{searchQuery}"
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
                    No resources yet
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)", mb: 3 }}
                  >
                    Connect your first integration to get started
                  </Typography>
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<Add />}
                    onClick={() => navigate("/resources/new")}
                  >
                    Add Resource
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
                  navigate(`/resources/${resource._id}`)
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
          <Typography level="h4">Confirm Delete</Typography>
          <Typography>
            Are you sure you want to delete "{resourceToDelete?.name}"?
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button color="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}

export default ResourceListPage;
