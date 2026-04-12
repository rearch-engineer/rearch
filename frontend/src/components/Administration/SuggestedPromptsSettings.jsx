import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Stack,
  IconButton,
  Table,
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  Chip,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  AspectRatio,
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import ImageIcon from "@mui/icons-material/Image";
import CategoryIcon from "@mui/icons-material/Category";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

const EMPTY_CATEGORY = { name: "", slug: "", description: "", order: 0 };
const EMPTY_PROMPT = { title: "", prompt: "", category: "", icon: "SmartToyOutlined", iconColor: "#6b7280", order: 0 };

// Common MUI icon names for the picker
const ICON_OPTIONS = [
  "SmartToyOutlined", "DescriptionOutlined", "SearchOutlined", "BarChartOutlined",
  "CodeOutlined", "BuildOutlined", "BugReportOutlined", "ScienceOutlined",
  "SchoolOutlined", "LightbulbOutlined", "RocketLaunchOutlined", "AutoAwesomeOutlined",
  "ChatOutlined", "ForumOutlined", "SupportAgentOutlined", "PsychologyOutlined",
  "StorageOutlined", "CloudOutlined", "SecurityOutlined", "SpeedOutlined",
  "TuneOutlined", "IntegrationInstructionsOutlined", "TerminalOutlined", "DataObjectOutlined",
  "AccountTreeOutlined", "HubOutlined", "WidgetsOutlined", "ExtensionOutlined",
  "AnalyticsOutlined", "InsightsOutlined", "TrendingUpOutlined", "AssessmentOutlined",
];

