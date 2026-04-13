import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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

  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  Chip,
  AspectRatio,
  Table,
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import ImageIcon from "@mui/icons-material/Image";
import CategoryIcon from "@mui/icons-material/Category";
import SearchIcon from "@mui/icons-material/Search";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import BugReportOutlined from "@mui/icons-material/BugReportOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import SchoolOutlined from "@mui/icons-material/SchoolOutlined";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import RocketLaunchOutlined from "@mui/icons-material/RocketLaunchOutlined";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import SupportAgentOutlined from "@mui/icons-material/SupportAgentOutlined";
import PsychologyOutlined from "@mui/icons-material/PsychologyOutlined";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import CloudOutlined from "@mui/icons-material/CloudOutlined";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import SpeedOutlined from "@mui/icons-material/SpeedOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import IntegrationInstructionsOutlined from "@mui/icons-material/IntegrationInstructionsOutlined";
import TerminalOutlined from "@mui/icons-material/TerminalOutlined";
import DataObjectOutlined from "@mui/icons-material/DataObjectOutlined";
import AccountTreeOutlined from "@mui/icons-material/AccountTreeOutlined";
import HubOutlined from "@mui/icons-material/HubOutlined";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import ExtensionOutlined from "@mui/icons-material/ExtensionOutlined";
import AnalyticsOutlined from "@mui/icons-material/AnalyticsOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";

const ICON_MAP = {
  SmartToyOutlined, DescriptionOutlined, SearchOutlined, BarChartOutlined,
  CodeOutlined, BuildOutlined, BugReportOutlined, ScienceOutlined,
  SchoolOutlined, LightbulbOutlined, RocketLaunchOutlined, AutoAwesomeOutlined,
  ChatOutlined, ForumOutlined, SupportAgentOutlined, PsychologyOutlined,
  StorageOutlined, CloudOutlined, SecurityOutlined, SpeedOutlined,
  TuneOutlined, IntegrationInstructionsOutlined, TerminalOutlined, DataObjectOutlined,
  AccountTreeOutlined, HubOutlined, WidgetsOutlined, ExtensionOutlined,
  AnalyticsOutlined, InsightsOutlined, TrendingUpOutlined, AssessmentOutlined,
};
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";

