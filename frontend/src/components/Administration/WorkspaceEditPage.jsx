import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Typography, Input, Button, Table, Select, Option, Divider,
  IconButton, Chip, Stack, FormControl, FormLabel,
  Modal, ModalDialog, DialogTitle, DialogContent, DialogActions, ModalClose,
} from "@mui/joy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SearchIcon from "@mui/icons-material/Search";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { api } from "../../api/client";

export default function WorkspaceEditPage() {
  const { t } = useTranslation("Administration");
  const { id } = useParams();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Name editing
  const [name, setName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [saving, setSaving] = useState(false);

  // Member invite
  const [showInvite, setShowInvite] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState(null);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Remove member
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [removing, setRemoving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wsData, membersData] = await Promise.all([
        api.getAdminWorkspace(id),
        api.getAdminWorkspaceMembers(id),
      ]);
      setWorkspace(wsData);
      setMembers(membersData.members || []);
      setName(wsData.name);
      setOriginalName(wsData.name);
    } catch (err) {
      console.error("Error loading workspace:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === originalName) return;
    setSaving(true);
    try {
      await api.updateAdminWorkspace(id, { name: name.trim() });
      setOriginalName(name.trim());
    } catch (err) {
      console.error("Error updating workspace:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await api.getUsers({ search: searchQuery.trim(), limit: 10 });
      const memberUserIds = new Set(members.map(m => m.user?._id));
      setSearchResults((data.users || []).filter(u => !memberUserIds.has(u._id)));
    } catch (err) {
      console.error("Error searching users:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (userId) => {
    setInviting(userId);
    try {
      await api.addAdminWorkspaceMember(id, userId);
      await loadData();
      setSearchResults(prev => prev.filter(u => u._id !== userId));
    } catch (err) {
      console.error("Error adding member:", err);
    } finally {
      setInviting(null);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.updateAdminWorkspaceMember(id, userId, { role: newRole });
      setMembers(prev => prev.map(m => m.user?._id === userId ? { ...m, role: newRole } : m));
    } catch (err) {
      console.error("Error changing role:", err);
    }
  };

  const handleRemove = async () => {
    if (!removeConfirm) return;
    setRemoving(true);
    try {
      await api.removeAdminWorkspaceMember(id, removeConfirm);
      setMembers(prev => prev.filter(m => m.user?._id !== removeConfirm));
    } catch (err) {
      console.error("Error removing member:", err);
    } finally {
      setRemoving(false);
      setRemoveConfirm(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteAdminWorkspace(id);
      navigate("/administration/workspaces");
    } catch (err) {
      console.error("Error deleting workspace:", err);
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  if (loading) {
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
        <Box sx={{ maxWidth: 960, mx: "auto", display: "flex", justifyContent: "center", p: 4 }}>
          <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
            {t("users.loading")}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!workspace) {
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
          <Typography>{t("workspaces.notFound")}</Typography>
        </Box>
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
        <Button
          variant="plain"
          size="sm"
          startDecorator={<ChevronLeftIcon />}
          onClick={() => navigate("/administration/workspaces")}
          sx={{ mb: 2 }}
        >
          {t("workspaces.backToList")}
        </Button>

        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography level="h3" sx={{ mb: 1 }}>
            {workspace.name}
            {workspace.isPersonal && (
              <Chip size="sm" variant="soft" color="neutral" sx={{ ml: 1, verticalAlign: "middle" }}>
                {t("workspaces.personal")}
              </Chip>
            )}
          </Typography>
          <Typography level="body-xs" sx={{ color: "var(--text-secondary)" }}>
            {t("workspaces.owner")}: {workspace.owner?.profile?.display_name || workspace.owner?.account?.email || "—"}
          </Typography>
        </Box>

        {/* Name editing */}
        <Box sx={{ mb: 3 }}>
          <FormControl>
            <FormLabel sx={{ color: "var(--text-secondary)" }}>
              {t("workspaces.name")}
            </FormLabel>
            <Stack direction="row" spacing={1}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                size="sm"
                sx={{
                  flex: 1,
                  bgcolor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              />
              <Button
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!name.trim() || name.trim() === originalName}
              >
                {t("workspaces.save")}
              </Button>
            </Stack>
          </FormControl>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Members header */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
          <Typography level="h4">
            {t("workspaces.members")} ({members.length})
          </Typography>
          <Button size="sm" startDecorator={<PersonAddIcon />} onClick={() => setShowInvite(!showInvite)}>
            {t("workspaces.addMember")}
          </Button>
        </Box>

        {showInvite && (
          <Box
            sx={{
              mb: 3,
              p: 2,
              borderRadius: "8px",
              bgcolor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 1 }}>
              <FormControl sx={{ flex: 1 }}>
                <Input
                  size="sm"
                  placeholder={t("workspaces.searchUserPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  startDecorator={<SearchIcon sx={{ color: "var(--text-secondary)" }} />}
                  sx={{
                    bgcolor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                />
              </FormControl>
              <Button size="sm" onClick={handleSearch} loading={searching} variant="outlined"
                sx={{ borderColor: "var(--border-color)", color: "var(--text-primary)" }}
              >
                {t("workspaces.search")}
              </Button>
            </Stack>
            {searchResults.map(u => (
              <Box
                key={u._id}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 1,
                  px: 1,
                  borderBottom: "1px solid var(--border-color)",
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Box>
                  <Typography level="body-sm" sx={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {u.profile?.display_name || u.account?.username}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: "var(--text-secondary)" }}>
                    {u.account?.email}
                  </Typography>
                </Box>
                <Button size="sm" variant="soft" loading={inviting === u._id} onClick={() => handleInvite(u._id)}>
                  {t("workspaces.add")}
                </Button>
              </Box>
            ))}
          </Box>
        )}

        {/* Members table */}
        <Box
          sx={{
            bgcolor: "var(--bg-primary)",
            overflow: "auto",
          }}
        >
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
                <th>{t("workspaces.memberName")}</th>
                <th>{t("workspaces.memberEmail")}</th>
                <th style={{ width: 140 }}>{t("workspaces.memberRole")}</th>
                <th style={{ width: 60 }}>{t("users.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      {t("workspaces.noResults")}
                    </Typography>
                  </td>
                </tr>
              ) : (
                members.map(member => (
                  <tr key={member.user?._id || member._id}>
                    <td>
                      <Typography
                        level="body-sm"
                        sx={{ fontWeight: 600, color: "var(--text-primary)" }}
                      >
                        {member.user?.profile?.display_name || member.user?.account?.username || "—"}
                      </Typography>
                    </td>
                    <td>
                      <Typography
                        level="body-xs"
                        sx={{ color: "var(--text-secondary)" }}
                      >
                        {member.user?.account?.email || "—"}
                      </Typography>
                    </td>
                    <td>
                      <Select
                        size="sm"
                        value={member.role}
                        onChange={(e, val) => handleRoleChange(member.user?._id, val)}
                        sx={{
                          minWidth: 100,
                          bgcolor: "var(--bg-secondary)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        <Option value="admin">{t("workspaces.roleAdmin")}</Option>
                        <Option value="member">{t("workspaces.roleMember")}</Option>
                      </Select>
                    </td>
                    <td>
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="danger"
                        onClick={() => setRemoveConfirm(member.user?._id)}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Danger zone */}
        <Box>
          <Typography level="title-sm" sx={{ mb: 1, color: "#e57373" }}>
            {t("workspaces.dangerZone")}
          </Typography>
          <Button
            size="sm"
            color="danger"
            variant="outlined"
            onClick={() => setDeleteConfirm(true)}
          >
            {t("workspaces.deleteWorkspace")}
          </Button>
        </Box>

        {/* Remove member modal */}
        <Modal open={!!removeConfirm} onClose={() => setRemoveConfirm(null)}>
          <ModalDialog sx={{ minWidth: 400 }}>
            <ModalClose />
            <DialogTitle sx={{ fontWeight: 600 }}>{t("workspaces.removeMemberTitle")}</DialogTitle>
            <DialogContent>{t("workspaces.removeMemberConfirm")}</DialogContent>
            <DialogActions>
              <Button variant="solid" color="danger" onClick={handleRemove} loading={removing}>
                {t("workspaces.remove")}
              </Button>
              <Button variant="outlined" color="neutral" onClick={() => setRemoveConfirm(null)}>
                {t("workspaces.cancel")}
              </Button>
            </DialogActions>
          </ModalDialog>
        </Modal>

        {/* Delete workspace modal */}
        <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
          <ModalDialog sx={{ minWidth: 400 }}>
            <ModalClose />
            <DialogTitle sx={{ fontWeight: 600 }}>{t("workspaces.deleteConfirmTitle")}</DialogTitle>
            <DialogContent>{t("workspaces.deleteConfirmMessage", { name: workspace.name })}</DialogContent>
            <DialogActions>
              <Button variant="solid" color="danger" onClick={handleDelete} loading={deleting}>
                {t("workspaces.delete")}
              </Button>
              <Button variant="outlined" color="neutral" onClick={() => setDeleteConfirm(false)}>
                {t("workspaces.cancel")}
              </Button>
            </DialogActions>
          </ModalDialog>
        </Modal>
      </Box>
    </Box>
  );
}
