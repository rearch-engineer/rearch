import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  Stack,
  Switch,
  Chip,
  ChipDelete,
  Input,
  Alert,
} from "@mui/joy";
import AddIcon from "@mui/icons-material/Add";

import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";

export default function GeneralSettings() {
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const { authMode } = useAuth();
  const [loading, setLoading] = useState(true);

  // Signup restriction state
  const [restrictSignups, setRestrictSignups] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [savingSignup, setSavingSignup] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await api.getSettings();

      const signupSetting = settings.find((s) => s.key === "signup");
      if (signupSetting?.value) {
        setRestrictSignups(signupSetting.value.restrictSignups || false);
        setAllowedDomains(signupSetting.value.allowedDomains || []);
      }
    } catch (err) {
      toast.error(t("general.failedToLoadSettings", { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSignupSettings = async (overrides = {}) => {
    try {
      setSavingSignup(true);
      const data = {
        restrictSignups: overrides.restrictSignups !== undefined ? overrides.restrictSignups : restrictSignups,
        allowedDomains: overrides.allowedDomains !== undefined ? overrides.allowedDomains : allowedDomains,
      };
      await api.updateSignupSettings(data);
      toast.success(t("general.signupSettingsSaved"));
    } catch (err) {
      toast.error(t("general.failedToSaveSignupSettings", { message: err.message }));
    } finally {
      setSavingSignup(false);
    }
  };

  const handleToggleRestrictSignups = async (e) => {
    const val = e.target.checked;
    setRestrictSignups(val);
    await handleSaveSignupSettings({ restrictSignups: val });
  };

  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(domain)) {
      toast.error(t("general.invalidDomainFormat"));
      return;
    }
    if (allowedDomains.includes(domain)) {
      toast.error(t("general.domainAlreadyInList"));
      return;
    }
    const updated = [...allowedDomains, domain];
    setAllowedDomains(updated);
    setNewDomain("");
    await handleSaveSignupSettings({ allowedDomains: updated });
  };

  const handleRemoveDomain = async (domain) => {
    const updated = allowedDomains.filter((d) => d !== domain);
    setAllowedDomains(updated);
    await handleSaveSignupSettings({ allowedDomains: updated });
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
          {t("general.loading")}
        </Typography>
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
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography level="h3" sx={{ mb: 3 }}>
            {t("general.title")}
          </Typography>

        </Box>

        {/* Signup Restrictions card — only shown in LOCAL auth mode */}
        {authMode === "LOCAL" && (
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography
                level="title-md"
                sx={{ mb: 0.5 }}
              >
                {t("general.signupRestrictions")}
              </Typography>
              <Typography
                level="body-sm"
                sx={{ color: "var(--text-secondary)", mb: 2 }}
              >
                {t("general.signupRestrictionsDescription")}
              </Typography>

              <Stack spacing={2}>
                {/* Toggle: Restrict new signups */}
                <FormControl
                  orientation="horizontal"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <FormLabel sx={{ mb: 0 }}>
                      {t("general.restrictNewSignups")}
                    </FormLabel>
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      {t("general.restrictNewSignupsDescription")}
                    </Typography>
                  </Box>
                  <Switch
                    checked={restrictSignups}
                    onChange={handleToggleRestrictSignups}
                    disabled={savingSignup}
                  />
                </FormControl>

                {/* Allowed Domains */}
                {!restrictSignups && (
                  <Box>
                    <FormLabel
                      sx={{
                        color: "var(--text-secondary)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        mb: 1,
                      }}
                    >
                      {t("general.acceptOnlySpecificDomains")}
                    </FormLabel>
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-tertiary)", mb: 1.5 }}
                    >
                      {t("general.acceptOnlySpecificDomainsDescription")}
                    </Typography>

                    {/* Domain chips */}
                    {allowedDomains.length > 0 && (
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 1,
                          mb: 1.5,
                        }}
                      >
                        {allowedDomains.map((domain) => (
                          <Chip
                            key={domain}
                            variant="soft"
                            color="primary"
                            endDecorator={
                              <ChipDelete
                                onDelete={() => handleRemoveDomain(domain)}
                              />
                            }
                          >
                            {domain}
                          </Chip>
                        ))}
                      </Box>
                    )}

                    {/* Add domain input */}
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <Input
                        size="sm"
                        placeholder="e.g. example.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddDomain();
                          }
                        }}
                        disabled={savingSignup}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        size="sm"
                        variant="outlined"
                        color="neutral"
                        startDecorator={<AddIcon />}
                        onClick={handleAddDomain}
                        disabled={savingSignup || !newDomain.trim()}
                      >
                        {t("general.add")}
                      </Button>
                    </Box>

                    {allowedDomains.length === 0 && (
                      <Alert
                        variant="soft"
                        color="neutral"
                        size="sm"
                        sx={{ mt: 1.5 }}
                      >
                        {t("general.noDomainRestrictions")}
                      </Alert>
                    )}
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}
