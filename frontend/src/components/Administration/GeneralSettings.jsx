import React, { useState, useEffect } from "react";
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
      toast.error("Failed to load settings: " + err.message);
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
      toast.success("Signup settings saved.");
    } catch (err) {
      toast.error("Failed to save signup settings: " + err.message);
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
      toast.error("Invalid domain format.");
      return;
    }
    if (allowedDomains.includes(domain)) {
      toast.error("Domain already in the list.");
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
          Loading...
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
          <Typography
            level="h2"
            sx={{
              mb: 1,
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: { xs: "1.5rem", md: "1.75rem" },
            }}
          >
            General
          </Typography>

        </Box>

        {/* Signup Restrictions card — only shown in LOCAL auth mode */}
        {authMode === "LOCAL" && (
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
                sx={{ mb: 0.5, fontWeight: 700, color: "var(--text-primary)" }}
              >
                Signup Restrictions
              </Typography>
              <Typography
                level="body-sm"
                sx={{ mb: 3, color: "var(--text-secondary)" }}
              >
                Control who can create new accounts when using local
                authentication.
              </Typography>

              <Stack spacing={3}>
                {/* Toggle: Restrict new signups */}
                <FormControl
                  orientation="horizontal"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 2,
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    bgcolor: "var(--bg-secondary)",
                  }}
                >
                  <Box>
                    <FormLabel
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        mb: 0.25,
                      }}
                    >
                      Restrict new signups
                    </FormLabel>
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-tertiary)" }}
                    >
                      When enabled, no new users can register.
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
                      Accept only specific email domains
                    </FormLabel>
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-tertiary)", mb: 1.5 }}
                    >
                      When domains are listed, only users with matching email
                      addresses can register. Leave empty to allow all domains.
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
                        Add
                      </Button>
                    </Box>

                    {allowedDomains.length === 0 && (
                      <Alert
                        variant="soft"
                        color="neutral"
                        size="sm"
                        sx={{ mt: 1.5 }}
                      >
                        No domain restrictions — all email addresses are accepted.
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
