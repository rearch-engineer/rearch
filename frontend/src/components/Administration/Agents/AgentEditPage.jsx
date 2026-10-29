import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  Option,
  Switch,
  CircularProgress,
} from "@mui/joy";
import {
  ArrowBack,
  Check,
  Build,
  ContentCopy,
  Delete as DeleteIcon,
  HelpOutline,
  AutoAwesome,
} from "@mui/icons-material";
import { api } from "../../../api/client";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import AgentServicesEditor from "./AgentServicesEditor";
import {
  TEMPLATE_OPTIONS,
  TEMPLATE_DEFAULT_SERVICES,
  parseDockerfileExposedPorts,
  getDuplicatePortIndices,
} from "./serviceIcons";

const REPOSITORY_TYPES = ["bitbucket-repository", "github-repository"];

const EMPTY_FORM = {
  name: "",
  description: "",
  enabled: false,
  repository: "",
  template: "minimal",
  dockerImageFromBranch: "",
  services: TEMPLATE_DEFAULT_SERVICES.minimal,
  skills: [],
  limits: { memoryMb: 0, cpuQuota: 0, pidsLimit: 0 },
};

function formFromAgent(agent) {
  return {
    name: agent.name || "",
    description: agent.description || "",
    enabled: Boolean(agent.enabled),
    repository: agent.repository ? String(agent.repository) : "",
    template: agent.template ?? "",
    dockerImageFromBranch: agent.dockerImageFromBranch || "",
    services: (agent.services || []).map((s) => ({
      label: s.label,
      icon: s.icon || "Widgets",
      internalPort: s.internalPort,
    })),
    skills: agent.skills || [],
    limits: {
      memoryMb: agent.limits?.memoryMb || 0,
      cpuQuota: agent.limits?.cpuQuota || 0,
      pidsLimit: agent.limits?.pidsLimit || 0,
    },
  };
}

const labelSx = { color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" };

function LimitField({ label, value, onChange, presets, max, format }) {
  return (
    <FormControl>
      <FormLabel sx={labelSx}>{label}</FormLabel>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
        <Input
          size="sm"
          type="number"
          value={value || 0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          placeholder="0 = no limit"
          slotProps={{ input: { min: 0, max } }}
          sx={{ width: 120, fontFamily: "monospace", bgcolor: "var(--bg-primary)" }}
        />
        <Stack direction="row" spacing={0.5}>
          {presets.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={value === preset ? "solid" : "soft"}
              color={value === preset ? "primary" : "neutral"}
              onClick={() => onChange(preset)}
              sx={{ minWidth: 0, px: 1 }}
            >
              {format(preset)}
            </Button>
          ))}
        </Stack>
      </Stack>
    </FormControl>
  );
}

