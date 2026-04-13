import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import KeyIcon from "@mui/icons-material/Key";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";

export default function LlmProvidersSettings() {
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const confirm = useConfirm();
  const [providers, setProviders] = useState([]);
  const [registry, setRegistry] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

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
      toast.error(t("llmProviders.failedToLoadProviders", { message: err.message }));
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
      })),
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
        })),
      );
    }
  };

  const handleModelToggle = (modelId) => {
    setFormModels((prev) =>
      prev.map((m) =>
        m.modelId === modelId ? { ...m, enabled: !m.enabled } : m,
      ),
    );
  };

  const handleAddCustomModel = () => {
    const modelId = window.prompt(t("llmProviders.enterModelId"));
    if (!modelId || !modelId.trim()) return;
    const name = window.prompt(t("llmProviders.enterDisplayName"), modelId);
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
      toast.error(t("llmProviders.providerIdAndNameRequired"));
      return;
    }
    if (formModels.length === 0) {
      toast.error(t("llmProviders.atLeastOneModelRequired"));
      return;
    }
    if (!editingProvider && !formApiKey) {
      toast.error(t("llmProviders.apiKeyRequiredForNew"));
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
        toast.success(t("llmProviders.providerUpdated"));
      } else {
        await api.createLlmProvider({
          providerId: formProviderId,
          name: formName,
          enabled: formEnabled,
          apiKey: formApiKey,
          baseUrl: formBaseUrl || null,
          models: formModels,
        });
        toast.success(t("llmProviders.providerCreated"));
      }
      setModalOpen(false);
      loadProviders();
    } catch (err) {
      toast.error(t("llmProviders.failedToSaveProvider", { message: err.response?.data?.error || err.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider) => {
    if (
      !(await confirm({
        title: t("llmProviders.deleteProvider"),
        message: t("llmProviders.deleteProviderConfirm", { name: provider.name }),
        confirmText: t("llmProviders.delete"),
        confirmColor: "danger",
      }))
    )
      return;
    try {
      await api.deleteLlmProvider(provider._id);
      toast.success(t("llmProviders.providerDeleted"));
      loadProviders();
    } catch (err) {
      toast.error(t("llmProviders.failedToDeleteProvider", { message: err.response?.data?.error || err.message }));
    }
  };

  const handleToggleEnabled = async (provider) => {
    try {
      await api.updateLlmProvider(provider._id, {
        enabled: !provider.enabled,
      });
      loadProviders();
    } catch (err) {
      toast.error(t("llmProviders.failedToUpdateProvider", { message: err.message }));
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
          {t("llmProviders.loading")}
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
            {t("llmProviders.title")}
          </Typography>
        </Box>

        {/* Search & actions */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems="center"
          sx={{ mb: 3 }}
        >
          <Input
            size="sm"
            placeholder={t("llmProviders.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startDecorator={
              <SearchIcon sx={{ color: "var(--text-secondary)" }} />
            }
            sx={{
              flex: 1,
              bgcolor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          />
          <Button
            size="sm"
            variant="solid"
            onClick={openAddModal}
            sx={{
              flexShrink: 0,
              bgcolor: "#fff",
              color: "#000",
              "&:hover": { bgcolor: "#e5e5e5" },
            }}
          >
            {t("llmProviders.connect")}
          </Button>
        </Stack>

        {/* Providers table */}
        <Box sx={{ bgcolor: "var(--bg-primary)", overflow: "auto" }}>
          {providers.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography
                level="body-sm"
                sx={{ color: "var(--text-tertiary)" }}
              >
                {t("llmProviders.emptyState")}
              </Typography>
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
                  <th>{t("llmProviders.provider")}</th>
                  <th>{t("llmProviders.apiKey")}</th>
                  <th>{t("llmProviders.models")}</th>
                  <th>{t("llmProviders.status")}</th>
                  <th style={{ width: 120 }}>{t("llmProviders.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {providers
                  .filter((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((provider) => {
                    const enabledModels = (provider.models || []).filter(
                      (m) => m.enabled,
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
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1}
                          >
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
                                {t("llmProviders.noKey")}
                              </Chip>
                            )}
                          </Stack>
                        </td>
                        <td>
                          <Stack
                            direction="row"
                            spacing={0.5}
                            flexWrap="wrap"
                            useFlexGap
                          >
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
                                {t("llmProviders.moreModels", { count: enabledModels.length - 3 })}
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
                            {provider.enabled ? t("llmProviders.active") : t("llmProviders.disabled")}
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
        </Box>
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
            {editingProvider ? t("llmProviders.editProvider") : t("llmProviders.addLlmProvider")}
          </Typography>

          <Stack spacing={2.5}>
            {/* Provider ID */}
            {!editingProvider ? (
              <>
                <FormControl>
                  <FormLabel>{t("llmProviders.provider")}</FormLabel>
                  <Select
                    placeholder={t("llmProviders.selectProvider")}
                    value={
                      isCustomProvider ? "__custom" : formProviderId || null
                    }
                    onChange={(_, v) => handleProviderSelect(v)}
                  >
                    {availableRegistryProviders.map(([id, info]) => (
                      <Option key={id} value={id}>
                        {info.name}
                      </Option>
                    ))}
                    <Option value="__custom">
                      {t("llmProviders.customOpenAI")}
                    </Option>
                  </Select>
                </FormControl>
                {isCustomProvider && (
                  <>
                    <FormControl>
                      <FormLabel>{t("llmProviders.providerIdLabel")}</FormLabel>
                      <Input
                        placeholder={t("llmProviders.providerIdPlaceholder")}
                        value={formProviderId}
                        onChange={(e) => setFormProviderId(e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{t("llmProviders.baseUrl")}</FormLabel>
                      <Input
                        placeholder="https://api.example.com/v1"
                        value={formBaseUrl}
                        onChange={(e) => setFormBaseUrl(e.target.value)}
                      />
                      <Typography
                        level="body-xs"
                        sx={{ mt: 0.5, color: "var(--text-tertiary)" }}
                      >
                        {t("llmProviders.baseUrlHelp")}
                      </Typography>
                    </FormControl>
                  </>
                )}
              </>
            ) : (
              <>
                <FormControl>
                  <FormLabel>{t("llmProviders.providerIdLabel")}</FormLabel>
                  <Input value={formProviderId} disabled />
                </FormControl>
                {(isCustomProvider || formBaseUrl) && (
                  <FormControl>
                    <FormLabel>{t("llmProviders.baseUrl")}</FormLabel>
                    <Input
                      placeholder="https://api.example.com/v1"
                      value={formBaseUrl}
                      onChange={(e) => setFormBaseUrl(e.target.value)}
                    />
                    <Typography
                      level="body-xs"
                      sx={{ mt: 0.5, color: "var(--text-tertiary)" }}
                    >
                      {t("llmProviders.baseUrlHelp")}
                    </Typography>
                  </FormControl>
                )}
              </>
            )}

            {/* Display name */}
            <FormControl>
              <FormLabel>{t("llmProviders.displayName")}</FormLabel>
              <Input
                placeholder={t("llmProviders.displayNamePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </FormControl>

            {/* API Key */}
            <FormControl>
              <FormLabel>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <KeyIcon sx={{ fontSize: 16 }} />
                  <span>{t("llmProviders.apiKeyLabel")}</span>
                </Stack>
              </FormLabel>
              <Input
                type="password"
                placeholder={
                  editingProvider
                    ? t("llmProviders.leaveEmptyToKeepCurrent")
                    : t("llmProviders.enterApiKey")
                }
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
              {editingProvider?.hasApiKey && !formApiKey && (
                <Typography
                  level="body-xs"
                  sx={{ mt: 0.5, color: "var(--text-tertiary)" }}
                >
                  {t("llmProviders.currentKey", { key: editingProvider.apiKey })}
                </Typography>
              )}
            </FormControl>

            {/* Enabled toggle */}
            <FormControl orientation="horizontal">
              <Box sx={{ flex: 1 }}>
                <FormLabel>{t("llmProviders.enabled")}</FormLabel>
                <Typography
                  level="body-xs"
                  sx={{ color: "var(--text-tertiary)" }}
                >
                  {t("llmProviders.disabledProvidersHelp")}
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
                <FormLabel sx={{ mb: 0 }}>{t("llmProviders.modelsLabel")}</FormLabel>
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  onClick={handleAddCustomModel}
                >
                  {t("llmProviders.customModel")}
                </Button>
              </Stack>
              {formModels.length === 0 ? (
                <Typography
                  level="body-sm"
                  sx={{
                    color: "var(--text-tertiary)",
                    py: 2,
                    textAlign: "center",
                  }}
                >
                  {formProviderId
                    ? t("llmProviders.noModelsConfigured")
                    : t("llmProviders.selectProviderToSeeModels")}
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
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1.5}
                        >
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
                {t("llmProviders.cancel")}
              </Button>
              <Button
                variant="solid"
                color="primary"
                onClick={handleSave}
                loading={saving}
              >
                {editingProvider ? t("llmProviders.saveChanges") : t("llmProviders.addProvider")}
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
