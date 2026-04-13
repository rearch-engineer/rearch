import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useSocket } from "../../contexts/SocketContext";
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
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import CommitPushModal from "../CommitPushModal";
import UserAvatar from "../UserAvatar";
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

const POLL_INTERVAL = 30000;
const STARTING_POLL_INTERVAL = 5000;

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 500;

const SessionSidebar = ({ conversationId }) => {
  const { t } = useTranslation('SessionSidebar');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [containerStatus, setContainerStatus] = useState(null);
  const [services, setServices] = useState([]);
  const [changedFiles, setChangedFiles] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [detailsPopoverOpen, setDetailsPopoverOpen] = useState(false);
  const [participantsPopoverOpen, setParticipantsPopoverOpen] = useState(false);
  const detailsPopoverTimeout = useRef(null);
  const participantsPopoverTimeout = useRef(null);
  const wrapperRef = useRef(null);
  const { socket } = useSocket();

  // Resize handling
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!wrapperRef.current) return;
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const newWidth = wrapperRect.right - e.clientX;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

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

  useEffect(() => {
    setLoading(true);
    setSessionInfo(null);
    setContainerStatus(null);
    fetchData();
  }, [conversationId, fetchData]);

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

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (window.__sessionSidebarRefresh) {
      window.__sessionSidebarRefresh = refresh;
    }
  }, [refresh]);

  window.__sessionSidebarRefresh = refresh;

  const openDetailsPopover = () => {
    clearTimeout(detailsPopoverTimeout.current);
    setDetailsPopoverOpen(true);
  };

  const closeDetailsPopover = () => {
    detailsPopoverTimeout.current = setTimeout(() => {
      setDetailsPopoverOpen(false);
    }, 150);
  };

  const openParticipantsPopover = () => {
    clearTimeout(participantsPopoverTimeout.current);
    setParticipantsPopoverOpen(true);
  };

  const closeParticipantsPopover = () => {
    participantsPopoverTimeout.current = setTimeout(() => {
      setParticipantsPopoverOpen(false);
    }, 150);
  };

  if (!conversationId || conversationId === "new") {
    return null;
  }

  const envStatus = containerStatus?.status || "unknown";
  const isRunning = envStatus === "running";

  if (loading && !containerStatus) {
    return (
      <div
        className={`session-sidebar-wrapper${collapsed ? " collapsed" : ""}`}
        ref={wrapperRef}
        style={collapsed ? {} : { width: sidebarWidth, minWidth: sidebarWidth }}
      >
        <div
          className={`session-sidebar-resize-handle${isResizing ? " active" : ""}`}
          onMouseDown={() => setIsResizing(true)}
        />
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
      </div>
    );
  }

  /* ── Collapsed view ── */
  if (collapsed) {
    return (
      <div
        className="session-sidebar-wrapper collapsed"
        ref={wrapperRef}
      >
        <div className="session-sidebar-collapsed">
          {/* Expand button — shows on hover, otherwise shows info icon */}
          <div className="session-collapsed-topbar">
            <div className="collapsed-topbar-toggle">
              <InfoOutlined
                className="collapsed-topbar-brand"
                sx={{ fontSize: 20, color: "var(--text-tertiary)" }}
              />
              <div
                className="main-menu-icon-btn collapsed-topbar-expand"
                onClick={() => setCollapsed(false)}
                title={t('expandSidebar')}
              >
                <ChevronLeftIcon sx={{ fontSize: 20 }} />
              </div>
            </div>
          </div>

          {/* Icon-only nav */}
          <div className="session-collapsed-nav">
            {services.length > 0 && isRunning && services.map((service, i) => (
              <Tooltip key={i} title={service.label} placement="left">
                <div
                  className="session-collapsed-icon-btn"
                  onClick={() => window.open(service.url, "_blank")}
                >
                  {getServiceIcon(service.icon)}
                </div>
              </Tooltip>
            ))}

            <Tooltip title={t('sessionStatus', { status: envStatus })} placement="left">
              <div className="session-collapsed-icon-btn">
                <TerminalOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
              </div>
            </Tooltip>

            <Tooltip title={sessionInfo?.repoName || t('repository')} placement="left">
              <div className="session-collapsed-icon-btn">
                <FolderOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
              </div>
            </Tooltip>

            {isRunning && (
              <Tooltip
                title={sessionInfo ? t('contextPercent', { percent: sessionInfo.contextUsage.percent }) : t('context')}
                placement="left"
              >
                <div className="session-collapsed-icon-btn">
                  <DataUsageOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
                </div>
              </Tooltip>
            )}

            {isRunning && (
              <Tooltip
                title={sessionInfo ? t('costValue', { value: sessionInfo.cost.total.toFixed(4) }) : t('cost')}
                placement="left"
              >
                <div className="session-collapsed-icon-btn">
                  <AttachMoneyOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
                </div>
              </Tooltip>
            )}

            {participants.length > 0 && (
              <div
                className="session-collapsed-participants-wrapper"
                onMouseEnter={openParticipantsPopover}
                onMouseLeave={closeParticipantsPopover}
              >
                <div className="session-collapsed-icon-btn">
                  <GroupOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
                </div>
                {participantsPopoverOpen && (
                  <div
                    className="session-collapsed-popover"
                    onMouseEnter={openParticipantsPopover}
                    onMouseLeave={closeParticipantsPopover}
                  >
                    <div className="session-collapsed-popover-header">
                      <span>{t('participants')}</span>
                    </div>
                    <div className="session-collapsed-popover-list">
                      {participants.map((p) => {
                        const name =
                          p.profile?.display_name ||
                          p.account?.username ||
                          p.account?.email ||
                          "?";
                        return (
                          <div key={p._id} className="session-collapsed-participant-item">
                            <UserAvatar
                              avatarFileId={p.profile?.avatar_fileId}
                              fallbackName={name}
                              size="sm"
                              sx={{ width: 24, height: 24, fontSize: "0.65rem" }}
                            />
                            <span>{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom: changed files popover + commit */}
          {isRunning && (
            <div className="session-collapsed-bottom">
              <div
                className="session-collapsed-changes-wrapper"
                onMouseEnter={openDetailsPopover}
                onMouseLeave={closeDetailsPopover}
              >
                <Tooltip title={t('changedFilesCount', { count: changedFiles.length })} placement="left">
                  <div className="session-collapsed-icon-btn">
                    <PublishOutlined sx={{ fontSize: 20, color: changedFiles.length > 0 ? "var(--joy-palette-success-600, #1b7d2c)" : "var(--text-tertiary)" }} />
                  </div>
                </Tooltip>

                {detailsPopoverOpen && changedFiles.length > 0 && (
                  <div
                    className="session-collapsed-popover"
                    onMouseEnter={openDetailsPopover}
                    onMouseLeave={closeDetailsPopover}
                  >
                    <div className="session-collapsed-popover-header">
                      <span>{t('changedFiles')}</span>
                    </div>
                    <div className="session-collapsed-popover-list">
                      {changedFiles.map((file, i) => (
                        <div key={i} className="changed-file-row">
                          <span className="changed-file-stats">
                            {file.added > 0 && (
                              <span className="changed-file-added">+{file.added}</span>
                            )}
                            {file.deleted > 0 && (
                              <span className="changed-file-deleted">-{file.deleted}</span>
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
                    <div className="session-collapsed-popover-footer">
                      <Button
                        size="sm"
                        variant="soft"
                        color="success"
                        startDecorator={<PublishOutlined sx={{ fontSize: 16 }} />}
                        onClick={() => {
                          setDetailsPopoverOpen(false);
                          setCommitModalOpen(true);
                        }}
                        sx={{
                          width: "100%",
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          py: 0.5,
                          borderRadius: "6px",
                        }}
                      >
                        {t('concludeChange')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <CommitPushModal
          open={commitModalOpen}
          onClose={() => setCommitModalOpen(false)}
          conversationId={conversationId}
        />
      </div>
    );
  }

  /* ── Expanded view ── */
  return (
    <div className="session-sidebar-wrapper" ref={wrapperRef} style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
      <div
        className="session-sidebar-collapse-btn main-menu-icon-btn"
        onClick={() => setCollapsed(true)}
        title={t('collapseSidebar')}
      >
        <ChevronRightIcon sx={{ fontSize: 20 }} />
      </div>
      <div
        className={`session-sidebar-resize-handle${isResizing ? " active" : ""}`}
        onMouseDown={() => setIsResizing(true)}
      />
    <div className="session-sidebar">
      {/* Service buttons */}
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
        <Tooltip title={t('session')} placement="left">
          <TerminalOutlined sx={{ fontSize: 18, color: "text.tertiary" }} />
        </Tooltip>
        <Typography
          level="body-sm"
          sx={{ fontWeight: 500, wordBreak: "break-word" }}
        >
          {envStatus}
        </Typography>
      </div>

      <div className="session-sidebar-section">
        <Tooltip title={t('repository')} placement="left">
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

      {isRunning && (
        <div className="session-sidebar-section">
          <Tooltip title={t('contextWindow')} placement="left">
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
                {loading ? "..." : t('noData')}
              </Typography>
            )}
          </div>
        </div>
      )}

      {isRunning && (
        <div className="session-sidebar-section">
          <Tooltip title={t('sessionCost')} placement="left">
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

      {participants.length > 0 && (
        <div className="session-sidebar-section">
          <Tooltip title={t('participants')} placement="left">
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

      {isRunning && (
        <div className="session-sidebar-bottom">
          {changedFiles.length > 0 && (
            <div className="session-sidebar-services">
              <Typography
                level="body-xs"
                sx={{ color: "text.tertiary", mb: 0.5, fontWeight: 600 }}
              >
                {t('changedFiles')}
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
            {t('concludeChange')}
          </Button>
        </div>
      )}

      <CommitPushModal
        open={commitModalOpen}
        onClose={() => setCommitModalOpen(false)}
        conversationId={conversationId}
      />
    </div>
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