const EMPTY_CATEGORY = { name: "", slug: "", order: 0 };
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
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [subSearch, setSubSearch] = useState("");

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
      toast.error(t("suggestedPrompts.failedToLoadCategories", { message: err.message }));
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
        toast.success(t("suggestedPrompts.categoryUpdated"));
      } else {
        await api.createSuggestedPromptCategory(categoryForm);
        toast.success(t("suggestedPrompts.categoryCreated"));
      }
      setCategoryModalOpen(false);
      setCategoryForm(EMPTY_CATEGORY);
      setEditingCategory(null);
      loadCategories();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error(t("suggestedPrompts.failedToSaveCategory", { message: msg }));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!(await confirm({ title: t("suggestedPrompts.deleteCategory"), message: t("suggestedPrompts.deleteCategoryConfirm"), confirmText: t("suggestedPrompts.delete"), confirmColor: "danger" }))) return;
    try {
      await api.deleteSuggestedPromptCategory(id);
      toast.success(t("suggestedPrompts.categoryAndPromptsDeleted"));
      loadCategories();
      loadPrompts();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error(t("suggestedPrompts.failedToDeleteCategory", { message: msg }));
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
      toast.error(t("suggestedPrompts.failedToLoadPrompts", { message: err.message }));
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
      const allowedImageTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
      if (!allowedImageTypes.includes(file.type)) {
        setPromptImage(null);
        setPromptImagePreview(null);
        setRemoveImage(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

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
        toast.success(t("suggestedPrompts.promptUpdated"));
      } else {
        await api.createSuggestedPrompt(formData);
        toast.success(t("suggestedPrompts.promptCreated"));
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
      toast.error(t("suggestedPrompts.failedToSavePrompt", { message: msg }));
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleDeletePrompt = async (id) => {
    if (!(await confirm({ title: t("suggestedPrompts.deletePrompt"), message: t("suggestedPrompts.deletePromptConfirm"), confirmText: t("suggestedPrompts.delete"), confirmColor: "danger" }))) return;
    try {
      await api.deleteSuggestedPrompt(id);
      toast.success(t("suggestedPrompts.promptDeleted"));
      loadPrompts();
    } catch (err) {
      toast.error(t("suggestedPrompts.failedToDeletePrompt", { message: err.message }));
    }
  };

  const searchLower = search.toLowerCase();
  const filteredCategories = categories.filter((cat) => {
    if (!search) return true;
    const categoryPrompts = prompts.filter(
      (p) => (p.category?._id || p.category) === cat._id,
    );
    return (
      cat.name.toLowerCase().includes(searchLower) ||
      cat.slug.toLowerCase().includes(searchLower) ||

      categoryPrompts.some(
        (p) =>
          p.title.toLowerCase().includes(searchLower) ||
          p.prompt.toLowerCase().includes(searchLower),
      )
    );
  });

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
          {t("suggestedPrompts.loading")}
        </Typography>
      </Box>
    );
  }

  // ─── Sub-category exploration page ──────────────────────────────────────
  if (selectedCategory) {
    const cat = categories.find((c) => c._id === selectedCategory);
    if (!cat) {
      setSelectedCategory(null);
      return null;
    }
    const subSearchLower = subSearch.toLowerCase();
    const categoryPrompts = prompts
      .filter((p) => (p.category?._id || p.category) === cat._id)
      .filter((p) =>
        !subSearch ||
        p.title.toLowerCase().includes(subSearchLower) ||
        p.prompt.toLowerCase().includes(subSearchLower),
      );

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
          {/* Back button & title */}
          <Box sx={{ mb: 3 }}>
            <Button
              variant="plain"
              color="neutral"
              size="sm"
              startDecorator={<ArrowBackIcon />}
              onClick={() => { setSelectedCategory(null); setSubSearch(""); }}
              sx={{ mb: 1, ml: -1 }}
            >
              {t("suggestedPrompts.backToCategories")}
            </Button>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
              <CategoryIcon sx={{ fontSize: 24, color: "var(--text-secondary)" }} />
              <Typography
                level="h2"
                sx={{
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  fontSize: { xs: "1.5rem", md: "1.75rem" },
                }}
              >
                {cat.name}
              </Typography>
              <Chip size="sm" variant="soft" color="neutral">{cat.slug}</Chip>
            </Stack>
          </Box>

          {/* Search & Add prompt */}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <FormControl sx={{ flex: 1 }}>
              <Input
                size="sm"
                placeholder={t("suggestedPrompts.searchPromptsInCategory")}
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                startDecorator={<SearchIcon sx={{ color: "var(--text-secondary)" }} />}
                sx={{
                  bgcolor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              />
            </FormControl>
            <Button
              variant="solid"
              color="primary"
              size="sm"
              onClick={() => {
                setPromptForm({ ...EMPTY_PROMPT, category: cat._id });
                setEditingPrompt(null);
                setPromptImage(null);
                setPromptImagePreview(null);
                setRemoveImage(false);
                setPromptModalOpen(true);
              }}
            >
              {t("suggestedPrompts.addPrompt")}
            </Button>
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
              onClick={() => {
                handleDeleteCategory(cat._id);
                setSelectedCategory(null);
                setSubSearch("");
              }}
            >
              <DeleteIcon />
            </IconButton>
          </Stack>

          {/* Prompts grid */}
          {categoryPrompts.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography level="body-lg" sx={{ color: "var(--text-secondary)", mb: 1 }}>
                {subSearch ? t("suggestedPrompts.noPromptsMatch") : t("suggestedPrompts.noPromptsInCategory")}
              </Typography>
              {!subSearch && (
                <Typography level="body-sm" sx={{ color: "var(--text-tertiary)" }}>
                  {t("suggestedPrompts.clickAddPrompt")}
                </Typography>
              )}
            </Box>
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
              {categoryPrompts.map((prompt) => (
                <Card
                  key={prompt._id}
                  variant="plain"
                  sx={{
                    bgcolor: "var(--bg-secondary)",
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
                          sx={{ fontWeight: 600, color: "var(--text-primary)" }}
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
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </Box>

        {/* Modals need to be rendered here too */}
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
              {editingCategory ? t("suggestedPrompts.editCategory") : t("suggestedPrompts.addCategory")}
            </Typography>
            <form onSubmit={handleCategorySubmit}>
              <Stack spacing={2}>
                <FormControl required>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.name")}</FormLabel>
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
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.slug")}</FormLabel>
                  <Input
                    value={categoryForm.slug}
                    onChange={(e) => setCategoryForm((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="e.g. data-analytics"
                    sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.order")}</FormLabel>
                  <Input
                    type="number"
                    value={categoryForm.order}
                    onChange={(e) => setCategoryForm((prev) => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                    sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                  />
                </FormControl>
                <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
                  <Button variant="outlined" color="neutral" onClick={() => setCategoryModalOpen(false)} sx={{ borderColor: "var(--border-color)" }}>{t("suggestedPrompts.cancel")}</Button>
                  <Button type="submit" variant="solid" color="primary" loading={savingCategory}>{editingCategory ? t("suggestedPrompts.save") : t("suggestedPrompts.addCategory")}</Button>
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
            <Typography level="title-lg" sx={{ mb: 2, fontWeight: 700, color: "var(--text-primary)" }}>
              {editingPrompt ? t("suggestedPrompts.editPrompt") : t("suggestedPrompts.addPrompt")}
            </Typography>
            <form onSubmit={handlePromptSubmit}>
              <Stack spacing={2}>
                <FormControl required>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.promptTitle")}</FormLabel>
                  <Input value={promptForm.title} onChange={(e) => setPromptForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="e.g. Self-populating CRM" sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }} />
                </FormControl>
                <FormControl required>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.prompt")}</FormLabel>
                  <Textarea value={promptForm.prompt} onChange={(e) => setPromptForm((prev) => ({ ...prev, prompt: e.target.value }))} placeholder={t("suggestedPrompts.promptPlaceholder")} minRows={4} sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }} />
                </FormControl>
                <FormControl required>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.category")}</FormLabel>
                  <Select value={promptForm.category} onChange={(_, val) => setPromptForm((prev) => ({ ...prev, category: val || "" }))} placeholder={t("suggestedPrompts.selectCategory")} sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
                    {categories.map((c) => (<Option key={c._id} value={c._id}>{c.name}</Option>))}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.icon")}</FormLabel>
                  <Select value={promptForm.icon} onChange={(_, val) => setPromptForm((prev) => ({ ...prev, icon: val || "SmartToyOutlined" }))} sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}>
                    {ICON_OPTIONS.map((name) => (<Option key={name} value={name}>{name.replace("Outlined", "")}</Option>))}
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.iconColor")}</FormLabel>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <input type="color" value={promptForm.iconColor || "#6b7280"} onChange={(e) => setPromptForm((prev) => ({ ...prev, iconColor: e.target.value }))} style={{ width: 40, height: 32, border: "none", cursor: "pointer", background: "transparent" }} />
                    <Input value={promptForm.iconColor || "#6b7280"} onChange={(e) => setPromptForm((prev) => ({ ...prev, iconColor: e.target.value }))} placeholder="#6b7280" sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)", flex: 1 }} />
                  </Stack>
                </FormControl>
                <FormControl>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.image")}</FormLabel>
                  <Stack spacing={1}>
                    {promptImagePreview && (
                      <Box sx={{ position: "relative", borderRadius: "sm", overflow: "hidden", border: "1px solid var(--border-color)" }}>
                        <AspectRatio ratio="16/9"><img src={promptImagePreview} alt="Preview" style={{ objectFit: "cover" }} /></AspectRatio>
                        <IconButton size="sm" variant="solid" color="danger" onClick={handleRemoveImage} sx={{ position: "absolute", top: 4, right: 4, minWidth: 28, minHeight: 28 }}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                      </Box>
                    )}
                    <Button variant="outlined" color="neutral" startDecorator={<ImageIcon />} onClick={() => fileInputRef.current?.click()} sx={{ borderColor: "var(--border-color)" }}>{promptImagePreview ? t("suggestedPrompts.changeImage") : t("suggestedPrompts.uploadImage")}</Button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
                  </Stack>
                </FormControl>
                <FormControl>
                  <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>{t("suggestedPrompts.order")}</FormLabel>
                  <Input type="number" value={promptForm.order} onChange={(e) => setPromptForm((prev) => ({ ...prev, order: parseInt(e.target.value) || 0 }))} sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }} />
                </FormControl>
                <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
                  <Button variant="outlined" color="neutral" onClick={() => setPromptModalOpen(false)} sx={{ borderColor: "var(--border-color)" }}>{t("suggestedPrompts.cancel")}</Button>
                  <Button type="submit" variant="solid" color="primary" loading={savingPrompt}>{editingPrompt ? t("suggestedPrompts.save") : t("suggestedPrompts.addPrompt")}</Button>
                </Stack>
              </Stack>
            </form>
          </ModalDialog>
        </Modal>
      </Box>
    );
  }

  // ─── Main categories list view ────────────────────────────────────────────
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
            {t("suggestedPrompts.title")}
          </Typography>

        </Box>

        {/* Search & Add */}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <FormControl sx={{ flex: 1 }}>
            <Input
              size="sm"
              placeholder={t("suggestedPrompts.searchCategoriesAndPrompts")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startDecorator={<SearchIcon sx={{ color: "var(--text-secondary)" }} />}
              sx={{
                bgcolor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
            />
          </FormControl>
          <Button
            variant="solid"
            color="primary"
            onClick={openCreateCategory}
          >
            {t("suggestedPrompts.addCategory")}
          </Button>
        </Stack>

        <Box sx={{ bgcolor: "var(--bg-primary)", overflow: "auto" }}>
          {categories.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography level="body-sm" sx={{ color: "var(--text-tertiary)" }}>
                {t("suggestedPrompts.noCategories")}
              </Typography>
            </Box>
          ) : (
            <Table
              sx={{
                '& thead th': {
                  bgcolor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  borderBottom: '1px solid var(--border-color)',
                },
                '& tbody tr': {
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color)',
                  '&:last-child': { borderBottom: 'none' },
                },
                '& tbody td': { color: 'var(--text-primary)' },
              }}
            >
              <thead>
                <tr>
                  <th>{t("suggestedPrompts.name")}</th>
                  <th>{t("suggestedPrompts.slug")}</th>
                  <th>{t("suggestedPrompts.prompts")}</th>
                  <th style={{ width: 100 }}>{t("suggestedPrompts.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((cat) => {
                  const categoryPrompts = prompts.filter(
                    (p) => (p.category?._id || p.category) === cat._id,
                  );
                  return (
                    <tr key={cat._id} onClick={() => { setSelectedCategory(cat._id); setSubSearch(""); }}>
                      <td>
                        <Typography level="body-sm" sx={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {cat.name}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" variant="soft" color="neutral">
                          {cat.slug}
                        </Chip>
                      </td>
                      <td>
                        <Chip size="sm" variant="soft" color="primary">
                          {categoryPrompts.length === 1 ? t("suggestedPrompts.promptCount", { count: categoryPrompts.length }) : t("suggestedPrompts.promptCount_plural", { count: categoryPrompts.length })}
                        </Chip>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                          <IconButton size="sm" variant="plain" color="neutral" onClick={() => openEditCategory(cat)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDeleteCategory(cat._id)}>
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
            {editingCategory ? t("suggestedPrompts.editCategory") : t("suggestedPrompts.addCategory")}
          </Typography>
          <form onSubmit={handleCategorySubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  {t("suggestedPrompts.name")}
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
                  {t("suggestedPrompts.slug")}
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
                  {t("suggestedPrompts.order")}
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
                  {t("suggestedPrompts.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={savingCategory}
                >
                  {editingCategory ? t("suggestedPrompts.save") : t("suggestedPrompts.addCategory")}
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
            {editingPrompt ? t("suggestedPrompts.editPrompt") : t("suggestedPrompts.addPrompt")}
          </Typography>
          <form onSubmit={handlePromptSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  {t("suggestedPrompts.promptTitle")}
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
                  {t("suggestedPrompts.prompt")}
                </FormLabel>
                <Textarea
                  value={promptForm.prompt}
                  onChange={(e) =>
                    setPromptForm((prev) => ({ ...prev, prompt: e.target.value }))
                  }
                  placeholder={t("suggestedPrompts.promptPlaceholder")}
                  minRows={4}
                  sx={{ bgcolor: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
                />
              </FormControl>
              <FormControl required>
                <FormLabel sx={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                  {t("suggestedPrompts.category")}
                </FormLabel>
                <Select
                  value={promptForm.category}
                  onChange={(_, val) =>
                    setPromptForm((prev) => ({ ...prev, category: val || "" }))
                  }
                  placeholder={t("suggestedPrompts.selectCategory")}
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
                  {t("suggestedPrompts.icon")}
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
                  {t("suggestedPrompts.iconColor")}
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
                  {t("suggestedPrompts.image")}
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
                    {promptImagePreview ? t("suggestedPrompts.changeImage") : t("suggestedPrompts.uploadImage")}
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
                  {t("suggestedPrompts.order")}
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
                  {t("suggestedPrompts.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={savingPrompt}
                >
                  {editingPrompt ? t("suggestedPrompts.save") : t("suggestedPrompts.addPrompt")}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