export default function AgentEditPage() {
  const { t } = useTranslation("Administration");
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();

  const [agent, setAgent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [repositories, setRepositories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingDockerfile, setLoadingDockerfile] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));

  // Repositories available to bind (all imported repositories, every connection)
  useEffect(() => {
    const load = async () => {
      try {
        const subs = await api.getAllAdminSubResources();
        setRepositories((subs || []).filter((s) => REPOSITORY_TYPES.includes(s.type)));
      } catch (err) {
        console.error("Failed to load repositories:", err);
      }
    };
    load();
  }, []);

  // Existing agent (edit) or pre-selected repository (create from repo page)
  useEffect(() => {
    if (isNew) {
      const preselected = searchParams.get("repository");
      if (preselected) patch({ repository: preselected });
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.getAdminAgent(id);
        setAgent(data);
        setForm(formFromAgent(data));
      } catch (err) {
        if (err.response?.status === 404) setNotFound(true);
        else toast.error(t("agents.failedToLoad", { message: err.response?.data?.error || err.message }));
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const selectedRepository = useMemo(
    () => repositories.find((r) => r._id === form.repository) || null,
    [repositories, form.repository],
  );

  // Branches of the selected repository (list endpoint strips them, fetch detail)
  useEffect(() => {
    if (!selectedRepository) {
      setBranches([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const full = await api.getAdminSubResource(
          selectedRepository.resourceId || selectedRepository.resource,
          selectedRepository._id,
        );
        if (!cancelled) setBranches(full?.data?.branches || []);
      } catch (err) {
        if (!cancelled) setBranches([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedRepository]);

  const handleTemplateChange = useCallback(
    async (newTemplate) => {
      if (newTemplate !== "") {
        patch({ template: newTemplate, services: TEMPLATE_DEFAULT_SERVICES[newTemplate] });
        return;
      }
      // Custom template: detect services from the repository's .rearch/Dockerfile
      patch({ template: "" });
      if (!selectedRepository) return;
      setLoadingDockerfile(true);
      try {
        const result = await api.getAdminSubResourceDockerfile(
          selectedRepository.resourceId || selectedRepository.resource,
          selectedRepository._id,
          form.dockerImageFromBranch || undefined,
        );
        const services = parseDockerfileExposedPorts(result.contents || "");
        if (services.length > 0) patch({ services });
        else toast.error(t("agents.noExposeLinesFound"));
      } catch (err) {
        if (err.response?.status === 404) toast.error(t("agents.noDockerfileFound"));
        else toast.error(t("agents.failedToReadDockerfile", { message: err.response?.data?.error || err.message }));
      } finally {
        setLoadingDockerfile(false);
      }
    },
    [selectedRepository, form.dockerImageFromBranch, t, toast],
  );

  const duplicatePorts = getDuplicatePortIndices(form.services).size > 0;
  const invalidService = form.services.some(
    (s) => !s.label || s.internalPort === "" || s.internalPort === null || s.internalPort === undefined,
  );
  const customWithoutRepo = form.template === "" && !form.repository;
  const canSave =
    form.name.trim().length > 0 && !duplicatePorts && !invalidService && !customWithoutRepo && !loadingDockerfile;

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description,
    enabled: form.enabled,
    repository: form.repository || null,
    template: form.template,
    dockerImageFromBranch: form.repository ? form.dockerImageFromBranch : "",
    services: form.services.map((s) => ({
      label: s.label,
      icon: s.icon || "Widgets",
      internalPort: Number(s.internalPort),
    })),
    skills: form.skills,
    limits: form.limits,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.createAgent(buildPayload());
        toast.success(t("agents.saved"));
        navigate(`/administration/agents/${created._id}`, { replace: true });
      } else {
        const updated = await api.updateAgent(id, buildPayload());
        setAgent((prev) => ({ ...prev, ...updated }));
        setForm(formFromAgent(updated));
        toast.success(t("agents.saved"));
      }
    } catch (err) {
      const data = err.response?.data;
      const message = data?.error || data?.errors?.[0]?.message || err.message;
      toast.error(t("agents.failedToSave", { message }));
    } finally {
      setSaving(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const res = await api.rebuildAgentImage(id);
      toast.success(t("agents.dockerBuildStarted", { jobId: res.jobId }));
    } catch (err) {
      toast.error(t("agents.failedToDockerBuild", { message: err.response?.data?.error || err.message }));
    } finally {
      setRebuilding(false);
    }
  };

  const handleCopyStartLink = () => {
    const url = `${window.location.origin}/start#${encodeURIComponent(agent?.name || form.name)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t("agents.startLinkCopied")))
      .catch(() => toast.error(t("agents.failedToCopyLink")));
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: t("agents.deleteConfirmTitle"),
      message: t("agents.deleteConfirmMessage", { name: agent?.name }),
      confirmText: t("agents.delete"),
      confirmColor: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      try {
        await api.deleteAgent(id);
      } catch (err) {
        if (err.response?.status !== 409) throw err;
        const count = err.response.data?.conversationCount || 0;
        const force = await confirm({
          title: t("agents.deleteConfirmTitle"),
          message: t("agents.deleteInUseMessage", { count }),
          confirmText: t("agents.delete"),
          confirmColor: "danger",
        });
        if (!force) return;
        await api.deleteAgent(id, { force: true });
      }
      toast.success(t("agents.deleted"));
      navigate("/administration/agents");
    } catch (err) {
      toast.error(t("agents.failedToDelete", { message: err.response?.data?.error || err.message }));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <Typography level="body-lg">{t("agents.loading")}</Typography>
      </Box>
    );
  }

  if (notFound) {
    return (
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", bgcolor: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <Typography level="body-lg" sx={{ mb: 2 }}>{t("agents.agentNotFound")}</Typography>
        <Button variant="soft" color="neutral" startDecorator={<ArrowBack />} onClick={() => navigate("/administration/agents")}>
          {t("agents.backToAgents")}
        </Button>
      </Box>
    );
  }

  const cardSx = { bgcolor: "var(--bg-secondary)", mb: 3 };

  return (
    <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, bgcolor: "var(--bg-primary)", color: "var(--text-primary)", overflow: "auto" }}>
      <Box sx={{ maxWidth: 900, mx: "auto" }}>
        <Button
          variant="plain"
          size="sm"
          startDecorator={<ArrowBack />}
          onClick={() => navigate("/administration/agents")}
          sx={{ mb: 2, color: "var(--text-secondary)", pl: 0 }}
        >
          {t("agents.backToAgents")}
        </Button>

        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
          <AutoAwesome sx={{ fontSize: 28, color: form.enabled ? "#10a37f" : "var(--text-tertiary)" }} />
          <Typography level="h2" sx={{ color: "var(--text-primary)" }}>
            {isNew ? t("agents.createTitle") : agent?.name}
          </Typography>
          {!isNew && (
            <Chip size="lg" variant="soft" color={agent?.enabled ? "success" : "neutral"}>
              {agent?.enabled ? t("agents.enabled") : t("agents.disabled")}
            </Chip>
          )}
          {!isNew && agent?.conversationCount > 0 && (
            <Chip size="sm" variant="outlined" color="neutral">
              {t("agents.usedBy", { count: agent.conversationCount })}
            </Chip>
          )}
          {!isNew && (
            <Button
              variant="solid"
              color="danger"
              size="sm"
              startDecorator={<DeleteIcon />}
              loading={deleting}
              onClick={handleDelete}
              sx={{ ml: "auto" }}
            >
              {t("agents.delete")}
            </Button>
          )}
        </Box>

        {/* Actions (edit only) */}
        {!isNew && (
          <Card variant="outlined" sx={cardSx}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ flexWrap: "wrap", gap: 1 }}>
                <Typography level="title-md">{t("agents.actions")}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                  <Button variant="soft" color="neutral" startDecorator={<ContentCopy />} onClick={handleCopyStartLink} disabled={!agent?.enabled}>
                    {t("agents.copyStartLink")}
                  </Button>
                  <Button
                    variant="solid"
                    color="warning"
                    startDecorator={rebuilding ? <CircularProgress size="sm" /> : <Build />}
                    loading={rebuilding}
                    onClick={handleRebuild}
                    disabled={!agent?.repository || !agent?.dockerImageFromBranch}
                  >
                    {t("agents.buildDockerImage")}
                  </Button>
                </Stack>
              </Stack>
              {agent?.dockerImage && (
                <Typography level="body-xs" sx={{ mt: 1.5, color: "var(--text-secondary)" }}>
                  {t("agents.dockerImageTag")}:{" "}
                  <Box component="span" sx={{ fontFamily: "monospace", color: "var(--text-primary)" }}>{agent.dockerImage}</Box>
                </Typography>
              )}
            </CardContent>
          </Card>
        )}

        {/* Identity */}
        <Card variant="outlined" sx={cardSx}>
          <CardContent>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel sx={labelSx}>{t("agents.name")}</FormLabel>
                <Input
                  data-testid="agent-name-input"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder={t("agents.namePlaceholder")}
                  sx={{ bgcolor: "var(--bg-primary)" }}
                />
              </FormControl>
              <FormControl>
                <FormLabel sx={labelSx}>{t("agents.descriptionLabel")}</FormLabel>
                <Textarea
                  minRows={2}
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder={t("agents.descriptionPlaceholder")}
                  sx={{ bgcolor: "var(--bg-primary)" }}
                />
              </FormControl>
              <FormControl orientation="horizontal" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <FormLabel sx={{ ...labelSx, mb: 0 }}>{t("agents.enableAgent")}</FormLabel>
                  <Typography level="body-xs" sx={{ color: "var(--text-secondary)" }}>
                    {t("agents.enableAgentDescription")}
                  </Typography>
                </Box>
                <Switch
                  data-testid="agent-enable-switch"
                  checked={form.enabled}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                  color={form.enabled ? "success" : "neutral"}
                />
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        {/* Resources */}
        <Card variant="outlined" sx={cardSx}>
          <CardContent>
            <Typography level="title-md" sx={{ mb: 2 }}>{t("agents.resourcesSection")}</Typography>
            <FormControl>
              <FormLabel sx={labelSx}>{t("agents.repositoryLabel")}</FormLabel>
              <Typography level="body-xs" sx={{ mb: 1, color: "var(--text-secondary)" }}>
                {t("agents.repositoryDescription")}
              </Typography>
              <Select
                data-testid="agent-repository-select"
                value={form.repository}
                onChange={(_, value) =>
                  patch({
                    repository: value || "",
                    dockerImageFromBranch: "",
                    ...(value === "" && form.template === "" ? { template: "minimal", services: TEMPLATE_DEFAULT_SERVICES.minimal } : {}),
                  })
                }
                placeholder={t("agents.selectRepository")}
                sx={{ bgcolor: "var(--bg-primary)" }}
              >
                <Option value="">{t("agents.noRepositoryOption")}</Option>
                {repositories.map((r) => (
                  <Option key={r._id} value={r._id} label={r.name}>
                    {r.name}
                    <Typography level="body-xs" sx={{ ml: 1, color: "var(--text-tertiary)" }}>
                      {r.resourceName}
                    </Typography>
                  </Option>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </Card>

        {/* Container */}
        <Card variant="outlined" sx={cardSx}>
          <CardContent>
            <Typography level="title-md" sx={{ mb: 2 }}>{t("agents.containerSection")}</Typography>
            <Stack spacing={2.5}>
              <Box>
                <FormLabel sx={{ ...labelSx, mb: 1 }}>{t("agents.templateLabel")}</FormLabel>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
                  {TEMPLATE_OPTIONS.map((opt) => {
                    const selected = form.template === opt.value;
                    const disabled = opt.requiresRepository && !form.repository;
                    return (
                      <Card
                        key={opt.value}
                        data-testid={`agent-template-${opt.value || "custom"}`}
                        variant={selected ? "solid" : "outlined"}
                        color={selected ? "primary" : "neutral"}
                        onClick={() => !disabled && !loadingDockerfile && handleTemplateChange(opt.value)}
                        sx={{
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.5 : 1,
                          transition: "all 0.15s ease",
                          borderWidth: 2,
                          borderColor: selected ? "var(--joy-palette-primary-500)" : "var(--joy-palette-neutral-outlinedBorder)",
                          "&:hover": disabled ? {} : { borderColor: "var(--joy-palette-primary-400)", bgcolor: selected ? undefined : "var(--joy-palette-primary-50)" },
                        }}
                      >
                        <CardContent sx={{ p: 1.5 }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography level="title-sm" sx={{ color: selected ? "#fff" : "var(--text-primary)" }}>{opt.label}</Typography>
                            {selected && <Check sx={{ fontSize: 16, color: "#fff" }} />}
                          </Stack>
                          <Typography level="body-xs" sx={{ color: selected ? "rgba(255,255,255,0.8)" : "var(--text-secondary)" }}>
                            {opt.description}
                          </Typography>
                        </CardContent>
                      </Card>
                    );
                  })}
                  <Card
                    variant="outlined"
                    color="neutral"
                    component="a"
                    href="https://rearch.engineer/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ cursor: "pointer", borderWidth: 2, borderStyle: "dashed", textDecoration: "none", "&:hover": { borderColor: "var(--joy-palette-primary-400)" } }}
                  >
                    <CardContent sx={{ p: 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                      <HelpOutline sx={{ fontSize: 24, color: "var(--text-secondary)", mb: 0.5 }} />
                      <Typography level="title-sm" sx={{ color: "var(--text-primary)" }}>{t("agents.helpGuide")}</Typography>
                      <Typography level="body-xs" sx={{ color: "var(--text-secondary)" }}>{t("agents.helpGuideDescription")}</Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Typography level="body-xs" sx={{ mt: 1, color: customWithoutRepo ? "var(--joy-palette-danger-500)" : "var(--text-secondary)" }}>
                  {customWithoutRepo
                    ? t("agents.templateCustomNeedsRepo")
                    : form.template
                      ? t("agents.templateBuiltIn")
                      : loadingDockerfile
                        ? t("agents.templateLoadingDockerfile")
                        : t("agents.templateCustom")}
                </Typography>
              </Box>

              {form.repository && (
                <FormControl>
                  <FormLabel sx={labelSx}>{t("agents.dockerImageFromBranch")}</FormLabel>
                  <Typography level="body-xs" sx={{ mb: 1, color: "var(--text-secondary)" }}>
                    {t("agents.dockerImageFromBranchDescription")}
                  </Typography>
                  <Select
                    value={form.dockerImageFromBranch}
                    onChange={(_, value) => patch({ dockerImageFromBranch: value || "" })}
                    placeholder={branches.length ? t("agents.selectBranch") : t("agents.noBranchesLoaded")}
                    sx={{ bgcolor: "var(--bg-primary)", maxWidth: 360 }}
                  >
                    <Option value="">{t("agents.noBranchOption")}</Option>
                    {branches.map((b) => (
                      <Option key={b.name} value={b.name}>{b.name}</Option>
                    ))}
                  </Select>
                </FormControl>
              )}

              <AgentServicesEditor
                services={form.services}
                onChange={(services) => patch({ services })}
                loading={loadingDockerfile}
              />

              <Box>
                <FormLabel sx={{ ...labelSx, mb: 1 }}>{t("agents.skillsRepositories")}</FormLabel>
                <Typography level="body-xs" sx={{ mb: 1, color: "var(--text-secondary)" }}>
                  {t("agents.skillsRepositoriesDescription")}
                </Typography>
                <Select
                  multiple
                  value={form.skills}
                  onChange={(_, value) => patch({ skills: value || [] })}
                  placeholder={t("agents.selectSkillRepositories")}
                  sx={{ bgcolor: "var(--bg-primary)" }}
                >
                  {repositories.map((r) => (
                    <Option key={r._id} value={r._id}>{r.name}</Option>
                  ))}
                </Select>
              </Box>

              <Box>
                <FormLabel sx={{ ...labelSx, mb: 1 }}>{t("agents.resourceConstraints")}</FormLabel>
                <Typography level="body-xs" sx={{ mb: 1.5, color: "var(--text-secondary)" }}>
                  {t("agents.resourceConstraintsDescription")}
                </Typography>
                <Stack spacing={1.5}>
                  <LimitField
                    label={t("agents.memoryLimit")}
                    value={form.limits.memoryMb}
                    onChange={(v) => patch({ limits: { ...form.limits, memoryMb: v } })}
                    presets={[512, 1024, 2048, 4096]}
                    max={32768}
                    format={(p) => (p >= 1024 ? `${p / 1024}GB` : `${p}MB`)}
                  />
                  <LimitField
                    label={t("agents.cpuLimit")}
                    value={form.limits.cpuQuota}
                    onChange={(v) => patch({ limits: { ...form.limits, cpuQuota: v } })}
                    presets={[50000, 100000, 200000, 400000]}
                    max={800000}
                    format={(p) => `${p / 100000} CPU`}
                  />
                  <LimitField
                    label={t("agents.pidLimit")}
                    value={form.limits.pidsLimit}
                    onChange={(v) => patch({ limits: { ...form.limits, pidsLimit: v } })}
                    presets={[128, 256, 512, 1024]}
                    max={4096}
                    format={(p) => String(p)}
                  />
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mb: 4 }}>
          <Button variant="plain" color="neutral" onClick={() => navigate("/administration/agents")} disabled={saving}>
            {t("agents.cancel")}
          </Button>
          <Button
            data-testid="agent-save-btn"
            variant="solid"
            color="primary"
            startDecorator={<Check />}
            onClick={handleSave}
            loading={saving}
            disabled={!canSave}
          >
            {isNew ? t("agents.create") : t("agents.save")}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
