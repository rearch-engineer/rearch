import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useSocket } from "../contexts/SocketContext";
import Typography from "@mui/joy/Typography";
import LinearProgress from "@mui/joy/LinearProgress";
import CircularProgress from "@mui/joy/CircularProgress";
import Divider from "@mui/joy/Divider";
import Chip from "@mui/joy/Chip";
import Tooltip from "@mui/joy/Tooltip";
import IconButton from "@mui/joy/IconButton";
import Button from "@mui/joy/Button";
import Box from "@mui/joy/Box";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import DataUsageOutlined from "@mui/icons-material/DataUsageOutlined";
import AttachMoneyOutlined from "@mui/icons-material/AttachMoneyOutlined";
import TerminalOutlined from "@mui/icons-material/TerminalOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import WebOutlined from "@mui/icons-material/WebOutlined";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import PublishOutlined from "@mui/icons-material/PublishOutlined";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import ApiOutlined from "@mui/icons-material/ApiOutlined";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";
import BrushOutlined from "@mui/icons-material/BrushOutlined";
import CommitPushModal from "./CommitPushModal";
import UserAvatar from "./UserAvatar";
import "./SessionSidebar.css";

/**
 * Maps icon id strings (stored on SubResource.rearch.services[].icon) to MUI components.
 * Keep in sync with AVAILABLE_ICONS in BitbucketRepositoryDetails.jsx.
 */
const ICON_MAP = {
  Code: CodeOutlined,
  Web: WebOutlined,
  Storage: StorageOutlined,
  Api: ApiOutlined,
  AI: SmartToyOutlined,
  Design: BrushOutlined,
  Terminal: TerminalOutlined,
  Widgets: WidgetsOutlined,
};

const getServiceIcon = (iconName) => {
  const IconComponent = ICON_MAP[iconName] || OpenInNewOutlined;
  return <IconComponent sx={{ fontSize: 18 }} />;
};

const POLL_INTERVAL = 30000; // 30 seconds (reduced from 10s since we now get real-time pushes)
const STARTING_POLL_INTERVAL = 5000; // 5 seconds while container is starting

