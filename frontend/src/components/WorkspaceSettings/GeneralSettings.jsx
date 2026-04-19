import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Input,
  Button,
  Divider,
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ModalClose,
} from "@mui/joy";
import { api } from "../../api/client";
import { useWorkspaces } from "../../contexts/WorkspacesContext";

export default function WorkspaceGeneralSettings() {
  const { t } = useTranslation("WorkspaceSettings");
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { updateWorkspace, deleteWorkspace } = useWorkspaces();

  const [name, setName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [workspace, setWorkspace] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const ws = await api.getWorkspace(workspaceId);
        setWorkspace(ws);
        setName(ws.name);
        setOriginalName(ws.name);
      } catch (err) {
        console.error("Error loading workspace:", err);
      }
    };
    load();
  }, [workspaceId]);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === originalName) return;
    setSaving(true);
    try {
      await updateWorkspace(workspaceId, { name: name.trim() });
      setOriginalName(name.trim());
    } catch (err) {
      console.error("Error updating workspace:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWorkspace(workspaceId);
      navigate("/");
    } catch (err) {
      console.error("Error deleting workspace:", err);
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  if (!workspace) return null;

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", p: 3, width: "100%" }}>
      <Typography level="h4" sx={{ mb: 3, color: "var(--text-primary)" }}>
        {t("general.title")}
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Typography
          level="title-sm"
          sx={{ mb: 1, color: "var(--text-secondary)" }}
        >
          {t("general.workspaceName")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="sm"
            sx={{ flex: 1 }}
            disabled={workspace.isPersonal}
          />
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={
              !name.trim() ||
              name.trim() === originalName ||
              workspace.isPersonal
            }
          >
            {t("general.save")}
          </Button>
        </Box>
        {workspace.isPersonal && (
          <Typography
            level="body-xs"
            sx={{ mt: 0.5, color: "var(--text-tertiary)" }}
          >
            {t("general.personalCannotEdit")}
          </Typography>
        )}
      </Box>

      {!workspace.isPersonal && (
        <>
          <Divider sx={{ my: 3 }} />
          <Box>
            <Typography
              level="title-sm"
              sx={{ mb: 1, color: "#e57373" }}
            >
              {t("general.dangerZone")}
            </Typography>
            <Typography
              level="body-sm"
              sx={{ mb: 1.5, color: "var(--text-secondary)" }}
            >
              {t("general.deleteWarning")}
            </Typography>
            <Button
              size="sm"
              color="danger"
              variant="outlined"
              onClick={() => setDeleteConfirm(true)}
            >
              {t("general.deleteWorkspace")}
            </Button>
          </Box>
        </>
      )}

      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
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
            {t("general.deleteConfirmTitle")}
          </DialogTitle>
          <DialogContent sx={{ color: "var(--text-secondary)" }}>
            {t("general.deleteConfirmMessage", { name: workspace.name })}
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="danger"
              onClick={handleDelete}
              loading={deleting}
            >
              {t("general.delete")}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setDeleteConfirm(false)}
            >
              {t("general.cancel")}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
