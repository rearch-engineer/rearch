import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  Typography,
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
  Switch,
  Chip,
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";

const EMPTY_FORM = { title: "", description: "", skillsRepository: "", isDefault: false };

export default function SkillsSettings() {
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [repositorySubResources, setRepositorySubResources] = useState([]);

  useEffect(() => {
    loadSkills();
    loadRepositorySubResources();
  }, []);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const data = await api.getSkills();
      setSkills(data);
    } catch (err) {
      toast.error(t("skills.failedToLoadSkills", { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const loadRepositorySubResources = async () => {
    try {
      const subResources = await api.getAllSubResources("bitbucket-repository");
      setRepositorySubResources(subResources);
    } catch (err) {
      console.error("Failed to load repository subresources:", err);
    }
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.createSkill(formData);
      handleClose();
      loadSkills();
    } catch (err) {
      toast.error(t("skills.failedToCreateSkill", { message: err.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (await confirm({ title: t("skills.deleteSkill"), message: t("skills.deleteSkillConfirm"), confirmText: t("skills.delete"), confirmColor: "danger" })) {
      try {
        await api.deleteSkill(id);
        loadSkills();
      } catch (err) {
        toast.error(t("skills.failedToDeleteSkill", { message: err.message }));
      }
    }
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
          {t("skills.loading")}
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
            {t("skills.title")}
          </Typography>
        </Box>

        {/* Search & actions */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Input
            size="sm"
            placeholder={t("skills.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startDecorator={<SearchIcon sx={{ color: "var(--text-secondary)" }} />}
            sx={{
              flex: 1,
              bgcolor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          />
          <Button
            size="sm"
            variant="solid"
            onClick={openCreate}
            sx={{ flexShrink: 0, bgcolor: "#fff", color: "#000", "&:hover": { bgcolor: "#e5e5e5" } }}
          >
            {t("skills.addSkill")}
          </Button>
        </Stack>

        {/* Table */}
        <Box sx={{ bgcolor: "var(--bg-primary)", overflow: "auto" }}>
          {skills.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography
                level="body-sm"
                sx={{ color: "var(--text-tertiary)" }}
              >
                {t("skills.getStartedHint")}
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
                  <th>{t("skills.tableTitle")}</th>
                  <th>{t("skills.tableDescription")}</th>
                  <th>{t("skills.tableSkillsRepository")}</th>
                  <th>{t("skills.tableDefault")}</th>
                  <th style={{ width: 100 }}>{t("skills.tableActions")}</th>
                </tr>
              </thead>
              <tbody>
                {skills.filter((s) => s.title.toLowerCase().includes(search.toLowerCase())).map((skill) => {
                  const linkedRepo = repositorySubResources.find(
                    (r) => r._id === skill.skillsRepository,
                  );
                  return (
                    <tr key={skill._id}>
                      <td>
                        <Typography
                          level="body-sm"
                          sx={{ fontWeight: 600, color: "var(--text-primary)" }}
                        >
                          {skill.title}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          level="body-sm"
                          sx={{
                            maxWidth: 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {skill.description}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          level="body-sm"
                          sx={{ color: "var(--text-secondary)" }}
                        >
                          {linkedRepo ? linkedRepo.name : "\u2014"}
                        </Typography>
                      </td>
                      <td>
                        {skill.isDefault ? (
                          <Chip size="sm" variant="soft" color="success">
                            {t("skills.default")}
                          </Chip>
                        ) : (
                          <Typography
                            level="body-sm"
                            sx={{ color: "var(--text-secondary)" }}
                          >
                            {"\u2014"}
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() =>
                              navigate(`/administration/skills/${skill._id}`)
                            }
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(skill._id)}
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

      {/* Create modal */}
      <Modal open={modalOpen} onClose={handleClose}>
        <ModalDialog
          variant="outlined"
          sx={{
            width: { xs: "95vw", sm: 520 },
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
            {t("skills.addSkill")}
          </Typography>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel
                  sx={{
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                  }}
                >
                  {t("skills.skillTitle")}
                </FormLabel>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder={t("skills.titlePlaceholder")}
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
              </FormControl>

              <FormControl required>
                <FormLabel
                  sx={{
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                  }}
                >
                  {t("skills.description")}
                </FormLabel>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t("skills.descriptionPlaceholder")}
                  minRows={4}
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
              </FormControl>

              <FormControl required>
                <FormLabel
                  sx={{
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                  }}
                >
                  {t("skills.skillsRepository")}
                </FormLabel>
                <Select
                  value={formData.skillsRepository}
                  onChange={(_, newValue) =>
                    setFormData({
                      ...formData,
                      skillsRepository: newValue || "",
                    })
                  }
                  placeholder={t("skills.selectRepository")}
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  {repositorySubResources.map((r) => (
                    <Option key={r._id} value={r._id}>
                      {r.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl
                orientation="horizontal"
                sx={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <Box>
                  <FormLabel sx={{ mb: 0, color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.8rem" }}>
                    {t("skills.defaultSkill")}
                  </FormLabel>
                  <Typography level="body-xs" sx={{ color: "var(--text-tertiary)" }}>
                    {t("skills.defaultSkillDescription")}
                  </Typography>
                </Box>
                <Switch
                  checked={formData.isDefault}
                  onChange={(e) =>
                    setFormData({ ...formData, isDefault: e.target.checked })
                  }
                  color={formData.isDefault ? "success" : "neutral"}
                />
              </FormControl>

              <Stack
                direction="row"
                spacing={1}
                justifyContent="flex-end"
                sx={{ pt: 1 }}
              >
                <Button
                  variant="outlined"
                  color="neutral"
                  onClick={handleClose}
                  sx={{ borderColor: "var(--border-color)" }}
                >
                  {t("skills.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={saving}
                  startDecorator={<AddIcon />}
                >
                  {t("skills.addSkill")}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
