import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  Input,
  Button,
  Stack,
  FormHelperText,
  Chip,
  Card,
  List,
  ListItem,
} from "@mui/joy";
import { ArrowBack } from "@mui/icons-material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api } from "../../../../api/client";

// Jira SVG logo component (matches ResourceTypeSelection)
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
        id="jira-form-grad-1"
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
        id="jira-form-grad-2"
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
      fill="url(#jira-form-grad-1)"
    />
    <path
      d="M183.822 61.262H60.871c0 55.502 44.99 100.492 100.492 100.492h11.129v10.721c0 55.502 44.99 100.492 100.492 100.492V72.424c0-6.165-4.997-11.162-11.162-11.162h-78z"
      transform="scale(0.77) translate(-2, -2)"
      fill="#2684FF"
    />
    <path
      d="M122.951 122.489H0c0 55.502 44.99 100.492 100.492 100.492h11.129v10.721C111.621 289.204 156.611 334.194 212.113 334.194V133.651c0-6.165-4.997-11.162-11.162-11.162h-78z"
      transform="scale(0.77) translate(-2, -2)"
      fill="url(#jira-form-grad-2)"
    />
  </svg>
);

function JiraResourceForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = !!id && location.pathname.includes("/edit");

  const [formData, setFormData] = useState({
    name: "",
    provider: "jira",
    data: {},
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isEditMode && id) {
      loadResource(id);
    }
  }, [id, isEditMode]);

  const loadResource = async (resourceId) => {
    try {
      setLoading(true);
      const resources = await api.getResources();
      const resource = resources.find((r) => r._id === resourceId);
      if (resource) {
        setFormData({
          name: resource.name,
          provider: resource.provider,
          data: resource.data,
        });
      }
    } catch (error) {
      console.error("Error loading resource:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (
      !formData.name ||
      formData.name.length < 2 ||
      formData.name.length > 100
    ) {
      newErrors.name = "Name must be between 2 and 100 characters";
    }

    if (!formData.data.installationUrl)
      newErrors.installationUrl = "Installation URL is required";
    if (!formData.data.email)
      newErrors.email = "Login account (email) is required";
    if (!formData.data.apiToken)
      newErrors.apiToken = "Authentication token is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      if (isEditMode) {
        await api.updateResource(id, formData);
      } else {
        await api.createResource(formData);
      }
      navigate("/resources");
    } catch (error) {
      console.error("Error submitting form:", error);
      setErrors({ submit: "Failed to save resource. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleDataChange = (field, value) => {
    setFormData({
      ...formData,
      data: {
        ...formData.data,
        [field]: value,
      },
    });
  };

  if (loading && isEditMode) {
    return (
      <Box
        sx={{
          flex: 1,
          p: { xs: 2, sm: 3, md: 4 },
          bgcolor: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}
      >
        <Typography>Loading resource...</Typography>
      </Box>
    );
  }

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
        {/* Back button */}
        <Button
          variant="plain"
          color="neutral"
          startDecorator={<ArrowBack />}
          onClick={() =>
            navigate(isEditMode ? "/resources" : "/resources/new")
          }
          sx={{ mb: 2 }}
        >
          {isEditMode ? "Resources" : "Add a Resource"}
        </Button>

        {/* Header with icon - matches marketplace style */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, mb: 4 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              minWidth: 64,
              borderRadius: "14px",
              bgcolor: "rgba(0, 82, 204, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 3px var(--shadow-color)",
            }}
          >
            <JiraIcon size={36} />
          </Box>
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography
                level="h2"
                sx={{
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  fontSize: { xs: "1.5rem", md: "1.75rem" },
                }}
              >
                {isEditMode ? "Edit Jira Resource" : "Connect Jira"}
              </Typography>
              <Chip
                size="sm"
                variant="soft"
                sx={{
                  bgcolor: "#0052CC18",
                  color: "#0052CC",
                  fontWeight: 600,
                  fontSize: "0.7rem",
                  borderRadius: "4px",
                  height: "22px",
                }}
              >
                Project Management
              </Chip>
            </Stack>
            <Typography
              level="body-lg"
              sx={{
                color: "var(--text-secondary)",
                fontSize: "1rem",
                mt: 0.5,
              }}
            >
              Track issues, manage projects, and link Jira to your
              conversations.
            </Typography>
          </Box>
        </Box>

        {/* Form card */}
        <Card
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 3, md: 4 },
            borderColor: "var(--border-color)",
            bgcolor: "var(--bg-primary)",
          }}
        >
          <form onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <FormControl error={!!errors.name}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  Name
                </FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Resource name"
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.name && <FormHelperText>{errors.name}</FormHelperText>}
              </FormControl>

              <FormControl error={!!errors.installationUrl}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  Installation URL
                </FormLabel>
                <Input
                  value={formData.data.installationUrl || ""}
                  onChange={(e) =>
                    handleDataChange("installationUrl", e.target.value)
                  }
                  placeholder="https://your-domain.atlassian.net"
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.installationUrl && (
                  <FormHelperText>{errors.installationUrl}</FormHelperText>
                )}
              </FormControl>

              <FormControl error={!!errors.email}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  Login Account (Email)
                </FormLabel>
                <Input
                  value={formData.data.email || ""}
                  onChange={(e) => handleDataChange("email", e.target.value)}
                  placeholder="your-email@example.com"
                  type="email"
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.email && (
                  <FormHelperText>{errors.email}</FormHelperText>
                )}
              </FormControl>

              <FormControl error={!!errors.apiToken}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  Authentication Token
                </FormLabel>
                <Input
                  value={formData.data.apiToken || ""}
                  onChange={(e) =>
                    handleDataChange("apiToken", e.target.value)
                  }
                  placeholder="Your Atlassian API token"
                  type="password"
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.apiToken && (
                  <FormHelperText>{errors.apiToken}</FormHelperText>
                )}
              </FormControl>

              <Box>
                <Button
                  variant="plain"
                  color="neutral"
                  size="sm"
                  startDecorator={<HelpOutlineIcon fontSize="small" />}
                  endDecorator={
                    <ExpandMoreIcon
                      fontSize="small"
                      sx={{
                        transition: "transform 0.2s",
                        transform: showHelp
                          ? "rotate(180deg)"
                          : "rotate(0deg)",
                      }}
                    />
                  }
                  onClick={() => setShowHelp(!showHelp)}
                  sx={{
                    color: "var(--text-tertiary)",
                    fontWeight: "normal",
                    px: 0,
                    "&:hover": {
                      bgcolor: "transparent",
                      color: "var(--text-secondary)",
                    },
                  }}
                >
                  How to get your Jira credentials
                </Button>
                {showHelp && (
                  <Box
                    sx={{
                      mt: 1.5,
                      pl: 1,
                      borderLeft: "2px solid var(--border-color)",
                    }}
                  >
                    <Stack spacing={2}>
                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{ mb: 0.5, color: "var(--text-secondary)" }}
                        >
                          Installation URL
                        </Typography>
                        <List
                          marker="decimal"
                          size="sm"
                          sx={{
                            "--ListItem-minHeight": "24px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          <ListItem>
                            Log in to your Atlassian Jira account in your
                            browser.
                          </ListItem>
                          <ListItem>
                            Look at the URL in your browser's address bar.
                          </ListItem>
                          <ListItem>
                            Copy the base URL (e.g.{" "}
                            <Typography
                              level="body-xs"
                              fontFamily="monospace"
                              component="code"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              https://your-domain.atlassian.net
                            </Typography>
                            ).
                          </ListItem>
                        </List>
                      </Box>

                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{ mb: 0.5, color: "var(--text-secondary)" }}
                        >
                          Login Account (Email)
                        </Typography>
                        <Typography
                          level="body-sm"
                          sx={{ color: "var(--text-tertiary)" }}
                        >
                          Use the email address you use to log in to your
                          Atlassian account.
                        </Typography>
                      </Box>

                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{ mb: 0.5, color: "var(--text-secondary)" }}
                        >
                          Authentication Token
                        </Typography>
                        <List
                          marker="decimal"
                          size="sm"
                          sx={{
                            "--ListItem-minHeight": "24px",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          <ListItem>
                            Go to{" "}
                            <Typography
                              level="body-xs"
                              fontFamily="monospace"
                              component="code"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              https://id.atlassian.net/manage-profile/security/api-tokens
                            </Typography>
                          </ListItem>
                          <ListItem>Click "Create API token".</ListItem>
                          <ListItem>
                            Enter a descriptive label (e.g. "Chat Integration").
                          </ListItem>
                          <ListItem>
                            Click "Create" and copy the generated token.
                          </ListItem>
                          <ListItem>
                            Paste the token into the field above.
                          </ListItem>
                        </List>
                      </Box>
                    </Stack>
                  </Box>
                )}
              </Box>

              {errors.submit && (
                <Typography level="body-sm" color="danger">
                  {errors.submit}
                </Typography>
              )}

              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button
                  type="submit"
                  size="lg"
                  loading={loading}
                  disabled={loading}
                  sx={{
                    bgcolor: "#0052CC",
                    "&:hover": { bgcolor: "#0747A6" },
                  }}
                >
                  {isEditMode ? "Update Resource" : "Create Resource"}
                </Button>
                <Button
                  variant="outlined"
                  color="neutral"
                  size="lg"
                  onClick={() =>
                    navigate(
                      isEditMode
                        ? "/resources"
                        : "/resources/new"
                    )
                  }
                  disabled={loading}
                  sx={{ borderColor: "var(--border-color)" }}
                >
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </form>
        </Card>
      </Box>
    </Box>
  );
}

export default JiraResourceForm;
