import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Input,
  Button,
  Table,
  Select,
  Option,
  IconButton,
  CircularProgress,
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ModalClose,
} from "@mui/joy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SearchIcon from "@mui/icons-material/Search";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

export default function WorkspaceMembersSettings() {
  const { t } = useTranslation("WorkspaceSettings");
  const { workspaceId } = useParams();
  const { user } = useAuth();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState(null);

  // Invite state
  const [showInvite, setShowInvite] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState(null);

  // Remove state
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [removing, setRemoving] = useState(false);

  const isWorkspaceAdmin = members.some(
    (m) => m.user?._id === user?.userId && m.role === "admin"
  );

  const loadMembers = useCallback(async () => {
    try {
      const [membersData, wsData] = await Promise.all([
        api.getWorkspaceMembers(workspaceId),
        api.getWorkspace(workspaceId),
      ]);
      setMembers(membersData);
      setWorkspace(wsData);
    } catch (err) {
      console.error("Error loading members:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await api.searchUsersForInvite(searchQuery.trim());
      const memberUserIds = new Set(members.map((m) => m.user?._id));
      // Filter out users who are already members
      setSearchResults(
        (data || []).filter((u) => !memberUserIds.has(u._id))
      );
    } catch (err) {
      console.error("Error searching users:", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (userId) => {
    setInviting(userId);
    try {
      await api.addWorkspaceMember(workspaceId, userId);
      await loadMembers();
      setSearchResults((prev) => prev.filter((u) => u._id !== userId));
    } catch (err) {
      console.error("Error inviting member:", err);
    } finally {
      setInviting(null);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.updateWorkspaceMember(workspaceId, userId, { role: newRole });
      setMembers((prev) =>
        prev.map((m) =>
          m.user?._id === userId ? { ...m, role: newRole } : m
        )
      );
    } catch (err) {
      console.error("Error changing role:", err);
    }
  };

  const handleRemove = async () => {
    if (!removeConfirm) return;
    setRemoving(true);
    try {
      await api.removeWorkspaceMember(workspaceId, removeConfirm);
      setMembers((prev) =>
        prev.filter((m) => m.user?._id !== removeConfirm)
      );
    } catch (err) {
      console.error("Error removing member:", err);
    } finally {
      setRemoving(false);
      setRemoveConfirm(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", p: 3, width: "100%" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography level="h4" sx={{ color: "var(--text-primary)" }}>
          {t("members.title")}
        </Typography>
        {isWorkspaceAdmin && !workspace?.isPersonal && (
          <Button
            size="sm"
            startDecorator={<PersonAddIcon />}
            onClick={() => setShowInvite(!showInvite)}
          >
            {t("members.invite")}
          </Button>
        )}
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
          <Typography
            level="title-sm"
            sx={{ mb: 1, color: "var(--text-secondary)" }}
          >
            {t("members.searchUsers")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
            <Input
              size="sm"
              placeholder={t("members.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              sx={{ flex: 1 }}
              startDecorator={<SearchIcon sx={{ fontSize: 16 }} />}
            />
            <Button
              size="sm"
              onClick={handleSearch}
              loading={searching}
              variant="outlined"
            >
              {t("members.search")}
            </Button>
          </Box>
          {searchResults.length > 0 && (
            <Box sx={{ mt: 1 }}>
              {searchResults.map((u) => (
                <Box
                  key={u._id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    py: 0.75,
                    px: 1,
                    borderRadius: "4px",
                    "&:hover": { bgcolor: "var(--bg-hover)" },
                  }}
                >
                  <Box>
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-primary)" }}
                    >
                      {u.profile?.display_name || u.account?.username}
                    </Typography>
                    <Typography
                      level="body-xs"
                      sx={{ color: "var(--text-tertiary)" }}
                    >
                      {u.account?.email}
                    </Typography>
                  </Box>
                  <Button
                    size="sm"
                    variant="soft"
                    loading={inviting === u._id}
                    onClick={() => handleInvite(u._id)}
                  >
                    {t("members.add")}
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      <Table
        size="sm"
        sx={{
          "& th": {
            color: "var(--text-tertiary)",
            fontWeight: 600,
            fontSize: 12,
          },
        }}
      >
        <thead>
          <tr>
            <th>{t("members.user")}</th>
            <th>{t("members.email")}</th>
            <th style={{ width: 120 }}>{t("members.role")}</th>
            {isWorkspaceAdmin && <th style={{ width: 60 }}></th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.user?._id || member._id}>
              <td>
                <Typography
                  level="body-sm"
                  sx={{ color: "var(--text-primary)" }}
                >
                  {member.user?.profile?.display_name ||
                    member.user?.account?.username ||
                    "\u2014"}
                </Typography>
              </td>
              <td>
                <Typography
                  level="body-xs"
                  sx={{ color: "var(--text-secondary)" }}
                >
                  {member.user?.account?.email || "\u2014"}
                </Typography>
              </td>
              <td>
                {isWorkspaceAdmin &&
                member.user?._id !== user?.userId ? (
                  <Select
                    size="sm"
                    value={member.role}
                    onChange={(e, val) =>
                      handleRoleChange(member.user?._id, val)
                    }
                    sx={{ minWidth: 100 }}
                  >
                    <Option value="admin">{t("members.admin")}</Option>
                    <Option value="member">{t("members.member")}</Option>
                  </Select>
                ) : (
                  <Typography
                    level="body-xs"
                    sx={{
                      color: "var(--text-secondary)",
                      textTransform: "capitalize",
                    }}
                  >
                    {member.role}
                  </Typography>
                )}
              </td>
              {isWorkspaceAdmin && (
                <td>
                  {member.user?._id !== user?.userId && (
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() =>
                        setRemoveConfirm(member.user?._id)
                      }
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        open={!!removeConfirm}
        onClose={() => setRemoveConfirm(null)}
      >
        <ModalDialog
          variant="outlined"
          sx={{
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            maxWidth: 420,
          }}
        >
          <ModalClose />
          <DialogTitle
            sx={{ color: "var(--text-primary)", fontWeight: 600 }}
          >
            {t("members.removeTitle")}
          </DialogTitle>
          <DialogContent sx={{ color: "var(--text-secondary)" }}>
            {t("members.removeConfirm")}
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="danger"
              onClick={handleRemove}
              loading={removing}
            >
              {t("members.remove")}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setRemoveConfirm(null)}
            >
              {t("members.cancel")}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
