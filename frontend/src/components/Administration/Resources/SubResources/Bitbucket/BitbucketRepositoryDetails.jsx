import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  Card,
  CardContent,
  IconButton,
} from "@mui/joy";
import {
  Sync,
  Code,
  AccountTree,
  OpenInNew,
  Add,
  Delete as DeleteIcon,
  AutoAwesome,
  ChevronRight,
} from "@mui/icons-material";
import CircularProgress from "@mui/joy/CircularProgress";
import { api } from "../../../../../api/client";
import { useToast } from "../../../../../contexts/ToastContext";
import { useConfirm } from "../../../../../contexts/ConfirmContext";

/**
 * Repository (sub-resource) details.
 *
 * Runtime configuration (template, services, limits, skills) no longer lives
 * here: it belongs to Agents. This page shows the repository data and the
 * agents that work on it, with a shortcut to create a new one.
 */
function BitbucketRepositoryDetails({
  subResource,
  onDelete,
  deleting = false,
  deleteError = null,
  providerLabel = "Bitbucket",
}) {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const { data } = subResource;
  const toast = useToast();
  const confirm = useConfirm();
  const [syncing, setSyncing] = useState(false);
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        setLoadingAgents(true);
        const all = await api.getAdminAgents();
        setAgents(
          (all || []).filter(
            (a) => a.repository && String(a.repository) === String(subResource._id),
          ),
        );
      } catch (err) {
        console.error("Failed to load agents:", err);
      } finally {
        setLoadingAgents(false);
      }
    };
    loadAgents();
  }, [subResource._id]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await api.executeSubResourceAction(
        subResource.resource,
        subResource._id,
        "sync",
      );
      toast.success(t("bitbucketRepoDetails.syncStarted", { jobId: response.jobId }));
    } catch (error) {
      toast.error(
        t("bitbucketRepoDetails.failedToSync", {
          message: error.response?.data?.error || error.message,
        }),
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = await confirm({
      title: t("bitbucketRepoDetails.deleteSubresource"),
      message: t("bitbucketRepoDetails.deleteSubresourceConfirm"),
      confirmText: t("bitbucketRepoDetails.delete"),
      confirmColor: "danger",
    });
    if (!confirmed) return;
    await onDelete();
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

  const Field = ({ label, children }) => (
    <Box>
      <Typography level="body-sm" fontWeight="bold" sx={{ color: "var(--text-secondary)", mb: 0.5 }}>
        {label}
      </Typography>
      {typeof children === "string" ? (
        <Typography level="body-lg" sx={{ color: "var(--text-primary)" }}>{children}</Typography>
      ) : (
        children
      )}
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 900, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
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
            title={t("bitbucketRepoDetails.openInBitbucket")}
          >
            <OpenInNew />
          </IconButton>
        )}
        <Chip color="success" variant="soft" size="lg">
          {providerLabel} {t("bitbucketRepoDetails.repository")}
        </Chip>
        {data?.isPrivate && (
          <Chip color="warning" variant="soft" size="sm">
            {t("bitbucketRepoDetails.private")}
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
          {t("bitbucketRepoDetails.delete")}
        </Button>
      </Box>

      {deleteError && (
        <Typography level="body-sm" color="danger" sx={{ mb: 2 }}>
          {deleteError}
        </Typography>
      )}

      {/* Actions */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
            <Typography level="title-md" sx={{ color: "var(--text-primary)" }}>
              {t("bitbucketRepoDetails.actions")}
            </Typography>
            <Button
              variant="solid"
              color="primary"
              startDecorator={syncing ? <CircularProgress size="sm" /> : <Sync />}
              loading={syncing}
              onClick={handleSync}
            >
              {t("bitbucketRepoDetails.sync")}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Agents working on this repository */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <AutoAwesome sx={{ color: "var(--text-secondary)" }} />
              <Typography level="title-md" sx={{ color: "var(--text-primary)" }}>
                {t("bitbucketRepoDetails.agents")}
              </Typography>
            </Stack>
            <Button
              data-testid="create-agent-from-repo-btn"
              size="sm"
              variant="soft"
              color="primary"
              startDecorator={<Add />}
              onClick={() =>
                navigate(`/administration/agents/new?repository=${subResource._id}`)
              }
            >
              {t("bitbucketRepoDetails.createAgent")}
            </Button>
          </Stack>
          <Typography level="body-xs" sx={{ color: "var(--text-secondary)", mb: 2 }}>
            {t("bitbucketRepoDetails.agentsDescription")}
          </Typography>
          {loadingAgents ? (
            <CircularProgress size="sm" />
          ) : agents.length === 0 ? (
            <Typography level="body-md" sx={{ color: "var(--text-secondary)" }}>
              {t("bitbucketRepoDetails.noAgentsForRepo")}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {agents.map((agent) => (
                <Card
                  key={agent._id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    cursor: "pointer",
                    bgcolor: "var(--bg-primary)",
                    "&:hover": { borderColor: "var(--text-tertiary)" },
                  }}
                  onClick={() => navigate(`/administration/agents/${agent._id}`)}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Typography level="title-sm" sx={{ flex: 1, color: "var(--text-primary)" }}>
                      {agent.name}
                    </Typography>
                    <Chip size="sm" variant="soft" color={agent.enabled ? "success" : "neutral"}>
                      {agent.enabled
                        ? t("bitbucketRepoDetails.enabled")
                        : t("bitbucketRepoDetails.disabled")}
                    </Chip>
                    <ChevronRight sx={{ color: "var(--text-tertiary)" }} />
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Repository Details */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)", mb: 3 }}>
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2, color: "var(--text-primary)" }}>
            {t("bitbucketRepoDetails.repositoryDetails")}
          </Typography>
          <Stack spacing={2}>
            {data?.fullName && <Field label={t("bitbucketRepoDetails.fullName")}>{data.fullName}</Field>}
            {data?.description && <Field label={t("bitbucketRepoDetails.description")}>{data.description}</Field>}
            <Stack direction="row" spacing={4}>
              {data?.language && (
                <Field label={t("bitbucketRepoDetails.language")}>
                  <Chip color="primary" variant="soft" startDecorator={<Code />}>{data.language}</Chip>
                </Field>
              )}
              {data?.mainBranch && (
                <Field label={t("bitbucketRepoDetails.mainBranch")}>
                  <Chip color="neutral" variant="soft" startDecorator={<AccountTree />}>{data.mainBranch}</Chip>
                </Field>
              )}
              {data?.size && <Field label={t("bitbucketRepoDetails.size")}>{formatSize(data.size)}</Field>}
            </Stack>
            {data?.owner && (
              <Field label={t("bitbucketRepoDetails.owner")}>{data.owner.displayName || ""}</Field>
            )}
            {data?.project && (
              <Field label={t("bitbucketRepoDetails.project")}>{`${data.project.name} (${data.project.key})`}</Field>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card variant="outlined" sx={{ bgcolor: "var(--bg-secondary)" }}>
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2, color: "var(--text-primary)" }}>
            {t("bitbucketRepoDetails.metadata")}
          </Typography>
          <Stack spacing={2}>
            <Field label={t("bitbucketRepoDetails.created")}>
              {formatDate(data?.createdOn || subResource.createdAt)}
            </Field>
            <Field label={t("bitbucketRepoDetails.lastUpdated")}>
              {formatDate(data?.updatedOn || subResource.updatedAt)}
            </Field>
            {data?.lastSyncedAt && (
              <Field label={t("bitbucketRepoDetails.lastSynced")}>{formatDate(data.lastSyncedAt)}</Field>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default BitbucketRepositoryDetails;
