import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Box, Card, Typography, Chip, Stack, Button } from "@mui/joy";
import { ArrowBack } from "@mui/icons-material";

// Bitbucket SVG logo component
const BitbucketIcon = () => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="bb-grad"
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
      fill="url(#bb-grad)"
    />
  </svg>
);

const resourceTypes = [
  {
    slug: "bitbucket",
    title: "Bitbucket",
    category: "Developer Tools",
    categoryColor: "#0052CC",
    description:
      "Connect to Bitbucket workspaces and repositories to bring your code activity into context.",
    icon: <BitbucketIcon />,
    bgTint: "rgba(38, 132, 255, 0.08)",
    bgTintHover: "rgba(38, 132, 255, 0.13)",
    pricing: "Free",
  },
];

function ResourceTypeSelection() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();

  const handleTypeSelect = (slug) => {
    navigate(`/administration/resources/new/${slug}`);
  };

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
      {/* Back button */}
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 2 }}>
        <Button
          variant="plain"
          color="neutral"
          startDecorator={<ArrowBack />}
          onClick={() => navigate("/administration/resources")}
        >
          {t("resourceTypeSelection.backToResources")}
        </Button>
      </Box>

      {/* Header */}
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 4 }}>
        <Typography
          level="h2"
          sx={{
            mb: 1,
            color: "var(--text-primary)",
            fontWeight: 700,
            fontSize: { xs: "1.5rem", md: "1.75rem" },
          }}
        >
          {t("resourceTypeSelection.addAResource")}
        </Typography>
        <Typography
          level="body-lg"
          sx={{
            color: "var(--text-secondary)",
            fontSize: "1rem",
          }}
        >
          {t("resourceTypeSelection.addAResourceDescription")}
        </Typography>
      </Box>

      {/* Featured Resources */}
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 4 }}>
        <Typography
          level="title-lg"
          sx={{
            mb: 2,
            color: "var(--text-primary)",
            fontWeight: 700,
          }}
        >
          {t("resourceTypeSelection.featuredIntegrations")}
        </Typography>

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2.5}
          sx={{ width: "100%" }}
        >
          {resourceTypes.map((resource) => (
            <Card
              key={resource.slug}
              data-testid={`resource-type-${resource.slug}`}
              variant="outlined"
              sx={{
                flex: 1,
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
              onClick={() => handleTypeSelect(resource.slug)}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  minHeight: 160,
                }}
              >
                {/* Icon area */}
                <Box
                  sx={{
                    width: 140,
                    minWidth: 140,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: resource.bgTint,
                    transition: "background-color 0.2s ease",
                    ".MuiCard-root:hover &": {
                      bgcolor: resource.bgTintHover,
                    },
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
                    {resource.icon}
                  </Box>
                </Box>

                {/* Content area */}
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
                    level="title-lg"
                    sx={{
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      fontSize: "1.1rem",
                    }}
                  >
                    {resource.title}
                  </Typography>

                  <Box>
                    <Chip
                      size="sm"
                      variant="soft"
                      sx={{
                        bgcolor: `${resource.categoryColor}18`,
                        color: resource.categoryColor,
                        fontWeight: 600,
                        fontSize: "0.7rem",
                        borderRadius: "4px",
                        height: "22px",
                      }}
                    >
                      {resource.category}
                    </Chip>
                  </Box>

                  <Typography
                    level="body-sm"
                    sx={{
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {resource.description}
                  </Typography>

                  <Typography
                    level="body-xs"
                    sx={{
                      color: "var(--text-tertiary)",
                      mt: "auto",
                      pt: 0.5,
                    }}
                  >
                    {resource.pricing}
                  </Typography>
                </Box>
              </Box>
            </Card>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

export default ResourceTypeSelection;
