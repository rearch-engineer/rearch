import React, { useState, useEffect, useRef } from "react";
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
  Card,
  List,
  ListItem,
  Chip,
} from "@mui/joy";
import { ArrowBack } from "@mui/icons-material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { api } from "../../../../../api/client";

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

function GithubResourceForm() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = !!id && location.pathname.includes("/edit");

  const [formData, setFormData] = useState({
    name: "",
    provider: "github",
    data: {},
  });
  const [pemFile, setPemFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef(null);

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
      newErrors.name = t("githubResourceForm.nameError");
    }

    if (!formData.data.appId) newErrors.appId = t("githubResourceForm.appIdRequired");
    if (!pemFile && !formData.data.privateKeyFileId) newErrors.privateKey = t("githubResourceForm.privateKeyRequired");
    if (!formData.data.installationId)
      newErrors.installationId = t("githubResourceForm.installationIdRequired");

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
        await api.updateGithubResource(id, formData, pemFile);
      } else {
        await api.createGithubResource(formData, pemFile);
      }
      navigate("/administration/resources");
    } catch (error) {
      console.error("Error submitting form:", error);
      setErrors({ submit: t("githubResourceForm.failedToSave") });
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
        <Typography>{t("githubResourceForm.loadingResource")}</Typography>
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
          {isEditMode
            ? t("githubResourceForm.backToResources")
            : t("githubResourceForm.backToAddResource")}
        </Button>

        {/* Header with icon */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, mb: 4 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              minWidth: 64,
              borderRadius: "14px",
              bgcolor: "rgba(36, 41, 47, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 3px var(--shadow-color)",
            }}
          >
            <GitHubIcon size={36} />
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
                {isEditMode
                  ? t("githubResourceForm.editGithubResource")
                  : t("githubResourceForm.connectGithub")}
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
              {t("githubResourceForm.connectDescription")}
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
                  {t("githubResourceForm.name")}
                </FormLabel>
                <Input
                  data-testid="gh-resource-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("githubResourceForm.namePlaceholder")}
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.name && <FormHelperText>{errors.name}</FormHelperText>}
              </FormControl>

              <FormControl error={!!errors.appId}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  {t("githubResourceForm.appId")}
                </FormLabel>
                <Input
                  data-testid="gh-resource-app-id"
                  value={formData.data.appId || ""}
                  onChange={(e) => handleDataChange("appId", e.target.value)}
                  placeholder={t("githubResourceForm.appIdPlaceholder")}
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.appId && (
                  <FormHelperText>{errors.appId}</FormHelperText>
                )}
              </FormControl>

              <FormControl error={!!errors.privateKey}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  {t("githubResourceForm.privateKey")}
                </FormLabel>
                <input
                  type="file"
                  accept=".pem"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  data-testid="gh-resource-private-key-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPemFile(file);
                    }
                  }}
                />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                  }}
                >
                  <Button
                    data-testid="gh-resource-private-key"
                    variant="outlined"
                    color={pemFile || formData.data.privateKeyFileId ? "success" : "neutral"}
                    startDecorator={
                      pemFile || formData.data.privateKeyFileId ? (
                        <CheckCircleIcon />
                      ) : (
                        <UploadFileIcon />
                      )
                    }
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      borderColor: "var(--border-color)",
                      bgcolor: "var(--bg-secondary)",
                    }}
                  >
                    {pemFile
                      ? pemFile.name
                      : formData.data.privateKeyFileId
                        ? t("githubResourceForm.privateKeyUploaded")
                        : t("githubResourceForm.privateKeyUpload")}
                  </Button>
                  {(pemFile || formData.data.privateKeyFileId) && (
                    <Chip
                      size="sm"
                      variant="soft"
                      color="success"
                    >
                      {pemFile ? t("githubResourceForm.privateKeyReady") : t("githubResourceForm.privateKeyUploaded")}
                    </Chip>
                  )}
                </Box>
                {errors.privateKey && (
                  <FormHelperText>{errors.privateKey}</FormHelperText>
                )}
              </FormControl>

              <FormControl error={!!errors.installationId}>
                <FormLabel sx={{ color: "var(--text-secondary)" }}>
                  {t("githubResourceForm.installationId")}
                </FormLabel>
                <Input
                  data-testid="gh-resource-installation-id"
                  value={formData.data.installationId || ""}
                  onChange={(e) =>
                    handleDataChange("installationId", e.target.value)
                  }
                  placeholder={t(
                    "githubResourceForm.installationIdPlaceholder",
                  )}
                  size="lg"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
                {errors.installationId && (
                  <FormHelperText>{errors.installationId}</FormHelperText>
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
                  {t("githubResourceForm.howToGetCredentials")}
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
                          sx={{
                            mb: 0.5,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {t("githubResourceForm.helpAppId")}
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
                            {t("githubResourceForm.helpAppIdStep1")}
                          </ListItem>
                          <ListItem>
                            {t("githubResourceForm.helpAppIdStep2")}
                          </ListItem>
                          <ListItem>
                            {t("githubResourceForm.helpAppIdStep3")}
                          </ListItem>
                        </List>
                      </Box>

                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{
                            mb: 0.5,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {t("githubResourceForm.helpPrivateKey")}
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
                            {t("githubResourceForm.helpPrivateKeyStep1")}
                          </ListItem>
                          <ListItem>
                            {t("githubResourceForm.helpPrivateKeyStep2")}
                          </ListItem>
                          <ListItem>
                            {t("githubResourceForm.helpPrivateKeyStep3")}
                          </ListItem>
                        </List>
                      </Box>

                      <Box>
                        <Typography
                          level="title-sm"
                          sx={{
                            mb: 0.5,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {t("githubResourceForm.helpInstallationId")}
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
                            {t("githubResourceForm.helpInstallationIdStep1")}
                          </ListItem>
                          <ListItem>
                            {t("githubResourceForm.helpInstallationIdStep2")}
                          </ListItem>
                          <ListItem>
                            {t("githubResourceForm.helpInstallationIdStep3")}
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
                  data-testid="gh-resource-submit"
                  type="submit"
                  size="lg"
                  loading={loading}
                  disabled={loading}
                  sx={{
                    bgcolor: "#24292f",
                    "&:hover": { bgcolor: "#1b1f23" },
                  }}
                >
                  {isEditMode
                    ? t("githubResourceForm.updateResource")
                    : t("githubResourceForm.createResource")}
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
                  {t("githubResourceForm.cancel")}
                </Button>
              </Stack>
            </Stack>
          </form>
        </Card>
      </Box>
    </Box>
  );
}

export default GithubResourceForm;