export default function SuggestedPromptsSettings() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(0);

  // Categories state
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);
  const [savingCategory, setSavingCategory] = useState(false);

  // Prompts state
  const [prompts, setPrompts] = useState([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [promptForm, setPromptForm] = useState(EMPTY_PROMPT);
  const [promptImage, setPromptImage] = useState(null);
  const [promptImagePreview, setPromptImagePreview] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadCategories();
    loadPrompts();
  }, []);

  // ─── Category Operations ──────────────────────────────────────────────────

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await api.getSuggestedPromptCategories();
      setCategories(data);
    } catch (err) {
      toast.error("Failed to load categories: " + err.message);
    } finally {
      setLoadingCategories(false);
    }
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm(EMPTY_CATEGORY);
    setCategoryModalOpen(true);
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      order: cat.order || 0,
    });
    setCategoryModalOpen(true);
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    try {
      setSavingCategory(true);
      if (editingCategory) {
        await api.updateSuggestedPromptCategory(editingCategory._id, categoryForm);
        toast.success("Category updated");
      } else {
        await api.createSuggestedPromptCategory(categoryForm);
        toast.success("Category created");
      }
      setCategoryModalOpen(false);
      setCategoryForm(EMPTY_CATEGORY);
      setEditingCategory(null);
      loadCategories();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error("Failed to save category: " + msg);
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Delete this category? Prompts using it must be moved first.")) return;
    try {
      await api.deleteSuggestedPromptCategory(id);
      toast.success("Category deleted");
      loadCategories();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error("Failed to delete category: " + msg);
    }
  };

  const autoSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  // ─── Prompt Operations ────────────────────────────────────────────────────

  const loadPrompts = async () => {
    try {
      setLoadingPrompts(true);
      const data = await api.getSuggestedPrompts();
      setPrompts(data);
    } catch (err) {
      toast.error("Failed to load prompts: " + err.message);
    } finally {
      setLoadingPrompts(false);
    }
  };

  const openCreatePrompt = () => {
    setEditingPrompt(null);
    setPromptForm(EMPTY_PROMPT);
    setPromptImage(null);
    setPromptImagePreview(null);
    setRemoveImage(false);
    setPromptModalOpen(true);
  };

  const openEditPrompt = (prompt) => {
    setEditingPrompt(prompt);
    setPromptForm({
      title: prompt.title,
      prompt: prompt.prompt,
      category: prompt.category?._id || prompt.category || "",
      icon: prompt.icon || "SmartToyOutlined",
      iconColor: prompt.iconColor || "#6b7280",
      order: prompt.order || 0,
    });
    setPromptImage(null);
    setPromptImagePreview(
      prompt.imageFileId ? api.getPublicFileUrl(prompt.imageFileId) : null,
    );
    setRemoveImage(false);
    setPromptModalOpen(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPromptImage(file);
      setPromptImagePreview(URL.createObjectURL(file));
      setRemoveImage(false);
    }
  };

  const handleRemoveImage = () => {
    setPromptImage(null);
    setPromptImagePreview(null);
    setRemoveImage(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePromptSubmit = async (e) => {
    e.preventDefault();
    try {
      setSavingPrompt(true);

      const formData = new FormData();
      formData.append("title", promptForm.title);
      formData.append("prompt", promptForm.prompt);
      formData.append("category", promptForm.category);
      formData.append("icon", promptForm.icon || "SmartToyOutlined");
      formData.append("iconColor", promptForm.iconColor || "#6b7280");
      formData.append("order", String(promptForm.order));
      if (promptImage) {
        formData.append("image", promptImage);
      }
      if (removeImage) {
        formData.append("removeImage", "true");
      }

      if (editingPrompt) {
        await api.updateSuggestedPrompt(editingPrompt._id, formData);
        toast.success("Prompt updated");
      } else {
        await api.createSuggestedPrompt(formData);
        toast.success("Prompt created");
      }
      setPromptModalOpen(false);
      setPromptForm(EMPTY_PROMPT);
      setEditingPrompt(null);
      setPromptImage(null);
      setPromptImagePreview(null);
      setRemoveImage(false);
      loadPrompts();
    } catch (err) {
      const details = err.response?.data?.details;
      let msg = err.response?.data?.error || err.message;
      if (details) {
        const fieldErrors = Object.entries(details)
          .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(", ") : errors}`)
          .join("; ");
        if (fieldErrors) msg += ` (${fieldErrors})`;
      }
      toast.error("Failed to save prompt: " + msg);
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleDeletePrompt = async (id) => {
    if (!window.confirm("Delete this suggested prompt?")) return;
    try {
      await api.deleteSuggestedPrompt(id);
      toast.success("Prompt deleted");
      loadPrompts();
    } catch (err) {
      toast.error("Failed to delete prompt: " + err.message);
    }
  };

  const loading = loadingCategories || loadingPrompts;

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
            Suggested Prompts
          </Typography>

        </Box>

        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          sx={{ bgcolor: "transparent" }}
        >
          <TabList sx={{ mb: 2 }}>
            <Tab>
              <CategoryIcon sx={{ mr: 1, fontSize: 18 }} />
              Categories ({categories.length})
            </Tab>
            <Tab>
              <ImageIcon sx={{ mr: 1, fontSize: 18 }} />
              Prompts ({prompts.length})
            </Tab>
          </TabList>

          {/* ─── Categories Tab ──────────────────────────────────────────── */}
          <TabPanel value={0} sx={{ p: 0 }}>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
              <Button
                variant="solid"
                color="primary"
                startDecorator={<AddIcon />}
                onClick={openCreateCategory}
              >
                Add Category
              </Button>
            </Stack>

            <Card
              variant="outlined"
              sx={{
                borderColor: "var(--border-color)",
                bgcolor: "var(--bg-primary)",
                overflow: "auto",
              }}
            >
              {categories.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    No categories yet
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)", mb: 3 }}
                  >
                    Create a category to organize your suggested prompts.
                  </Typography>
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<AddIcon />}
                    onClick={openCreateCategory}
                  >
                    Add Category
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
                      <th>Name</th>
                      <th>Slug</th>
                      <th>Description</th>
                      <th style={{ width: 80 }}>Order</th>
                      <th style={{ width: 80 }}>Prompts</th>
                      <th style={{ width: 100 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => {
                      const promptCount = prompts.filter(
                        (p) =>
                          (p.category?._id || p.category) === cat._id,
                      ).length;
                      return (
                        <tr key={cat._id}>
                          <td>
                            <Typography
                              level="body-sm"
                              sx={{
                                fontWeight: 600,
                                color: "var(--text-primary)",
                              }}
                            >
                              {cat.name}
                            </Typography>
                          </td>
                          <td>
                            <Chip size="sm" variant="soft" color="neutral">
                              {cat.slug}
                            </Chip>
                          </td>
                          <td>
                            <Typography
                              level="body-sm"
                              sx={{
                                maxWidth: 300,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {cat.description || "\u2014"}
                            </Typography>
                          </td>
                          <td>
                            <Typography
                              level="body-sm"
                              sx={{ color: "var(--text-secondary)" }}
                            >
                              {cat.order}
                            </Typography>
                          </td>
                          <td>
                            <Chip size="sm" variant="soft" color="primary">
                              {promptCount}
                            </Chip>
                          </td>
                          <td>
                            <Stack direction="row" spacing={0.5}>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="neutral"
                                onClick={() => openEditCategory(cat)}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="danger"
                                onClick={() => handleDeleteCategory(cat._id)}
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
          </TabPanel>

          {/* ─── Prompts Tab ─────────────────────────────────────────────── */}
          <TabPanel value={1} sx={{ p: 0 }}>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
              <Button
                variant="solid"
                color="primary"
                startDecorator={<AddIcon />}
                onClick={openCreatePrompt}
                disabled={categories.length === 0}
              >
                Add Prompt
              </Button>
            </Stack>

            {categories.length === 0 ? (
              <Card
                variant="outlined"
                sx={{
                  borderColor: "var(--border-color)",
                  bgcolor: "var(--bg-primary)",
                }}
              >
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    Create a category first
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)", mb: 3 }}
                  >
                    You need at least one category before adding prompts.
                  </Typography>
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<AddIcon />}
                    onClick={() => {
                      setActiveTab(0);
                      openCreateCategory();
                    }}
                  >
                    Add Category
                  </Button>
                </Box>
              </Card>
            ) : prompts.length === 0 ? (
              <Card
                variant="outlined"
                sx={{
                  borderColor: "var(--border-color)",
                  bgcolor: "var(--bg-primary)",
                }}
              >
                <Box sx={{ textAlign: "center", py: 8 }}>
                  <Typography
                    level="body-lg"
                    sx={{ color: "var(--text-secondary)", mb: 1 }}
                  >
                    No prompts configured
                  </Typography>
                  <Typography
                    level="body-sm"
                    sx={{ color: "var(--text-tertiary)", mb: 3 }}
                  >
                    Add suggested prompts that will appear on the welcome screen.
                  </Typography>
                  <Button
                    variant="soft"
                    color="primary"
                    startDecorator={<AddIcon />}
                    onClick={openCreatePrompt}
                  >
                    Add Prompt
                  </Button>
                </Box>
              </Card>
            ) : (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(3, 1fr)",
                  },
                  gap: 2,
                }}
              >
                {prompts.map((prompt) => (
                  <Card
                    key={prompt._id}
                    variant="outlined"
                    sx={{
                      borderColor: "var(--border-color)",
                      bgcolor: "var(--bg-primary)",
                      overflow: "hidden",
                    }}
                  >
                    {prompt.imageFileId && (
                      <AspectRatio ratio="16/9" sx={{ minWidth: "100%" }}>
                        <img
                          src={api.getPublicFileUrl(prompt.imageFileId)}
                          alt={prompt.title}
                          style={{ objectFit: "cover" }}
                        />
                      </AspectRatio>
                    )}
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="flex-start"
                        >
                          <Typography
                            level="title-sm"
                            sx={{
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {prompt.title}
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => openEditPrompt(prompt)}
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="danger"
                              onClick={() => handleDeletePrompt(prompt._id)}
                            >
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Stack>
                        </Stack>
                        <Typography
                          level="body-xs"
                          sx={{
                            color: "var(--text-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {prompt.prompt}
                        </Typography>
                        <Chip
                          size="sm"
                          variant="soft"
                          color="primary"
                          sx={{ alignSelf: "flex-start" }}
                        >
                          {prompt.category?.name || "Uncategorized"}
                        </Chip>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </TabPanel>
        </Tabs>
      </Box>

      {/* ─── Category Modal ──────────────────────────────────────────────── */}
      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)}>
        <ModalDialog
          variant="outlined"
          sx={{
            width: { xs: "95vw", sm: 480 },
            maxHeight: "90vh",
            overflowY: "auto",
            bgcolor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
          }}
        >
          <ModalClose />
          <Typography
            level="title-lg"
            sx={{ mb: 2, fontWeight: 700, color: "var(--text-primary)" }}
          >
            {editingCategory ? "Edit Category" : "Add Category"}
          </Typography>
          <form onSubmit={handleCategorySubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Name
                </FormLabel>
                <Input
                  value={categoryForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setCategoryForm((prev) => ({
                      ...prev,
                      name,
                      ...(editingCategory ? {} : { slug: autoSlug(name) }),
                    }));
                  }}
                  placeholder="e.g. Data & Analytics"
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Slug
                </FormLabel>
                <Input
                  value={categoryForm.slug}
                  onChange={(e) =>
                    setCategoryForm((prev) => ({ ...prev, slug: e.target.value }))
                  }
                  placeholder="e.g. data-analytics"
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <FormControl>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Description
                </FormLabel>
                <Textarea
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Optional description"
                  minRows={2}
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <FormControl>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Order
                </FormLabel>
                <Input
                  type="number"
                  value={categoryForm.order}
                  onChange={(e) =>
                    setCategoryForm((prev) => ({
                      ...prev,
                      order: parseInt(e.target.value) || 0,
                    }))
                  }
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
                <Button
                  variant="outlined"
                  color="neutral"
                  onClick={() => setCategoryModalOpen(false)}
                  sx={{ borderColor: "var(--border-color)" }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={savingCategory}
                >
                  {editingCategory ? "Save" : "Add Category"}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>

      {/* ─── Prompt Modal ────────────────────────────────────────────────── */}
      <Modal open={promptModalOpen} onClose={() => setPromptModalOpen(false)}>
        <ModalDialog
          variant="outlined"
          sx={{
            width: { xs: "95vw", sm: 560 },
            maxHeight: "90vh",
            overflowY: "auto",
            bgcolor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
          }}
        >
          <ModalClose />
          <Typography
            level="title-lg"
            sx={{ mb: 2, fontWeight: 700, color: "var(--text-primary)" }}
          >
            {editingPrompt ? "Edit Prompt" : "Add Prompt"}
          </Typography>
          <form onSubmit={handlePromptSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Title
                </FormLabel>
                <Input
                  value={promptForm.title}
                  onChange={(e) =>
                    setPromptForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="e.g. Self-populating CRM"
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Prompt
                </FormLabel>
                <Textarea
                  value={promptForm.prompt}
                  onChange={(e) =>
                    setPromptForm((prev) => ({ ...prev, prompt: e.target.value }))
                  }
                  placeholder="The prompt text that will be sent when the user clicks this card..."
                  minRows={4}
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Category
                </FormLabel>
                <Select
                  value={promptForm.category}
                  onChange={(_, val) =>
                    setPromptForm((prev) => ({ ...prev, category: val || "" }))
                  }
                  placeholder="Select category"
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                >
                  {categories.map((cat) => (
                    <Option key={cat._id} value={cat._id}>
                      {cat.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Icon
                </FormLabel>
                <Select
                  value={promptForm.icon}
                  onChange={(_, val) =>
                    setPromptForm((prev) => ({ ...prev, icon: val || "SmartToyOutlined" }))
                  }
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                >
                  {ICON_OPTIONS.map((name) => (
                    <Option key={name} value={name}>
                      {name.replace("Outlined", "")}
                    </Option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Icon Color
                </FormLabel>
                <Stack direction="row" spacing={1} alignItems="center">
                  <input
                    type="color"
                    value={promptForm.iconColor || "#6b7280"}
                    onChange={(e) =>
                      setPromptForm((prev) => ({ ...prev, iconColor: e.target.value }))
                    }
                    style={{ width: 40, height: 32, border: "none", cursor: "pointer", background: "transparent" }}
                  />
                  <Input
                    value={promptForm.iconColor || "#6b7280"}
                    onChange={(e) =>
                      setPromptForm((prev) => ({ ...prev, iconColor: e.target.value }))
                    }
                    placeholder="#6b7280"
                    sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)", flex: 1 }}
                  />
                </Stack>
              </FormControl>
              <FormControl>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Image
                </FormLabel>
                <Stack spacing={1}>
                  {promptImagePreview && (
                    <Box
                      sx={{
                        position: "relative",
                        borderRadius: "sm",
                        overflow: "hidden",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <AspectRatio ratio="16/9">
                        <img
                          src={promptImagePreview}
                          alt="Preview"
                          style={{ objectFit: "cover" }}
                        />
                      </AspectRatio>
                      <IconButton
                        size="sm"
                        variant="solid"
                        color="danger"
                        onClick={handleRemoveImage}
                        sx={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          minWidth: 28,
                          minHeight: 28,
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  )}
                  <Button
                    variant="outlined"
                    color="neutral"
                    startDecorator={<ImageIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{ borderColor: "var(--border-color)" }}
                  >
                    {promptImagePreview ? "Change Image" : "Upload Image"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: "none" }}
                  />
                </Stack>
              </FormControl>
              <FormControl>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  Order
                </FormLabel>
                <Input
                  type="number"
                  value={promptForm.order}
                  onChange={(e) =>
                    setPromptForm((prev) => ({
                      ...prev,
                      order: parseInt(e.target.value) || 0,
                    }))
                  }
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
                <Button
                  variant="outlined"
                  color="neutral"
                  onClick={() => setPromptModalOpen(false)}
                  sx={{ borderColor: "var(--border-color)" }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={savingPrompt}
                >
                  {editingPrompt ? "Save" : "Add Prompt"}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
