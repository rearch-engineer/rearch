import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Card,
  Stack,
  IconButton,
  Table,
  Chip,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  Switch,
  Checkbox,
  Divider,
  Alert,
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import KeyIcon from "@mui/icons-material/Key";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

export default function LlmProvidersSettings() {
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [registry, setRegistry] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formProviderId, setFormProviderId] = useState("");
  const [formName, setFormName] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formApiKey, setFormApiKey] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formModels, setFormModels] = useState([]);
  const [isCustomProvider, setIsCustomProvider] = useState(false);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getLlmProviders();
      setProviders(data || []);
    } catch (err) {
      toast.error("Failed to load LLM providers: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadRegistry = useCallback(async () => {
    try {
      const data = await api.getLlmProviderRegistry();
      setRegistry(data || {});
    } catch {
      setRegistry({});
    }
  }, []);

  useEffect(() => {
    loadProviders();
    loadRegistry();
  }, [loadProviders, loadRegistry]);

  const openAddModal = () => {
    setEditingProvider(null);
    setFormProviderId("");
    setFormName("");
    setFormEnabled(true);
    setFormApiKey("");
    setFormBaseUrl("");
    setFormModels([]);
    setIsCustomProvider(false);
    setModalOpen(true);
  };

  const openEditModal = (provider) => {
    setEditingProvider(provider);
    setFormProviderId(provider.providerId);
    setFormName(provider.name);
    setFormEnabled(provider.enabled);
    setFormApiKey(""); // Don't pre-fill for security
    setFormBaseUrl(provider.baseUrl || "");
    setIsCustomProvider(!!provider.baseUrl);
    setFormModels(
      (provider.models || []).map((m) => ({
        modelId: m.modelId,
        name: m.name,
        enabled: m.enabled,
      }))
    );
    setModalOpen(true);
  };

  const handleProviderSelect = (value) => {
    if (!value) return;
    if (value === "__custom") {
      setIsCustomProvider(true);
      setFormProviderId("");
      setFormName("");
      setFormBaseUrl("");
      setFormModels([]);
      return;
    }
    setIsCustomProvider(false);
    setFormProviderId(value);
    setFormBaseUrl("");
    const known = registry[value];
    if (known) {
      setFormName(known.name);
      setFormModels(
        known.models.map((m) => ({
          modelId: m.id,
          name: m.name,
          enabled: true,
        }))
      );
    }
  };

  const handleModelToggle = (modelId) => {
    setFormModels((prev) =>
      prev.map((m) =>
        m.modelId === modelId ? { ...m, enabled: !m.enabled } : m
      )
    );
  };

  const handleAddCustomModel = () => {
    const modelId = window.prompt("Enter model ID (e.g. gpt-4o-mini):");
    if (!modelId || !modelId.trim()) return;
    const name = window.prompt("Enter display name:", modelId);
    if (!name) return;
    setFormModels((prev) => [
      ...prev,
      { modelId: modelId.trim(), name: name.trim(), enabled: true },
    ]);
  };

  const handleRemoveModel = (modelId) => {
    setFormModels((prev) => prev.filter((m) => m.modelId !== modelId));
  };

  const handleSave = async () => {
    if (!formProviderId || !formName) {
      toast.error("Provider ID and name are required");
      return;
    }
    if (formModels.length === 0) {
      toast.error("At least one model is required");
      return;
    }
    if (!editingProvider && !formApiKey) {
      toast.error("API key is required for new providers");
      return;
    }

    try {
      setSaving(true);
      if (editingProvider) {
        const updateData = {
          name: formName,
          enabled: formEnabled,
          baseUrl: formBaseUrl || null,
          models: formModels,
        };
        if (formApiKey.trim()) {
          updateData.apiKey = formApiKey;
        }
        await api.updateLlmProvider(editingProvider._id, updateData);
        toast.success("Provider updated");
      } else {
        await api.createLlmProvider({
          providerId: formProviderId,
          name: formName,
          enabled: formEnabled,
          apiKey: formApiKey,
          baseUrl: formBaseUrl || null,
          models: formModels,
        });
        toast.success("Provider created");
      }
      setModalOpen(false);
      loadProviders();
    } catch (err) {
      toast.error(
        "Failed to save provider: " +
          (err.response?.data?.error || err.message)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the "${provider.name}" provider? This will affect all future conversations.`
      )
    )
      return;
    try {
      await api.deleteLlmProvider(provider._id);
      toast.success("Provider deleted");
      loadProviders();
    } catch (err) {
      toast.error(
        "Failed to delete provider: " +
          (err.response?.data?.error || err.message)
      );
    }
  };

  const handleToggleEnabled = async (provider) => {
    try {
      await api.updateLlmProvider(provider._id, {
        enabled: !provider.enabled,
      });
      loadProviders();
    } catch (err) {
      toast.error("Failed to update provider: " + err.message);
    }
  };

  // All registry providers are always available (duplicates allowed)
  const availableRegistryProviders = Object.entries(registry);

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
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 4 }}
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
              LLM Providers
            </Typography>
            <Typography
              level="body-lg"
              sx={{ color: "var(--text-secondary)", fontSize: "1rem" }}
            >
              Configure which LLM providers and models are available in
              conversation containers. API keys are encrypted at rest.
            </Typography>
          </Box>
          <Button
            variant="solid"
            color="primary"
            startDecorator={<AddIcon />}
            onClick={openAddModal}
            sx={{ flexShrink: 0, mt: 0.5 }}
          >
            Add Provider
          </Button>
        </Stack>

        {/* Info alert */}
        {providers.length > 0 && (
          <Alert
            variant="soft"
            color="neutral"
            sx={{ mb: 3, bgcolor: "var(--bg-secondary)" }}
          >
            <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
              Changes to providers take effect for new conversations only.
              Existing running containers are not affected.
            </Typography>
          </Alert>
        )}

        {/* Providers table */}
        <Card
          variant="outlined"
          sx={{
            borderColor: "var(--border-color)",
            bgcolor: "var(--bg-primary)",
            overflow: "auto",
          }}
        >
          {providers.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography
                level="body-lg"
                sx={{ color: "var(--text-secondary)", mb: 1 }}
              >
                No LLM providers configured
              </Typography>
              <Typography
                level="body-sm"
                sx={{ color: "var(--text-tertiary)", mb: 3 }}
              >
                Add at least one provider to enable AI conversations.
              </Typography>
              <Button
                variant="soft"
                color="primary"
                startDecorator={<AddIcon />}
                onClick={openAddModal}
              >
                Add Provider
              </Button>
            </Box>
          ) : (
            <Table
              sx={{
                "& thead th": {
                  bgcolor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  borderBottom: "1px solid var(--border-color)",
                },
                "& tbody tr": {
                  borderBottom: "1px solid var(--border-color)",
                  "&:last-child": { borderBottom: "none" },
                },
                "& tbody td": { color: "var(--text-primary)" },
              }}
            >
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>API Key</th>
                  <th>Models</th>
                  <th>Status</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => {
                  const enabledModels = (provider.models || []).filter(
                    (m) => m.enabled
                  );
                  return (
                    <tr key={provider._id}>
                      <td>
                        <Typography
                          level="body-sm"
                          sx={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {provider.name}
                        </Typography>
                        <Typography
                          level="body-xs"
                          sx={{
                            fontFamily: "monospace",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {provider.providerId}
                        </Typography>
                        {provider.baseUrl && (
                          <Typography
                            level="body-xs"
                            sx={{
                              fontFamily: "monospace",
                              color: "var(--text-tertiary)",
                              fontSize: "0.7rem",
                            }}
                          >
                            {provider.baseUrl}
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          {provider.hasApiKey ? (
                            <>
                              <VisibilityOffIcon
                                sx={{
                                  fontSize: 14,
                                  color: "var(--text-tertiary)",
                                }}
                              />
                              <Typography
                                level="body-xs"
                                sx={{
                                  fontFamily: "monospace",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {provider.apiKey}
                              </Typography>
                            </>
                          ) : (
                            <Chip size="sm" variant="soft" color="warning">
                              No key
                            </Chip>
                          )}
                        </Stack>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {enabledModels.slice(0, 3).map((m) => (
                            <Chip
                              key={m.modelId}
                              size="sm"
                              variant="soft"
                              color="primary"
                            >
                              {m.name}
                            </Chip>
                          ))}
                          {enabledModels.length > 3 && (
                            <Chip size="sm" variant="soft" color="neutral">
                              +{enabledModels.length - 3} more
                            </Chip>
                          )}
                        </Stack>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={provider.enabled ? "success" : "neutral"}
                          onClick={() => handleToggleEnabled(provider)}
                          sx={{ cursor: "pointer" }}
                        >
                          {provider.enabled ? "Active" : "Disabled"}
                        </Chip>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => openEditModal(provider)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(provider)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </Box>

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <ModalDialog
          sx={{
            maxWidth: 560,
            width: "100%",
            overflow: "auto",
            maxHeight: "90vh",
          }}
        >
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingProvider ? "Edit Provider" : "Add LLM Provider"}
          </Typography>

          <Stack spacing={2.5}>
            {/* Provider ID */}
            {!editingProvider ? (
              <>
                <FormControl>
                  <FormLabel>Provider</FormLabel>
                  <Select
                    placeholder="Select a provider..."
                    value={isCustomProvider ? "__custom" : formProviderId || null}
                    onChange={(_, v) => handleProviderSelect(v)}
                  >
                    {availableRegistryProviders.map(([id, info]) => (
                      <Option key={id} value={id}>
                        {info.name}
                      </Option>
                    ))}
                    <Option value="__custom">Custom OpenAI compatible provider</Option>
                  </Select>
                </FormControl>
                {isCustomProvider && (
                  <>
                    <FormControl>
                      <FormLabel>Provider ID</FormLabel>
                      <Input
                        placeholder="Lowercase identifier, e.g. my-llm"
                        value={formProviderId}
                        onChange={(e) => setFormProviderId(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Base URL</FormLabel>
                      <Input
                        placeholder="https://api.example.com/v1"
                        value={formBaseUrl}
                        onChange={(e) => setFormBaseUrl(e.target.value)}
                      />
                      <Typography level="body-xs" sx={{ mt: 0.5, color: "var(--text-tertiary)" }}>
                        The OpenAI-compatible API endpoint URL
                      </Typography>
                    </FormControl>
                  </>
                )}
              </>
            ) : (
              <>
                <FormControl>
                  <FormLabel>Provider ID</FormLabel>
                  <Input value={formProviderId} disabled />
                </FormControl>
                {(isCustomProvider || formBaseUrl) && (
                  <FormControl>
                    <FormLabel>Base URL</FormLabel>
                    <Input
                      placeholder="https://api.example.com/v1"
                      value={formBaseUrl}
                      onChange={(e) => setFormBaseUrl(e.target.value)}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: "var(--text-tertiary)" }}>
                      The OpenAI-compatible API endpoint URL
                    </Typography>
                  </FormControl>
                )}
              </>
            )}

            {/* Display name */}
            <FormControl>
              <FormLabel>Display Name</FormLabel>
              <Input
                placeholder="e.g. Anthropic, OpenAI"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </FormControl>

            {/* API Key */}
            <FormControl>
              <FormLabel>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <KeyIcon sx={{ fontSize: 16 }} />
                  <span>API Key</span>
                </Stack>
              </FormLabel>
              <Input
                type="password"
                placeholder={
                  editingProvider
                    ? "Leave empty to keep current key"
                    : "Enter API key"
                }
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
              {editingProvider?.hasApiKey && !formApiKey && (
                <Typography
                  level="body-xs"
                  sx={{ mt: 0.5, color: "var(--text-tertiary)" }}
                >
                  Current key: {editingProvider.apiKey}
                </Typography>
              )}
            </FormControl>

            {/* Enabled toggle */}
            <FormControl orientation="horizontal">
              <Box sx={{ flex: 1 }}>
                <FormLabel>Enabled</FormLabel>
                <Typography level="body-xs" sx={{ color: "var(--text-tertiary)" }}>
                  Disabled providers will not be available in new conversations
                </Typography>
              </Box>
              <Switch
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
              />
            </FormControl>

            <Divider />

            {/* Models */}
            <Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1.5 }}
              >
                <FormLabel sx={{ mb: 0 }}>Models</FormLabel>
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  onClick={handleAddCustomModel}
                >
                  + Custom model
                </Button>
              </Stack>
              {formModels.length === 0 ? (
                <Typography
                  level="body-sm"
                  sx={{ color: "var(--text-tertiary)", py: 2, textAlign: "center" }}
                >
                  {formProviderId
                    ? "No models configured. Select a provider or add custom models."
                    : "Select a provider to see available models."}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {formModels.map((model) => (
                    <Card
                      key={model.modelId}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderColor: model.enabled
                          ? "var(--border-color)"
                          : "transparent",
                        opacity: model.enabled ? 1 : 0.5,
                      }}
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Checkbox
                            checked={model.enabled}
                            onChange={() => handleModelToggle(model.modelId)}
                            size="sm"
                          />
                          <Box>
                            <Typography
                              level="body-sm"
                              sx={{ fontWeight: 600 }}
                            >
                              {model.name}
                            </Typography>
                            <Typography
                              level="body-xs"
                              sx={{
                                fontFamily: "monospace",
                                color: "var(--text-tertiary)",
                              }}
                            >
                              {model.modelId}
                            </Typography>
                          </Box>
                        </Stack>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          onClick={() => handleRemoveModel(model.modelId)}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* Actions */}
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="plain"
                color="neutral"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="solid"
                color="primary"
                onClick={handleSave}
                loading={saving}
              >
                {editingProvider ? "Save Changes" : "Add Provider"}
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
