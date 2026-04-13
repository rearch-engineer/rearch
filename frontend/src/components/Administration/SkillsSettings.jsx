import React, { useState, useEffect } from "react";
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
      toast.error("Failed to load skills: " + err.message);
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
      toast.error("Failed to create skill: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (await confirm({ title: "Delete Skill", message: "Are you sure you want to delete this skill?", confirmText: "Delete", confirmColor: "danger" })) {
      try {
        await api.deleteSkill(id);
        loadSkills();
      } catch (err) {
        toast.error("Failed to delete skill: " + err.message);
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
          <Typography level="h3" sx={{ mb: 3 }}>
            Skills
          </Typography>
        </Box>

        {/* Search & actions */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Input
            size="sm"
            placeholder="Search skills..."
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
            Add Skill
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
                To get started, click on Add Skill above.
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
                  <th>Title</th>
                  <th>Description</th>
                  <th>Skills Repository</th>
                  <th>Default</th>
                  <th style={{ width: 100 }}>Actions</th>
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
                            Default
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
            Add Skill
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
                  Title
                </FormLabel>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Enter skill title"
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
                  Description
                </FormLabel>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Enter skill description"
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
                  Skills Repository
                </FormLabel>
                <Select
                  value={formData.skillsRepository}
                  onChange={(_, newValue) =>
                    setFormData({
                      ...formData,
                      skillsRepository: newValue || "",
                    })
                  }
                  placeholder="Select a repository"
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
                    Default Skill
                  </FormLabel>
                  <Typography level="body-xs" sx={{ color: "var(--text-tertiary)" }}>
                    Default skills are cloned into every new conversation
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
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={saving}
                  startDecorator={<AddIcon />}
                >
                  Add Skill
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
