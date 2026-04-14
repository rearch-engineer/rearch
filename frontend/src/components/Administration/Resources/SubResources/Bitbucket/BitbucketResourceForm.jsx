import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { api } from "../../../../../api/client";

// Bitbucket SVG logo component (matches ResourceTypeSelection)
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
        id="bb-form-grad"
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
      fill="url(#bb-form-grad)"
    />
  </svg>
);

function BitbucketResourceForm() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = !!id && location.pathname.includes("/edit");

  const [formData, setFormData] = useState({
    name: "",
    provider: "bitbucket",
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
      const resources = await api.getAdminResources();
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
      newErrors.name = t("bitbucketResourceForm.nameError");
    }

    if (!formData.data.workspace) newErrors.workspace = t("bitbucketResourceForm.workspaceRequired");
    if (!formData.data.email) newErrors.email = t("bitbucketResourceForm.emailRequired");
    if (!formData.data.cloneUsername)
      newErrors.cloneUsername = t("bitbucketResourceForm.cloneUsernameRequired");
    if (!formData.data.apiToken) newErrors.apiToken = t("bitbucketResourceForm.apiTokenRequired");

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
      navigate("/administration/resources");
    } catch (error) {
      console.error("Error submitting form:", error);
      setErrors({ submit: t("bitbucketResourceForm.failedToSave") });
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
        <Typography>{t("bitbucketResourceForm.loadingResource")}</Typography>
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
            navigate(
              isEditMode
                ? "/administration/resources"
                : "/administration/resources/new",
            )
          }
          sx={{ mb: 2 }}
        >
          {isEditMode ? t("bitbucketResourceForm.backToResources") : t("bitbucketResourceForm.backToAddResource")}
        </Button>

        {/* Header with icon - matches marketplace style */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, mb: 4 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              minWidth: 64,
              borderRadius: "14px",
              bgcolor: "rgba(38, 132, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 3px var(--shadow-color)",
            }}
          >
            <BitbucketIcon size={36} />
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
                {isEditMode ? t("bitbucketResourceForm.editBitbucketResource") : t("bitbucketResourceForm.connectBitbucket")}
              </Typography>
            </Stack>
            <Typography
              level="body-lg"
              sx={{
                color: "var(--text-secondary)",
                fontSize: "1rem",
                mt: 0.5,
              }}
            >
              {t("bitbucketResourceForm.connectDescription")}
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
                  {t("bitbucketResourceForm.name")}
                </FormLabel>
                <Input
                  data-testid="bb-resource-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("bitbucketResourceForm.namePlaceholder")}
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.name && <FormHelperText>{errors.name}</FormHelperText>}
              </FormControl>

              <FormControl error={!!errors.workspace}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  {t("bitbucketResourceForm.workspace")}
                </FormLabel>
                <Input
                  data-testid="bb-resource-workspace"
                  value={formData.data.workspace || ""}
                  onChange={(e) =>
                    handleDataChange("workspace", e.target.value)
                  }
                  placeholder={t("bitbucketResourceForm.workspacePlaceholder")}
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.workspace && (
                  <FormHelperText>{errors.workspace}</FormHelperText>
                )}
              </FormControl>

              <FormControl error={!!errors.email}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  {t("bitbucketResourceForm.email")}
                </FormLabel>
                <Input
                  data-testid="bb-resource-email"
                  value={formData.data.email || ""}
                  onChange={(e) => handleDataChange("email", e.target.value)}
                  placeholder={t("bitbucketResourceForm.emailPlaceholder")}
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

              <FormControl error={!!errors.cloneUsername}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  {t("bitbucketResourceForm.cloneUsername")}
                </FormLabel>
                <Input
                  data-testid="bb-resource-clone-username"
                  value={formData.data.cloneUsername || ""}
                  onChange={(e) =>
                    handleDataChange("cloneUsername", e.target.value)
                  }
                  placeholder={t("bitbucketResourceForm.cloneUsernamePlaceholder")}
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.cloneUsername && (
                  <FormHelperText>{errors.cloneUsername}</FormHelperText>
                )}
              </FormControl>

              <FormControl error={!!errors.apiToken}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  {t("bitbucketResourceForm.apiToken")}
                </FormLabel>
                <Input
                  data-testid="bb-resource-api-token"
                  value={formData.data.apiToken || ""}
                  onChange={(e) => handleDataChange("apiToken", e.target.value)}
                  placeholder={t("bitbucketResourceForm.apiTokenPlaceholder")}
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
                        transform: showHelp ? "rotate(180deg)" : "rotate(0deg)",
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
                  {t("bitbucketResourceForm.howToGetCredentials")}
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
                          {t("bitbucketResourceForm.helpWorkspace")}
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
                            {t("bitbucketResourceForm.helpWorkspaceStep1")}
                          </ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpWorkspaceStep2")}
                          </ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpWorkspaceStep3")}{" "}
                            <Typography
                              level="body-xs"
                              fontFamily="monospace"
                              component="code"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              {"https://bitbucket.org/{workspace-slug}/"}
                            </Typography>
                          </ListItem>
                        </List>
                      </Box>

                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{ mb: 0.5, color: "var(--text-secondary)" }}
                        >
                          {t("bitbucketResourceForm.helpEmail")}
                        </Typography>
                        <Typography
                          level="body-sm"
                          sx={{ color: "var(--text-tertiary)" }}
                        >
                          {t("bitbucketResourceForm.helpEmailDescription")}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{ mb: 0.5, color: "var(--text-secondary)" }}
                        >
                          {t("bitbucketResourceForm.helpCloneUsername")}
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
                            {t("bitbucketResourceForm.helpCloneUsernameStep1")}{" "}
                            <Typography
                              level="body-xs"
                              fontFamily="monospace"
                              component="code"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              https://bitbucket.org/account/settings/
                            </Typography>
                          </ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpCloneUsernameStep2")}
                          </ListItem>
                        </List>
                      </Box>

                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{ mb: 0.5, color: "var(--text-secondary)" }}
                        >
                          {t("bitbucketResourceForm.helpApiToken")}
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
                            {t("bitbucketResourceForm.helpApiTokenStep1")}{" "}
                            <Typography
                              level="body-xs"
                              fontFamily="monospace"
                              component="code"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              https://id.atlassian.com/manage-profile/security/api-tokens
                            </Typography>
                          </ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpApiTokenStep2")}
                          </ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpApiTokenStep3")}
                          </ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpApiTokenStep4")}
                          </ListItem>
                          <ListItem>{t("bitbucketResourceForm.helpApiTokenStep5")}</ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpApiTokenStep6")}{" "}
                            <Typography
                              level="body-xs"
                              fontFamily="monospace"
                              component="code"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              read:repository:bitbucket
                            </Typography>
                            {" & "}
                            <Typography
                              level="body-xs"
                              fontFamily="monospace"
                              component="code"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              write:pullrequest:bitbucket
                            </Typography>
                          </ListItem>
                          <ListItem>
                            {t("bitbucketResourceForm.helpApiTokenStep7")}
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
                  data-testid="bb-resource-submit"
                  type="submit"
                  size="lg"
                  loading={loading}
                  disabled={loading}
                  sx={{
                    bgcolor: "#0052CC",
                    "&:hover": { bgcolor: "#0747A6" },
                  }}
                >
                  {isEditMode ? t("bitbucketResourceForm.updateResource") : t("bitbucketResourceForm.createResource")}
                </Button>
                <Button
                  variant="outlined"
                  color="neutral"
                  size="lg"
                  onClick={() =>
                    navigate(
                      isEditMode
                        ? "/administration/resources"
                        : "/administration/resources/new",
                    )
                  }
                  disabled={loading}
                  sx={{ borderColor: "var(--border-color)" }}
                >
                  {t("bitbucketResourceForm.cancel")}
                </Button>
              </Stack>
            </Stack>
          </form>
        </Card>
      </Box>
    </Box>
  );
}

export default BitbucketResourceForm;
