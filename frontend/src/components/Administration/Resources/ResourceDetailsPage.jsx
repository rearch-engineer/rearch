import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Stack,
  Button,
  Card,
  CardContent,
} from "@mui/joy";
import { Edit, ArrowBack, List } from "@mui/icons-material";
import { api } from "../../../api/client";

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

// GitHub SVG logo component
const GitHubIcon = ({ size = 48 }) => (
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
    icon: (size) => <BitbucketIcon size={size} />,
  },
  github: {
    label: "GitHub",
    bgTint: "rgba(36, 41, 47, 0.08)",
    icon: (size) => <GitHubIcon size={size} />,
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
  const { t } = useTranslation("Administration");
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
      const resources = await api.getAdminResources();
      const foundResource = resources.find((r) => r._id === resourceId);
      if (foundResource) {
        setResource(foundResource);
      } else {
        navigate("/administration/resources");
      }
    } catch (error) {
      console.error("Error loading resource:", error);
      navigate("/administration/resources");
    } finally {
      setLoading(false);
    }
  };

  const renderDataDetails = () => {
    if (!resource) return null;

    if (resource.provider === "bitbucket") {
      return (
        <>
          <DetailRow label={t("resourceDetails.workspace")}>
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.workspace}
            </Typography>
          </DetailRow>
          <DetailRow label={t("resourceDetails.email")}>
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.email}
            </Typography>
          </DetailRow>
          <DetailRow label={t("resourceDetails.cloneUsername")}>
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.cloneUsername || t("resourceDetails.notSet")}
            </Typography>
          </DetailRow>
          <DetailRow label={t("resourceDetails.apiToken")}>
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.apiToken ? "••••••••••••" : t("resourceDetails.notSet")}
            </Typography>
          </DetailRow>
        </>
      );
    }

    if (resource.provider === "github") {
      return (
        <>
          <DetailRow label={t("resourceDetails.appId")}>
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.appId}
            </Typography>
          </DetailRow>
          <DetailRow label={t("resourceDetails.installationId")}>
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.installationId}
            </Typography>
          </DetailRow>
          <DetailRow label={t("resourceDetails.privateKey")}>
            <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
              {resource.data.privateKey ? "••••••••••••" : t("resourceDetails.notSet")}
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
          {t("resourceDetails.loadingResource")}
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
          {t("resourceDetails.resourceNotFound")}
        </Typography>
      </Box>
    );
  }

  const meta = providerMeta[resource.provider] || {
    label: resource.provider,
    bgTint: "rgba(107,114,128,0.08)",
    icon: () => null,
  };

  const hasSubResources = ["bitbucket", "github"].includes(resource.provider);

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
            onClick={() => navigate("/administration/resources")}
          >
            {t("resourceDetails.resources")}
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
                    navigate(`/administration/resources/${id}/subresources`)
                  }
                  sx={{ borderColor: "var(--border-color)" }}
                >
                  {t("resourceDetails.repositories")}
                </Button>
              )}
              <Button
                variant="solid"
                color="primary"
                startDecorator={<Edit />}
                onClick={() =>
                  navigate(`/administration/resources/${id}/edit`)
                }
              >
                {t("resourceDetails.edit")}
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
              {t("resourceDetails.connectionDetails")}
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
              {t("resourceDetails.metadata")}
            </Typography>
            <DetailRow label={t("resourceDetails.created")}>
              <Typography level="body-md" sx={{ color: "var(--text-primary)" }}>
                {new Date(resource.createdAt).toLocaleString()}
              </Typography>
            </DetailRow>
            <DetailRow label={t("resourceDetails.lastUpdated")}>
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
