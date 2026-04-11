import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Card,
  CardContent,
  Link,
  IconButton,
  Select,
  Option,
  FormControl,
  FormLabel,
  Tooltip,
  Switch,
} from "@mui/joy";
import {
  Sync,
  Code,
  AccountTree,
  OpenInNew,
  Edit,
  Check,
  Close,
  Inventory2,
  Build,
  Add,
  Delete as DeleteIcon,
  HelpOutline,
  ContentCopy,
  // Service icons (keep in sync with AVAILABLE_ICONS below and SessionSidebar.jsx)
  CodeOutlined,
  WebOutlined,
  StorageOutlined,
  WidgetsOutlined,
  SmartToyOutlined,
  BrushOutlined,
  ApiOutlined,
  TerminalOutlined,
} from "@mui/icons-material";
import Input from "@mui/joy/Input";
import CircularProgress from "@mui/joy/CircularProgress";
import { api } from "../../../../api/client";
import { useToast } from "../../../../contexts/ToastContext";

function BitbucketRepositoryDetails({
  subResource,
  onUpdate,
  onDelete,
  deleting = false,
  deleteError = null,
}) {
  const { data, rearch } = subResource;
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [isEditingRearch, setIsEditingRearch] = useState(false);
  const [editedRearch, setEditedRearch] = useState({
    enabled: rearch?.enabled ?? false,
    template: rearch?.template || "",
    dockerImageFromBranch: rearch?.dockerImageFromBranch || "",
    services: rearch?.services || [],
    skills: rearch?.skills || [],
    resources: rearch?.resources || { memoryMb: 0, cpuQuota: 0, pidsLimit: 0 },
  });
  const [savingRearch, setSavingRearch] = useState(false);
  const [loadingDockerfile, setLoadingDockerfile] = useState(false);
  // Repository sub-resources for the skills multi-select
  const [repositorySubResources, setRepositorySubResources] = useState([]);
  // Index of the service row whose icon picker is open, or null
  const [iconPickerOpenIndex, setIconPickerOpenIndex] = useState(null);
  const iconPickerRef = useRef(null);

  useEffect(() => {
    if (iconPickerOpenIndex === null) return;
    const handleClickOutside = (e) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target)) {
        setIconPickerOpenIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [iconPickerOpenIndex]);

  useEffect(() => {
    const loadRepositorySubResources = async () => {
      try {
        const subResources = await api.getAllSubResources("bitbucket-repository");
        setRepositorySubResources(subResources);
      } catch (err) {
        console.error("Failed to load repository subresources:", err);
      }
    };
    loadRepositorySubResources();
  }, []);

  const TEMPLATE_OPTIONS = [
    {
      value: "",
      label: "Custom (.rearch in repo)",
      description: "Use the repository's own .rearch/ folder",
    },
    {
      value: "minimal",
      label: "Minimal",
      description: "VS Code + OpenCode only",
    },
    {
      value: "node",
      label: "Node.js",
      description: "VS Code + OpenCode + Node.js runtime + dev server",
    },
    {
      value: "node-browser",
      label: "Node.js + Browser",
      description: "VS Code + OpenCode + Node.js",
    },
    {
      value: "node-react-pg",
      label: "Node.js + React + PostgreSQL database",
      description: "VS Code + OpenCode + Node.js & PostgreSQL db",
    },
  ];

  /**
   * All icons available for service entries.
   * The `id` must match a key in SessionSidebar's ICON_MAP.
   * Add entries here to expose new icons across the whole app.
   */
  const AVAILABLE_ICONS = [
    { id: "Code", label: "Code", Component: CodeOutlined },
    { id: "Web", label: "Web", Component: WebOutlined },
    { id: "Storage", label: "Storage", Component: StorageOutlined },
    { id: "Api", label: "API", Component: ApiOutlined },
    { id: "AI", label: "AI", Component: SmartToyOutlined },
    { id: "Design", label: "Design", Component: BrushOutlined },
    { id: "Terminal", label: "Terminal", Component: TerminalOutlined },
    { id: "Widgets", label: "Other", Component: WidgetsOutlined },
  ];

  const iconComponent = (iconId, sx = {}) => {
    const found = AVAILABLE_ICONS.find((i) => i.id === iconId);
    const Comp = found ? found.Component : WidgetsOutlined;
    return <Comp sx={{ fontSize: 18, ...sx }} />;
  };

  /**
   * Quick-add presets. Each entry includes a suggested icon.
   * Modify here to add/rename built-in service shortcuts.
   */
  const SERVICE_PRESETS = [
    { label: "Code", icon: "Code", internalPort: 8080 },
    { label: "Frontend", icon: "Web", internalPort: 5173 },
    { label: "Backend", icon: "Storage", internalPort: 3000 },
    { label: "Custom", icon: "Widgets", internalPort: "" },
  ];

  /**
   * Maps each template value to a default set of container services (with icons).
   * '' (empty string) represents "Custom" — services are derived from the Dockerfile.
   */
  const TEMPLATE_DEFAULT_SERVICES = {
    "": null,
    minimal: [{ label: "Code", icon: "Code", internalPort: 8080 }],
    node: [
      { label: "Code", icon: "Code", internalPort: 8080 },
      { label: "Backend", icon: "Storage", internalPort: 3000 },
    ],
    "node-browser": [
      { label: "Code", icon: "Code", internalPort: 8080 },
      { label: "Backend", icon: "Storage", internalPort: 3000 },
    ],
    "node-react-pg": [
      { label: "Code", icon: "Code", internalPort: 8080 },
      { label: "Backend", icon: "Storage", internalPort: 3000 },
      { label: "Frontend", icon: "Web", internalPort: 4200 },
      { label: "Database", icon: "Storage", internalPort: 8081 },
    ],
  };

  const handleAddService = (preset) => {
    const { internalPort } = preset;
    if (
      internalPort !== "" &&
      editedRearch.services.some((s) => s.internalPort === internalPort)
    ) {
      toast.error(`Port ${internalPort} is already in use by another service.`);
      return;
    }
    setEditedRearch((prev) => ({
      ...prev,
      services: [
        ...prev.services,
        { label: preset.label, icon: preset.icon, internalPort },
      ],
    }));
  };

  const handleServiceLabelChange = (index, value) => {
    setEditedRearch((prev) => ({
      ...prev,
      services: prev.services.map((s, i) =>
        i === index ? { ...s, label: value } : s,
      ),
    }));
  };

  const handleServiceIconChange = (index, iconId) => {
    setEditedRearch((prev) => ({
      ...prev,
      services: prev.services.map((s, i) =>
        i === index ? { ...s, icon: iconId } : s,
      ),
    }));
  };

  const handleRemoveService = (index) => {
    setEditedRearch((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }));
  };

  const handleServicePortChange = (index, value) => {
    setEditedRearch((prev) => ({
      ...prev,
      services: prev.services.map((s, i) =>
        i === index
          ? { ...s, internalPort: value === "" ? "" : Number(value) }
          : s,
      ),
    }));
  };

  /**
   * Well-known port mappings used when parsing EXPOSE lines from a Custom Dockerfile.
   * Each entry: { label, icon } — both shown in the UI and persisted.
   * Set to null to silently discard a port (e.g. internal tooling ports).
   * Add or edit entries here to customise guessing behaviour and icon suggestions.
   */
  const PORT_SERVICE_MAP = {
    8080: { label: "Code", icon: "Code" },
    5173: { label: "Frontend", icon: "Web" },
    3000: { label: "Backend", icon: "Storage" },
    3001: { label: "Backend", icon: "Storage" },
    4096: null, // discard — internal tooling (opencode) port, not user-facing
  };

  /**
   * Parse EXPOSE instructions from a raw Dockerfile string.
   * Handles both single-port (EXPOSE 8080) and multi-port (EXPOSE 8080 3000) forms,
   * as well as protocol suffixes (e.g. 8080/tcp).
   * Known ports are labelled and given icons via PORT_SERVICE_MAP; null entries are
   * silently dropped. Unknown ports fall back to label "Port <n>" / icon "Widgets".
   */
  const parseDockerfileExposedPorts = (dockerfileContent) => {
    const seen = new Set();
    const services = [];
    for (const line of dockerfileContent.split("\n")) {
      const match = line.trim().match(/^EXPOSE\s+(.+)/i);
      if (!match) continue;
      for (const token of match[1].split(/\s+/)) {
        const port = parseInt(token.split("/")[0], 10);
        if (isNaN(port) || seen.has(port)) continue;
        seen.add(port);
        if (Object.prototype.hasOwnProperty.call(PORT_SERVICE_MAP, port)) {
          const mapping = PORT_SERVICE_MAP[port];
          if (mapping !== null) {
            services.push({
              label: mapping.label,
              icon: mapping.icon,
              internalPort: port,
            });
          }
          // null → discard silently
        } else {
          services.push({
            label: `Port ${port}`,
            icon: "Widgets",
            internalPort: port,
          });
        }
      }
    }
    return services;
  };

  /**
   * Handle template selection changes.
   * For non-Custom templates the services are set from TEMPLATE_DEFAULT_SERVICES.
   * For Custom ('') the .rearch/Dockerfile is fetched from Bitbucket and its
   * EXPOSE lines are parsed to determine services.
   */
  const handleTemplateChange = useCallback(
    async (newTemplate) => {
      setEditedRearch((prev) => ({ ...prev, template: newTemplate }));

      const defaultServices = TEMPLATE_DEFAULT_SERVICES[newTemplate];

      if (newTemplate !== "") {
        // Non-custom template: use the static mapping
        setEditedRearch((prev) => ({
          ...prev,
          template: newTemplate,
          services: defaultServices,
        }));
        return;
      }

      // Custom template: try to fetch and parse the Dockerfile
      setLoadingDockerfile(true);
      try {
        const branch = editedRearch.dockerImageFromBranch || undefined;
        const result = await api.getSubResourceDockerfile(
          subResource.resource,
          subResource._id,
          branch,
        );
        const services = parseDockerfileExposedPorts(result.contents || "");
        setEditedRearch((prev) => ({
          ...prev,
          template: newTemplate,
          services: services.length > 0 ? services : prev.services,
        }));
        if (services.length === 0) {
          toast.error(
            "No EXPOSE lines found in .rearch/Dockerfile. Services were not changed.",
          );
        }
      } catch (err) {
        const is404 = err.response?.status === 404;
        if (is404) {
          toast.error(
            "No .rearch/Dockerfile found in the repository. Services were not changed.",
          );
        } else {
          toast.error(
            `Failed to read Dockerfile: ${err.response?.data?.error || err.message}`,
          );
        }
        // Keep existing services on error
        setEditedRearch((prev) => ({ ...prev, template: newTemplate }));
      } finally {
        setLoadingDockerfile(false);
      }
    },
    [editedRearch.dockerImageFromBranch, subResource.resource, subResource._id],
  );

  const getDuplicatePortIndices = (services) => {
    const portMap = {};
    const duplicates = new Set();
    services.forEach((s, i) => {
      const port = s.internalPort;
      if (port === "" || port === undefined || port === null) return;
      if (portMap[port] !== undefined) {
        duplicates.add(portMap[port]);
        duplicates.add(i);
      } else {
        portMap[port] = i;
      }
    });
    return duplicates;
  };

  const duplicatePortIndices = getDuplicatePortIndices(editedRearch.services);
  const hasDuplicatePorts = duplicatePortIndices.size > 0;

  const handleSync = async () => {
    setSyncing(true);

    try {
      const response = await api.executeSubResourceAction(
        subResource.resource,
        subResource._id,
        "sync",
      );

      toast.success(
        `Sync process started successfully! Job ID: ${response.jobId}`,
      );
    } catch (error) {
      toast.error(
        `Failed to start Sync process: ${error.response?.data?.error || error.message}`,
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);

    try {
      const response = await api.executeSubResourceAction(
        subResource.resource,
        subResource._id,
        "rebuild",
      );

      toast.success(
        `Docker build started successfully! Job ID: ${response.jobId}`,
      );
    } catch (error) {
      toast.error(
        `Failed to start Docker build: ${error.response?.data?.error || error.message}`,
      );
    } finally {
      setRebuilding(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = window.confirm(
      "Delete this subresource? This action cannot be undone.",
    );
    if (!confirmed) return;
    await onDelete();
  };

  const handleSaveRearch = async () => {
    setSavingRearch(true);
    try {
      const updatedSubResource = await api.updateSubResource(
        subResource.resource,
        subResource._id,
        { rearch: { ...rearch, ...editedRearch } },
      );
      setIsEditingRearch(false);
      if (onUpdate) {
        onUpdate(updatedSubResource);
      }
    } catch (error) {
      toast.error(
        `Failed to save ReArch settings: ${error.response?.data?.error || error.message}`,
      );
    } finally {
      setSavingRearch(false);
    }
  };

  const handleCancelEditRearch = () => {
    setEditedRearch({
      enabled: rearch?.enabled ?? false,
      template: rearch?.template || "",
      dockerImageFromBranch: rearch?.dockerImageFromBranch || "",
      services: rearch?.services || [],
      skills: rearch?.skills || [],
      resources: rearch?.resources || { memoryMb: 0, cpuQuota: 0, pidsLimit: 0 },
    });
    setIsEditingRearch(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  const formatSize = (bytes) => {
    if (!bytes) return "N/A";
    const units = ["B", "KB", "MB", "GB"];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  return (
    <Box sx={{ maxWidth: 900, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography level="h2" sx={{ color: "var(--text-primary)" }}>
          {subResource.name}
        </Typography>
        {data?.links?.html && (
          <IconButton
            size="sm"
            variant="plain"
            color="neutral"
            component="a"
            href={data.links.html}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Bitbucket"
          >
            <OpenInNew />
          </IconButton>
        )}
        <Chip color="success" variant="soft" size="lg">
          Bitbucket Repository
        </Chip>
        {data?.isPrivate && (
          <Chip color="warning" variant="soft" size="sm">
            Private
          </Chip>
        )}
        <Button
          variant="solid"
          color="danger"
          size="sm"
          startDecorator={<DeleteIcon />}
          loading={deleting}
          onClick={handleDelete}
          sx={{ ml: "auto" }}
        >
          Delete
        </Button>
      </Box>

      {/* Actions Card */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent="space-between"
            sx={{ width: "100%" }}
          >
            <Typography level="title-md" sx={{ color: "var(--text-primary)" }}>
              Actions
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="solid"
                color="primary"
                startDecorator={
                  syncing ? <CircularProgress size="sm" /> : <Sync />
                }
                loading={syncing}
                onClick={handleSync}
              >
                Sync
              </Button>
              {rearch?.enabled && (
                <Button
                  variant="soft"
                  color="neutral"
                  startDecorator={<ContentCopy />}
                  onClick={() => {
                    const url = `${window.location.origin}/start#${encodeURIComponent(subResource.name)}`;
                    navigator.clipboard
                      .writeText(url)
                      .then(() => {
                        toast.success("Start link copied to clipboard");
                      })
                      .catch(() => {
                        toast.error("Failed to copy link");
                      });
                  }}
                >
                  Copy Start Link
                </Button>
              )}
              {rearch?.dockerImageFromBranch && (
                <Button
                  variant="solid"
                  color="warning"
                  startDecorator={
                    rebuilding ? <CircularProgress size="sm" /> : <Build />
                  }
                  loading={rebuilding}
                  onClick={handleRebuild}
                  disabled={!rearch?.enabled}
                >
                  Build Docker Image
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* ReArch Settings Card */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Inventory2 sx={{ color: "var(--text-secondary)" }} />
              <Typography
                level="title-md"
                sx={{ color: "var(--text-primary)" }}
              >
                ReArch Settings
              </Typography>
            </Stack>
            {!isEditingRearch && (
              <IconButton
                data-testid="rearch-edit-btn"
                size="sm"
                variant="plain"
                color="neutral"
                onClick={() => setIsEditingRearch(true)}
              >
                <Edit />
              </IconButton>
            )}
          </Stack>
          {isEditingRearch ? (
            <Stack spacing={2}>
              <FormControl
                orientation="horizontal"
                sx={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <Box>
                  <FormLabel sx={{ mb: 0 }}>Enable ReArch</FormLabel>
                  <Typography
                    level="body-xs"
                    sx={{ color: "var(--text-secondary)" }}
                  >
                    Allow this repository to be used as a ReArch environment
                  </Typography>
                </Box>
                <Switch
                  data-testid="rearch-enable-switch"
                  checked={editedRearch.enabled}
                  onChange={(e) =>
                    setEditedRearch((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                  color={editedRearch.enabled ? "success" : "neutral"}
                />
              </FormControl>
              <Box>
                <FormLabel sx={{ mb: 1 }}>Template</FormLabel>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                      md: "repeat(3, 1fr)",
                    },
                    gap: 1.5,
                  }}
                >
                  {TEMPLATE_OPTIONS.map((opt) => (
                    <Card
                      key={opt.value}
                      variant={
                        editedRearch.template === opt.value
                          ? "solid"
                          : "outlined"
                      }
                      color={
                        editedRearch.template === opt.value
                          ? "primary"
                          : "neutral"
                      }
                      onClick={() =>
                        !loadingDockerfile && handleTemplateChange(opt.value)
                      }
                      sx={{
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        borderWidth: 2,
                        borderColor:
                          editedRearch.template === opt.value
                            ? "var(--joy-palette-primary-500)"
                            : "var(--joy-palette-neutral-outlinedBorder)",
                        "&:hover": {
                          borderColor: "var(--joy-palette-primary-400)",
                          bgcolor:
                            editedRearch.template === opt.value
                              ? undefined
                              : "var(--joy-palette-primary-50)",
                        },
                      }}
                    >
                      <CardContent sx={{ p: 1.5 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          sx={{ mb: 0.5 }}
                        >
                          <Typography
                            level="title-sm"
                            sx={{
                              color:
                                editedRearch.template === opt.value
                                  ? "#fff"
                                  : "var(--text-primary)",
                            }}
                          >
                            {opt.label}
                          </Typography>
                          {editedRearch.template === opt.value && (
                            <Check sx={{ fontSize: 16, color: "#fff" }} />
                          )}
                        </Stack>
                        <Typography
                          level="body-xs"
                          sx={{
                            color:
                              editedRearch.template === opt.value
                                ? "rgba(255,255,255,0.8)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {opt.description}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                  <Card
                    variant="outlined"
                    color="neutral"
                    component="a"
                    href="https://rearch.engineer/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      borderWidth: 2,
                      borderStyle: "dashed",
                      borderColor: "var(--joy-palette-neutral-outlinedBorder)",
                      textDecoration: "none",
                      "&:hover": {
                        borderColor: "var(--joy-palette-primary-400)",
                        bgcolor: "var(--joy-palette-primary-50)",
                      },
                    }}
                  >
                    <CardContent
                      sx={{
                        p: 1.5,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                      }}
                    >
                      <HelpOutline
                        sx={{
                          fontSize: 24,
                          color: "var(--text-secondary)",
                          mb: 0.5,
                        }}
                      />
                      <Typography
                        level="title-sm"
                        sx={{ color: "var(--text-primary)" }}
                      >
                        Help Guide
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "var(--text-secondary)" }}
                      >
                        Not sure which to pick? Read the docs
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>
                <Typography
                  level="body-xs"
                  sx={{ mt: 1, color: "var(--text-secondary)" }}
                >
                  {editedRearch.template
                    ? "A built-in Dockerfile will be used. The repository does not need a .rearch/ folder."
                    : loadingDockerfile
                      ? "Reading .rearch/Dockerfile to detect exposed ports…"
                      : "The repository must contain a .rearch/ folder with a Dockerfile."}
                </Typography>
              </Box>
              <FormControl>
                <FormLabel>Docker Image from Branch</FormLabel>
                <Select
                  value={editedRearch.dockerImageFromBranch}
                  onChange={(e, newValue) =>
                    setEditedRearch((prev) => ({
                      ...prev,
                      dockerImageFromBranch: newValue || "",
                    }))
                  }
                  placeholder="Select a branch"
                  sx={{ bgcolor: "var(--bg-primary)" }}
                >
                  {data?.branches?.map((branch) => (
                    <Option key={branch.name} value={branch.name}>
                      {branch.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              {/* Services editor */}
              <Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <FormLabel sx={{ mb: 0 }}>Container Services</FormLabel>
                  {loadingDockerfile && <CircularProgress size="sm" />}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                  {SERVICE_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant="soft"
                      color="primary"
                      startDecorator={<Add />}
                      onClick={() => handleAddService(preset)}
                      disabled={loadingDockerfile}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </Stack>
                {editedRearch.services.length === 0 ? (
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-secondary)" }}
                  >
                    No services configured. Click a button above to add one.
                  </Typography>
                ) : (
                  <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
                    {editedRearch.services.map((service, index) => {
                      const isDuplicate = duplicatePortIndices.has(index);
                      const pickerOpen = iconPickerOpenIndex === index;
                      return (
                        <Box
                          key={index}
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "auto 140px 90px auto",
                            gap: 1,
                            alignItems: "center",
                          }}
                        >
                          {/* Icon trigger button */}
                          <Box
                            sx={{ position: "relative" }}
                            ref={pickerOpen ? iconPickerRef : null}
                          >
                            <Tooltip title="Choose icon" placement="top">
                              <IconButton
                                size="sm"
                                variant="soft"
                                color="primary"
                                onClick={() =>
                                  setIconPickerOpenIndex(
                                    pickerOpen ? null : index,
                                  )
                                }
                                sx={{ width: 34, height: 34 }}
                              >
                                {iconComponent(service.icon)}
                              </IconButton>
                            </Tooltip>

                            {/* Popover grid */}
                            {pickerOpen && (
                              <Box
                                sx={{
                                  position: "absolute",
                                  top: "calc(100% + 6px)",
                                  left: 0,
                                  zIndex: 1400,
                                  bgcolor: "var(--bg-secondary)",
                                  border:
                                    "1px solid var(--joy-palette-neutral-outlinedBorder)",
                                  borderRadius: "10px",
                                  boxShadow: "var(--joy-shadow-md)",
                                  p: 1,
                                  display: "grid",
                                  gridTemplateColumns: "repeat(4, 1fr)",
                                  gap: 0.5,
                                  width: 192,
                                }}
                              >
                                {AVAILABLE_ICONS.map(
                                  ({ id, label: iconLabel, Component }) => (
                                    <Tooltip
                                      key={id}
                                      title={iconLabel}
                                      placement="top"
                                    >
                                      <IconButton
                                        size="sm"
                                        variant={
                                          service.icon === id
                                            ? "solid"
                                            : "plain"
                                        }
                                        color={
                                          service.icon === id
                                            ? "primary"
                                            : "neutral"
                                        }
                                        onClick={() => {
                                          handleServiceIconChange(index, id);
                                          setIconPickerOpenIndex(null);
                                        }}
                                        sx={{
                                          flexDirection: "column",
                                          gap: 0.25,
                                          height: 44,
                                          borderRadius: "8px",
                                        }}
                                      >
                                        <Component sx={{ fontSize: 18 }} />
                                        <Typography
                                          level="body-xs"
                                          sx={{
                                            fontSize: "0.6rem",
                                            lineHeight: 1,
                                          }}
                                        >
                                          {iconLabel}
                                        </Typography>
                                      </IconButton>
                                    </Tooltip>
                                  ),
                                )}
                              </Box>
                            )}
                          </Box>

                          {/* Label */}
                          <Input
                            size="sm"
                            value={service.label}
                            onChange={(e) =>
                              handleServiceLabelChange(index, e.target.value)
                            }
                            placeholder="Label"
                            sx={{ bgcolor: "var(--bg-primary)" }}
                          />

                          {/* Port */}
                          <Input
                            size="sm"
                            type="number"
                            value={service.internalPort}
                            onChange={(e) =>
                              handleServicePortChange(index, e.target.value)
                            }
                            placeholder="Port"
                            color={isDuplicate ? "danger" : undefined}
                            error={isDuplicate}
                            sx={{
                              bgcolor: "var(--bg-primary)",
                              fontFamily: "monospace",
                            }}
                            endDecorator={
                              isDuplicate ? (
                                <Typography
                                  level="body-xs"
                                  color="danger"
                                  sx={{ whiteSpace: "nowrap" }}
                                >
                                  dupe
                                </Typography>
                              ) : null
                            }
                          />

                          {/* Remove */}
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleRemoveService(index)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              {/* Skills multi-select */}
              <Box>
                <FormLabel sx={{ mb: 1 }}>Skills Repositories</FormLabel>
                <Typography
                  level="body-xs"
                  sx={{ mb: 1, color: "var(--text-secondary)" }}
                >
                  Select repositories containing skills specific to this
                  repository. These are cloned alongside default skills when a
                  conversation starts.
                </Typography>
                <Select
                  multiple
                  value={editedRearch.skills}
                  onChange={(_, newValue) =>
                    setEditedRearch((prev) => ({
                      ...prev,
                      skills: newValue || [],
                    }))
                  }
                  placeholder="Select skill repositories"
                  sx={{ bgcolor: "var(--bg-primary)" }}
                >
                  {repositorySubResources.map((r) => (
                    <Option key={r._id} value={r._id}>
                      {r.name}
                    </Option>
                  ))}
                </Select>
              </Box>

              {/* Resource Constraints */}
              <Box>
                <FormLabel sx={{ mb: 1 }}>Resource Constraints</FormLabel>
                <Typography
                  level="body-xs"
                  sx={{ mb: 1.5, color: "var(--text-secondary)" }}
                >
                  Set Docker resource limits for containers created from this
                  repository. Leave at 0 for no limit.
                </Typography>
                <Stack spacing={1.5}>
                  <FormControl>
                    <FormLabel>Memory Limit (MB)</FormLabel>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Input
                        size="sm"
                        type="number"
                        value={editedRearch.resources?.memoryMb || 0}
                        onChange={(e) =>
                          setEditedRearch((prev) => ({
                            ...prev,
                            resources: {
                              ...prev.resources,
                              memoryMb: e.target.value === "" ? 0 : Number(e.target.value),
                            },
                          }))
                        }
                        placeholder="0 = no limit"
                        slotProps={{ input: { min: 0, max: 32768 } }}
                        sx={{ width: 120, fontFamily: "monospace", bgcolor: "var(--bg-primary)" }}
                      />
                      <Stack direction="row" spacing={0.5}>
                        {[512, 1024, 2048, 4096].map((preset) => (
                          <Button
                            key={preset}
                            size="sm"
                            variant={editedRearch.resources?.memoryMb === preset ? "solid" : "soft"}
                            color={editedRearch.resources?.memoryMb === preset ? "primary" : "neutral"}
                            onClick={() =>
                              setEditedRearch((prev) => ({
                                ...prev,
                                resources: { ...prev.resources, memoryMb: preset },
                              }))
                            }
                            sx={{ minWidth: 0, px: 1 }}
                          >
                            {preset >= 1024 ? `${preset / 1024}GB` : `${preset}MB`}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  </FormControl>
                  <FormControl>
                    <FormLabel>CPU Limit (quota units, 100000 = 1 CPU)</FormLabel>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Input
                        size="sm"
                        type="number"
                        value={editedRearch.resources?.cpuQuota || 0}
                        onChange={(e) =>
                          setEditedRearch((prev) => ({
                            ...prev,
                            resources: {
                              ...prev.resources,
                              cpuQuota: e.target.value === "" ? 0 : Number(e.target.value),
                            },
                          }))
                        }
                        placeholder="0 = no limit"
                        slotProps={{ input: { min: 0, max: 800000 } }}
                        sx={{ width: 120, fontFamily: "monospace", bgcolor: "var(--bg-primary)" }}
                      />
                      <Stack direction="row" spacing={0.5}>
                        {[
                          { label: "0.5 CPU", value: 50000 },
                          { label: "1 CPU", value: 100000 },
                          { label: "2 CPU", value: 200000 },
                          { label: "4 CPU", value: 400000 },
                        ].map((preset) => (
                          <Button
                            key={preset.value}
                            size="sm"
                            variant={editedRearch.resources?.cpuQuota === preset.value ? "solid" : "soft"}
                            color={editedRearch.resources?.cpuQuota === preset.value ? "primary" : "neutral"}
                            onClick={() =>
                              setEditedRearch((prev) => ({
                                ...prev,
                                resources: { ...prev.resources, cpuQuota: preset.value },
                              }))
                            }
                            sx={{ minWidth: 0, px: 1 }}
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  </FormControl>
                  <FormControl>
                    <FormLabel>PID Limit (max processes)</FormLabel>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Input
                        size="sm"
                        type="number"
                        value={editedRearch.resources?.pidsLimit || 0}
                        onChange={(e) =>
                          setEditedRearch((prev) => ({
                            ...prev,
                            resources: {
                              ...prev.resources,
                              pidsLimit: e.target.value === "" ? 0 : Number(e.target.value),
                            },
                          }))
                        }
                        placeholder="0 = no limit"
                        slotProps={{ input: { min: 0, max: 4096 } }}
                        sx={{ width: 120, fontFamily: "monospace", bgcolor: "var(--bg-primary)" }}
                      />
                      <Stack direction="row" spacing={0.5}>
                        {[128, 256, 512, 1024].map((preset) => (
                          <Button
                            key={preset}
                            size="sm"
                            variant={editedRearch.resources?.pidsLimit === preset ? "solid" : "soft"}
                            color={editedRearch.resources?.pidsLimit === preset ? "primary" : "neutral"}
                            onClick={() =>
                              setEditedRearch((prev) => ({
                                ...prev,
                                resources: { ...prev.resources, pidsLimit: preset },
                              }))
                            }
                            sx={{ minWidth: 0, px: 1 }}
                          >
                            {preset}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  </FormControl>
                </Stack>
              </Box>

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  startDecorator={<Close />}
                  onClick={handleCancelEditRearch}
                  disabled={savingRearch}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="rearch-save-btn"
                  size="sm"
                  variant="solid"
                  color="primary"
                  startDecorator={<Check />}
                  onClick={handleSaveRearch}
                  loading={savingRearch}
                  disabled={hasDuplicatePorts || loadingDockerfile}
                >
                  Save
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography
                    level="body-sm"
                    fontWeight="bold"
                    sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                  >
                    ReArch Enabled
                  </Typography>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={rearch?.enabled ? "success" : "neutral"}
                  >
                    {rearch?.enabled ? "Enabled" : "Disabled"}
                  </Chip>
                </Box>
              </Box>
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Template
                </Typography>
                {rearch?.template ? (
                  <Chip size="sm" variant="soft" color="success">
                    {TEMPLATE_OPTIONS.find((t) => t.value === rearch.template)
                      ?.label || rearch.template}
                  </Chip>
                ) : (
                  <Typography
                    level="body-md"
                    sx={{ color: "var(--text-secondary)" }}
                  >
                    Custom (.rearch in repo)
                  </Typography>
                )}
              </Box>
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Docker Image from Branch
                </Typography>
                <Typography
                  level="body-md"
                  sx={{
                    color: rearch?.dockerImageFromBranch
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  }}
                >
                  {rearch?.dockerImageFromBranch ||
                    "No branch selected. Click the edit button to select one."}
                </Typography>
              </Box>
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Docker Image Tag
                </Typography>
                <Typography
                  level="body-md"
                  sx={{
                    color: rearch?.dockerImage
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                    fontFamily: rearch?.dockerImage ? "monospace" : "inherit",
                  }}
                >
                  {rearch?.dockerImage || "Auto-generated on build"}
                </Typography>
              </Box>
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Container Services
                </Typography>
                {rearch?.services && rearch.services.length > 0 ? (
                  <Stack spacing={0.5}>
                    {rearch.services.map((service, index) => (
                      <Stack
                        key={index}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                      >
                        {iconComponent(service.icon, {
                          color: "var(--joy-palette-primary-500)",
                        })}
                        <Chip size="sm" variant="soft" color="primary">
                          {service.label}
                        </Chip>
                        <Typography
                          level="body-xs"
                          sx={{
                            fontFamily: "monospace",
                            color: "var(--text-secondary)",
                          }}
                        >
                          :{service.internalPort}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ) : (
                   <Typography
                    level="body-md"
                    sx={{ color: "var(--text-secondary)" }}
                  >
                    No services configured.
                  </Typography>
                )}
              </Box>
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Skills Repositories
                </Typography>
                {rearch?.skills && rearch.skills.length > 0 ? (
                  <Stack spacing={0.5}>
                    {rearch.skills.map((skillId) => {
                      const skillRepo = repositorySubResources.find(
                        (r) => r._id === skillId,
                      );
                      return (
                        <Chip
                          key={skillId}
                          size="sm"
                          variant="soft"
                          color="primary"
                        >
                          {skillRepo ? skillRepo.name : skillId}
                        </Chip>
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography
                    level="body-md"
                    sx={{ color: "var(--text-secondary)" }}
                  >
                    No repo-specific skills configured.
                  </Typography>
                )}
              </Box>
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Resource Constraints
                </Typography>
                {rearch?.resources && (rearch.resources.memoryMb > 0 || rearch.resources.cpuQuota > 0 || rearch.resources.pidsLimit > 0) ? (
                  <Stack spacing={0.5}>
                    {rearch.resources.memoryMb > 0 && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>Memory:</Typography>
                        <Chip size="sm" variant="soft" color="primary">
                          {rearch.resources.memoryMb >= 1024
                            ? `${(rearch.resources.memoryMb / 1024).toFixed(rearch.resources.memoryMb % 1024 === 0 ? 0 : 1)} GB`
                            : `${rearch.resources.memoryMb} MB`}
                        </Chip>
                      </Stack>
                    )}
                    {rearch.resources.cpuQuota > 0 && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>CPU:</Typography>
                        <Chip size="sm" variant="soft" color="primary">
                          {rearch.resources.cpuQuota / 100000} CPU(s)
                        </Chip>
                      </Stack>
                    )}
                    {rearch.resources.pidsLimit > 0 && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>PIDs:</Typography>
                        <Chip size="sm" variant="soft" color="primary">
                          {rearch.resources.pidsLimit}
                        </Chip>
                      </Stack>
                    )}
                  </Stack>
                ) : (
                  <Typography
                    level="body-md"
                    sx={{ color: "var(--text-secondary)" }}
                  >
                    No resource constraints configured (unlimited).
                  </Typography>
                )}
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Repository Details Card */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Typography
            level="title-md"
            sx={{ mb: 2, color: "var(--text-primary)" }}
          >
            Repository Details
          </Typography>
          <Stack spacing={2}>
            {data?.fullName && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Full Name
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {data.fullName}
                </Typography>
              </Box>
            )}
            {data?.description && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Description
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {data.description}
                </Typography>
              </Box>
            )}
            <Stack direction="row" spacing={4}>
              {data?.language && (
                <Box>
                  <Typography
                    level="body-sm"
                    fontWeight="bold"
                    sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                  >
                    Language
                  </Typography>
                  <Chip
                    color="primary"
                    variant="soft"
                    startDecorator={<Code />}
                  >
                    {data.language}
                  </Chip>
                </Box>
              )}
              {data?.mainBranch && (
                <Box>
                  <Typography
                    level="body-sm"
                    fontWeight="bold"
                    sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                  >
                    Main Branch
                  </Typography>
                  <Chip
                    color="neutral"
                    variant="soft"
                    startDecorator={<AccountTree />}
                  >
                    {data.mainBranch}
                  </Chip>
                </Box>
              )}
              {data?.size && (
                <Box>
                  <Typography
                    level="body-sm"
                    fontWeight="bold"
                    sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                  >
                    Size
                  </Typography>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-primary)" }}
                  >
                    {formatSize(data.size)}
                  </Typography>
                </Box>
              )}
            </Stack>
            {data?.owner && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Owner
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {data.owner.displayName}
                </Typography>
              </Box>
            )}
            {data?.project && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Project
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {data.project.name} ({data.project.key})
                </Typography>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Metadata Card */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)" }}>
        <CardContent>
          <Typography
            level="title-md"
            sx={{ mb: 2, color: "var(--text-primary)" }}
          >
            Metadata
          </Typography>
          <Stack spacing={2}>
            <Box>
              <Typography
                level="body-sm"
                fontWeight="bold"
                sx={{ color: "var(--text-secondary)", mb: 0.5 }}
              >
                Created
              </Typography>
              <Typography level="body-lg" sx={{ color: "var(--text-primary)" }}>
                {formatDate(data?.createdOn || subResource.createdAt)}
              </Typography>
            </Box>
            <Box>
              <Typography
                level="body-sm"
                fontWeight="bold"
                sx={{ color: "var(--text-secondary)", mb: 0.5 }}
              >
                Last Updated
              </Typography>
              <Typography level="body-lg" sx={{ color: "var(--text-primary)" }}>
                {formatDate(data?.updatedOn || subResource.updatedAt)}
              </Typography>
            </Box>
            {data?.lastSyncedAt && (
              <Box>
                <Typography
                  level="body-sm"
                  fontWeight="bold"
                  sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                >
                  Last Synced
                </Typography>
                <Typography
                  level="body-lg"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {formatDate(data.lastSyncedAt)}
                </Typography>
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default BitbucketRepositoryDetails;