const SessionSidebar = ({ conversationId }) => {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [containerStatus, setContainerStatus] = useState(null);
  const [services, setServices] = useState([]);
  const [changedFiles, setChangedFiles] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const { socket } = useSocket();

  const fetchData = useCallback(async () => {
    if (!conversationId || conversationId === "new") return;

    try {
      const [info, status] = await Promise.allSettled([
        api.getSessionInfo(conversationId),
        api.getConversation(conversationId),
      ]);

      if (info.status === "fulfilled") {
        setSessionInfo(info.value);
      }
      if (status.status === "fulfilled") {
        setContainerStatus(status.value?.environment);
        setParticipants(status.value?.participants || []);

        // Fetch services and changed files only when container is running
        if (status.value?.environment?.status === "running") {
          const [servicesRes, filesRes] = await Promise.allSettled([
            api.getServices(conversationId),
            api.getGitFiles(conversationId),
          ]);
          if (servicesRes.status === "fulfilled") {
            setServices(servicesRes.value.services || []);
          } else {
            setServices([]);
          }
          if (filesRes.status === "fulfilled") {
            setChangedFiles(filesRes.value.files || []);
          } else {
            setChangedFiles([]);
          }
        } else {
          setServices([]);
          setChangedFiles([]);
        }
      }
    } catch (error) {
      console.error("Error fetching session data:", error);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    setSessionInfo(null);
    setContainerStatus(null);
    fetchData();
  }, [conversationId, fetchData]);

  // Polling — use a shorter interval while the container is still starting
  useEffect(() => {
    if (!conversationId || conversationId === "new") return;

    const isStarting =
      !containerStatus?.status || containerStatus.status === "starting";
    const interval = setInterval(
      fetchData,
      isStarting ? STARTING_POLL_INTERVAL : POLL_INTERVAL,
    );
    return () => clearInterval(interval);
  }, [conversationId, fetchData, containerStatus?.status]);

  // Real-time updates via Socket.IO
  useEffect(() => {
    if (!socket || !conversationId || conversationId === "new") return;

    const handleSessionInfo = (data) => {
      if (data.conversationId === conversationId) {
        setSessionInfo((prev) => ({
          ...prev,
          contextUsage: data.contextUsage,
          cost: data.cost,
        }));
      }
    };

    // Listen for job completion events to detect container status changes
    const handleJobCompleted = (data) => {
      if (
        data?.job?.queue === "conversations" &&
        data?.job?.data?.conversationId === conversationId
      ) {
        fetchData();
      }
    };

    const handleJobFailed = (data) => {
      if (
        data?.job?.queue === "conversations" &&
        data?.job?.data?.conversationId === conversationId
      ) {
        fetchData();
      }
    };

    socket.on("conversation.sessionInfo", handleSessionInfo);
    socket.on("job.completed", handleJobCompleted);
    socket.on("job.failed", handleJobFailed);

    return () => {
      socket.off("conversation.sessionInfo", handleSessionInfo);
      socket.off("job.completed", handleJobCompleted);
      socket.off("job.failed", handleJobFailed);
    };
  }, [socket, conversationId, fetchData]);

  // Expose refresh method via ref-based counter (called by parent after messages)
  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Make refresh accessible to parent
  useEffect(() => {
    if (window.__sessionSidebarRefresh) {
      window.__sessionSidebarRefresh = refresh;
    }
  }, [refresh]);

  // Store refresh on window for parent to call
  window.__sessionSidebarRefresh = refresh;

  if (!conversationId || conversationId === "new") {
    return null;
  }

  const envStatus = containerStatus?.status || "unknown";
  const isRunning = envStatus === "running";

  if (loading && !containerStatus) {
    return (
      <div className="session-sidebar">
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            py: 3,
          }}
        >
          <CircularProgress size="sm" />
        </Box>
      </div>
    );
  }

  return (
    <div className="session-sidebar">
      {/* Service buttons — square, horizontal, above everything */}
      {services.length > 0 && isRunning && (
        <div className="session-sidebar-service-buttons">
          {services.map((service, index) => (
            <Tooltip
              key={`${service.label}-${index}`}
              title={service.label}
              placement="bottom"
            >
              <IconButton
                size="sm"
                variant="outlined"
                color="neutral"
                onClick={() => window.open(service.url, "_blank")}
                className="session-sidebar-service-btn"
              >
                {getServiceIcon(service.icon)}
              </IconButton>
            </Tooltip>
          ))}
        </div>
      )}

      <div className="session-sidebar-section">
        <Tooltip title="Session" placement="left">
          <TerminalOutlined sx={{ fontSize: 18, color: "text.tertiary" }} />
        </Tooltip>
        <Typography
          level="body-sm"
          sx={{ fontWeight: 500, wordBreak: "break-word" }}
        >
          {envStatus}
        </Typography>
      </div>

      {/* Repository name */}
      <div className="session-sidebar-section">
        <Tooltip title="Repository" placement="left">
          <FolderOutlined
            sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }}
          />
        </Tooltip>
        <div className="session-sidebar-section-content">
          <Typography
            level="body-sm"
            sx={{ fontWeight: 500, wordBreak: "break-word" }}
          >
            {sessionInfo?.repoName || (loading ? "..." : "N/A")}
          </Typography>
        </div>
      </div>

      {/* Context window usage — only when running */}
      {isRunning && (
        <div className="session-sidebar-section">
          <Tooltip title="Context Window" placement="left">
            <DataUsageOutlined
              sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }}
            />
          </Tooltip>
          <div className="session-sidebar-section-content">
            {sessionInfo ? (
              <>
                <LinearProgress
                  determinate
                  value={sessionInfo.contextUsage.percent}
                  color={
                    sessionInfo.contextUsage.percent > 80
                      ? "danger"
                      : sessionInfo.contextUsage.percent > 50
                        ? "warning"
                        : "primary"
                  }
                  sx={{ my: 0.5 }}
                />
                <div className="context-stats">
                  <Typography level="body-xs">
                    {sessionInfo.contextUsage.percent}%
                  </Typography>
                  <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                    {formatTokens(sessionInfo.contextUsage.used)} /{" "}
                    {formatTokens(sessionInfo.contextUsage.limit)}
                  </Typography>
                </div>
              </>
            ) : (
              <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                {loading ? "..." : "No data"}
              </Typography>
            )}
          </div>
        </div>
      )}

      {/* Session cost — only when running */}
      {isRunning && (
        <div className="session-sidebar-section">
          <Tooltip title="Session Cost" placement="left">
            <AttachMoneyOutlined
              sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }}
            />
          </Tooltip>
          <div className="session-sidebar-section-content">
            <Typography
              level="body-sm"
              sx={{ fontWeight: 500, wordBreak: "break-word" }}
            >
              {sessionInfo
                ? `$${sessionInfo.cost.total.toFixed(4)}`
                : loading
                  ? "..."
                  : "$0.0000"}
            </Typography>
          </div>
        </div>
      )}

      {/* Participants */}
      {participants.length > 0 && (
        <div className="session-sidebar-section">
          <Tooltip title="Participants" placement="left">
            <GroupOutlined
              sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }}
            />
          </Tooltip>
          <div className="session-sidebar-section-content">
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {participants.map((p) => {
                const name =
                  p.profile?.display_name ||
                  p.account?.username ||
                  p.account?.email ||
                  "?";
                return (
                  <Tooltip key={p._id} title={name} placement="bottom">
                    <span>
                      <UserAvatar
                        avatarFileId={p.profile?.avatar_fileId}
                        fallbackName={name}
                        size="sm"
                        sx={{ width: 24, height: 24, fontSize: "0.65rem" }}
                      />
                    </span>
                  </Tooltip>
                );
              })}
            </Box>
          </div>
        </div>
      )}

      {/* Bottom section: Changed files + Commit & Push */}
      {isRunning && (
        <div className="session-sidebar-bottom">
          {/* Changed files */}
          {changedFiles.length > 0 && (
            <div className="session-sidebar-services">
              <Typography
                level="body-xs"
                sx={{ color: "text.tertiary", mb: 0.5, fontWeight: 600 }}
              >
                Changed files
              </Typography>
              <div className="changed-files-list">
                {changedFiles.map((file, i) => (
                  <div key={i} className="changed-file-row">
                    <span className="changed-file-stats">
                      {file.added > 0 && (
                        <span className="changed-file-added">
                          +{file.added}
                        </span>
                      )}
                      {file.deleted > 0 && (
                        <span className="changed-file-deleted">
                          -{file.deleted}
                        </span>
                      )}
                      {file.added === 0 && file.deleted === 0 && (
                        <span className="changed-file-neutral">~</span>
                      )}
                    </span>
                    <Tooltip title={file.filename} placement="left">
                      <span className="changed-file-name">
                        {file.filename.split("/").pop()}
                      </span>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commit & Push action */}
          <Button
            size="sm"
            variant="soft"
            color="success"
            startDecorator={<PublishOutlined sx={{ fontSize: 18 }} />}
            onClick={() => setCommitModalOpen(true)}
            disabled={changedFiles.length === 0}
            sx={{
              width: "100%",
              justifyContent: "flex-start",
              fontWeight: 600,
              fontSize: "0.8rem",
              py: 0.75,
              px: 1.25,
              borderRadius: "8px",
              gap: 1,
            }}
          >
            Conclude change
          </Button>
        </div>
      )}

      {/* Commit & Push Modal */}
      <CommitPushModal
        open={commitModalOpen}
        onClose={() => setCommitModalOpen(false)}
        conversationId={conversationId}
      />
    </div>
  );
};

function formatTokens(count) {
  if (!count || count === 0) return "0";
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default SessionSidebar;
