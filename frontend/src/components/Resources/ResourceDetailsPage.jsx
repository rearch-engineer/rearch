import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Chip,
  Stack,
  Button,
  Card,
  CardContent,
} from "@mui/joy";
import { Edit, ArrowBack, List } from "@mui/icons-material";
import { api } from "../../api/client";

// Jira SVG logo component
const JiraIcon = ({ size = 48 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="jira-grad-1-detail"
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
        id="jira-grad-2-detail"
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
      fill="url(#jira-grad-1-detail)"
    />
    <path
      d="M183.822 61.262H60.871c0 55.502 44.99 100.492 100.492 100.492h11.129v10.721c0 55.502 44.99 100.492 100.492 100.492V72.424c0-6.165-4.997-11.162-11.162-11.162h-78z"
      transform="scale(0.77) translate(-2, -2)"
      fill="#2684FF"
    />
    <path
      d="M122.951 122.489H0c0 55.502 44.99 100.492 100.492 100.492h11.129v10.721C111.621 289.204 156.611 334.194 212.113 334.194V133.651c0-6.165-4.997-11.162-11.162-11.162h-78z"
      transform="scale(0.77) translate(-2, -2)"
      fill="url(#jira-grad-2-detail)"
    />
  </svg>
);

// Bitbucket SVG logo component
const BitbucketIcon = ({ size = 48 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="bb-grad-detail"
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
      fill="url(#bb-grad-detail)"
    />
  </svg>
);

const providerMeta = {
  jira: {
    label: "Jira (Atlassian)",
    category: "Project Management",
    categoryColor: "#0052CC",
    bgTint: "rgba(0, 82, 204, 0.08)",
    icon: (size) => <JiraIcon size={size} />,
  },
  bitbucket: {
    label: "Bitbucket (Atlassian)",
    category: "Developer Tools",
    categoryColor: "#0052CC",
    bgTint: "rgba(38, 132, 255, 0.08)",
    icon: (size) => <BitbucketIcon size={size} />,
  },
};

function DetailRow({ label, children }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        gap: { xs: 0.5, sm: 2 },
        py: 1.5,
        borderBottom: "1px solid var(--border-color)",
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Typography
        level="body-sm"
        sx={{
          color: "var(--text-secondary)",
          fontWeight: 600,
          minWidth: 180,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1 }}>{children}</Box>
    </Box>
  );
}

function ResourceDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadResource(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadResource = async (resourceId) => {
    try {
      setLoading(true);
      const resources = await api.getResources();
      const foundResource = resources.find((r) => r._id === resourceId);
      if (foundResource) {
        setResource(foundResource);
      } else {
        navigate("/resources");
      }
    } catch (error) {
      console.error("Error loading resource:", error);
      navigate("/resources");
    } finally {
      setLoading(false);
    }
  };

  const renderDataDetails = () => {
    if (!resource) return null;

    if (resource.provider === "jira") {
      return (
        <>
          <DetailRow label="Installation URL">
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              <a
                href={resource.data.installationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--md-link-color)", textDecoration: "none" }}
              >
                {resource.data.installationUrl}
              </a>
            </Typography>
          </DetailRow>
          <DetailRow label="Login Account (Email)">
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.email}
            </Typography>
          </DetailRow>
          <DetailRow label="Authentication Token">
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.apiToken ? "••••••••••••" : "Not set"}
            </Typography>
          </DetailRow>
        </>
      );
    }

    if (resource.provider === "bitbucket") {
      return (
        <>
          <DetailRow label="Workspace">
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.workspace}
            </Typography>
          </DetailRow>
          <DetailRow label="Email">
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.email}
            </Typography>
          </DetailRow>
          <DetailRow label="Clone Username">
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.cloneUsername || "Not set"}
            </Typography>
          </DetailRow>
          <DetailRow label="API Token">
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.apiToken ? "••••••••••••" : "Not set"}
            </Typography>
          </DetailRow>
        </>
      );
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "var(--bg-primary)",
        }}
      >
        <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
          Loading resource...
        </Typography>
      </Box>
    );
  }

  if (!resource) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "var(--bg-primary)",
        }}
      >
        <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
          Resource not found
        </Typography>
      </Box>
    );
  }

  const meta = providerMeta[resource.provider] || {
    label: resource.provider,
    category: "Integration",
    categoryColor: "#6b7280",
    bgTint: "rgba(107,114,128,0.08)",
    icon: () => null,
  };

  const hasSubResources =
    resource.provider === "jira" || resource.provider === "bitbucket";

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
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {/* Top nav */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 4 }}>
          <Button
            variant="plain"
            color="neutral"
            startDecorator={<ArrowBack />}
            onClick={() => navigate("/resources")}
          >
            Resources
          </Button>
          <Typography level="body-sm" sx={{ color: "var(--text-tertiary)" }}>
            /
          </Typography>
          <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
            {resource.name}
          </Typography>
        </Stack>

        {/* Hero card — mirrors ResourceTypeSelection card layout */}
        <Card
          variant="outlined"
          sx={{
            p: 0,
            overflow: "hidden",
            borderColor: "var(--border-color)",
            bgcolor: "var(--bg-primary)",
            mb: 3,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "row", minHeight: 160 }}>
            {/* Icon area */}
            <Box
              sx={{
                width: 140,
                minWidth: 140,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: meta.bgTint,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "14px",
                  bgcolor: "var(--bg-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px var(--shadow-color)",
                }}
              >
                {meta.icon(48)}
              </Box>
            </Box>

            {/* Title / meta */}
            <Box
              sx={{
                flex: 1,
                p: 2.5,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 1,
              }}
            >
              <Typography
                level="h2"
                sx={{
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontSize: { xs: "1.4rem", md: "1.75rem" },
                }}
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

              <Typography
                level="body-sm"
                sx={{ color: "var(--text-tertiary)" }}
              >
                {meta.label}
              </Typography>
            </Box>

            {/* Actions */}
            <Stack
              direction="column"
              spacing={1}
              justifyContent="center"
              sx={{ pr: 2.5 }}
            >
              {hasSubResources && (
                <Button
                  variant="outlined"
                  color="neutral"
                  startDecorator={<List />}
                  onClick={() =>
                    navigate(`/resources/${id}/subresources`)
                  }
                  sx={{ borderColor: "var(--border-color)" }}
                >
                  {resource.provider === "jira" ? "Tickets" : "Repositories"}
                </Button>
              )}
              <Button
                variant="solid"
                color="primary"
                startDecorator={<Edit />}
                onClick={() =>
                  navigate(`/resources/${id}/edit`)
                }
              >
                Edit
              </Button>
            </Stack>
          </Box>
        </Card>

        {/* Connection details card */}
        <Card
          variant="outlined"
          sx={{
            borderColor: "var(--border-color)",
            bgcolor: "var(--bg-primary)",
            mb: 3,
          }}
        >
          <CardContent>
            <Typography
              level="title-md"
              sx={{ mb: 2, fontWeight: 700, color: "var(--text-primary)" }}
            >
              Connection Details
            </Typography>
            {renderDataDetails()}
          </CardContent>
        </Card>

        {/* Metadata card */}
        <Card
          variant="outlined"
          sx={{
            borderColor: "var(--border-color)",
            bgcolor: "var(--bg-primary)",
          }}
        >
          <CardContent>
            <Typography
              level="title-md"
              sx={{ mb: 2, fontWeight: 700, color: "var(--text-primary)" }}
            >
              Metadata
            </Typography>
            <DetailRow label="Created">
              <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
                {new Date(resource.createdAt).toLocaleString()}
              </Typography>
            </DetailRow>
            <DetailRow label="Last Updated">
              <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
                {new Date(resource.updatedAt).toLocaleString()}
              </Typography>
            </DetailRow>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default ResourceDetailsPage;
