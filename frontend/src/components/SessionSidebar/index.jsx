import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useSocket } from "../../contexts/SocketContext";
import Typography from "@mui/joy/Typography";
import LinearProgress from "@mui/joy/LinearProgress";
import Skeleton from "@mui/joy/Skeleton";
import Tooltip from "@mui/joy/Tooltip";
import Button from "@mui/joy/Button";
import Box from "@mui/joy/Box";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import DataUsageOutlined from "@mui/icons-material/DataUsageOutlined";
import AttachMoneyOutlined from "@mui/icons-material/AttachMoneyOutlined";
import TerminalOutlined from "@mui/icons-material/TerminalOutlined";
import PublishOutlined from "@mui/icons-material/PublishOutlined";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import CommitPushModal from "../CommitPushModal";
import UserAvatar from "../UserAvatar";
import { useConversations } from "../../contexts/ConversationsContext";
import { useWorkspaces } from "../../contexts/WorkspacesContext";
import { usePanels } from "../../contexts/PanelContext";
import "./SessionSidebar.css";

const POLL_INTERVAL = 30000;
const STARTING_POLL_INTERVAL = 5000;

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 500;

const SessionSidebar = ({ conversationId }) => {
  const { t } = useTranslation('SessionSidebar');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [containerStatus, setContainerStatus] = useState(null);
  const [changedFiles, setChangedFiles] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [detailsPopoverOpen, setDetailsPopoverOpen] = useState(false);
  const [participantsPopoverOpen, setParticipantsPopoverOpen] = useState(false);
  const detailsPopoverTimeout = useRef(null);
  const participantsPopoverTimeout = useRef(null);
  const wrapperRef = useRef(null);
  const { socket } = useSocket();
  const { conversations } = useConversations();
  const { activeWorkspace } = useWorkspaces();
  const { sidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed } = usePanels();

  const conversationEnvStatus = conversations.find(
    (c) => c._id === conversationId,
  )?.environment?.status;
  const isContainerReady = conversationEnvStatus === "running";

  // Resize handling
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e) => {
      if (!wrapperRef.current) return;
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const newWidth = wrapperRect.right - e.clientX;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };
    const handleMouseUp = () => setIsResizing(false);
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
        api.getSessionInfo(activeWorkspace?._id, conversationId),
        api.getConversation(activeWorkspace?._id, conversationId),
      ]);
      if (info.status === "fulfilled") setSessionInfo(info.value);
      if (status.status === "fulfilled") {
        setContainerStatus(status.value?.environment);
        setParticipants(status.value?.participants || []);
        if (status.value?.environment?.status === "running") {
          const [filesRes] = await Promise.allSettled([api.getGitFiles(activeWorkspace?._id, conversationId)]);
          setChangedFiles(filesRes.status === "fulfilled" ? (filesRes.value.files || []) : []);
        } else {
          setChangedFiles([]);
        }
      }
    } catch (error) {
      console.error("Error fetching session data:", error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, activeWorkspace]);

  useEffect(() => {
    setLoading(true); setSessionInfo(null); setContainerStatus(null); fetchData();
  }, [conversationId, fetchData]);

  useEffect(() => {
    if (!conversationId || conversationId === "new") return;
    const isStarting = !containerStatus?.status || containerStatus.status === "starting";
    const interval = setInterval(fetchData, isStarting ? STARTING_POLL_INTERVAL : POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [conversationId, fetchData, containerStatus?.status]);

  useEffect(() => {
    if (!socket || !conversationId || conversationId === "new") return;
    const handleSessionInfo = (data) => {
      if (data.conversationId === conversationId) {
        setSessionInfo((prev) => ({ ...prev, contextUsage: data.contextUsage, cost: data.cost }));
      }
    };
    const handleJob = (data) => {
      if (data?.job?.queue === "conversations" && data?.job?.data?.conversationId === conversationId) fetchData();
    };
    socket.on("conversation.sessionInfo", handleSessionInfo);
    socket.on("job.completed", handleJob);
    socket.on("job.failed", handleJob);
    return () => {
      socket.off("conversation.sessionInfo", handleSessionInfo);
      socket.off("job.completed", handleJob);
      socket.off("job.failed", handleJob);
    };
  }, [socket, conversationId, fetchData]);

  const refresh = useCallback(() => fetchData(), [fetchData]);
  useEffect(() => { window.__sessionSidebarRefresh = refresh; return () => { if (window.__sessionSidebarRefresh === refresh) window.__sessionSidebarRefresh = null; }; }, [refresh]);

  const openDetailsPopover = () => { clearTimeout(detailsPopoverTimeout.current); setDetailsPopoverOpen(true); };
  const closeDetailsPopover = () => { detailsPopoverTimeout.current = setTimeout(() => setDetailsPopoverOpen(false), 150); };
  const openParticipantsPopover = () => { clearTimeout(participantsPopoverTimeout.current); setParticipantsPopoverOpen(true); };
  const closeParticipantsPopover = () => { participantsPopoverTimeout.current = setTimeout(() => setParticipantsPopoverOpen(false), 150); };

  if (!conversationId || conversationId === "new") return null;

  const envStatus = containerStatus?.status || "unknown";
  const isRunning = envStatus === "running";

  // Skeleton while container is not running
  if (!isContainerReady) {
    if (collapsed) {
      return (
        <div className="session-sidebar-wrapper collapsed" ref={wrapperRef}>
          <div className="session-sidebar-collapsed">
            <div className="session-collapsed-nav">
              {[0, 1, 2].map((i) => (
                <div key={i} className="session-collapsed-icon-btn">
                  <Skeleton variant="circular" width={20} height={20} />
                </div>
              ))}
            </div>
            <div className="session-collapsed-bottom">
              <div className="session-collapsed-icon-btn">
                <Skeleton variant="circular" width={20} height={20} />
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="session-sidebar-wrapper" ref={wrapperRef} style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <div className={`session-sidebar-resize-handle${isResizing ? " active" : ""}`} onMouseDown={() => setIsResizing(true)} />
        <div className="session-sidebar">
          <div className="session-sidebar-skeleton">
            <div className="session-sidebar-section"><Skeleton variant="circular" width={18} height={18} /><Skeleton variant="text" width="60%" /></div>
            <div className="session-sidebar-section"><Skeleton variant="circular" width={16} height={16} /><Skeleton variant="text" width="80%" /></div>
            <div className="session-sidebar-section"><Skeleton variant="circular" width={16} height={16} /><div className="session-sidebar-section-content"><Skeleton variant="rectangular" width="100%" height={6} sx={{ borderRadius: '3px' }} /><Skeleton variant="text" width="40%" /></div></div>
            <div className="session-sidebar-section"><Skeleton variant="circular" width={16} height={16} /><Skeleton variant="text" width="50%" /></div>
          </div>
          <div className="session-sidebar-bottom">
            <div className="session-sidebar-services">
              <Skeleton variant="text" width="40%" sx={{ mb: 0.5 }} />
              <div className="changed-files-list">
                {[0, 1, 2].map((i) => (<div key={i} className="changed-file-row"><Skeleton variant="text" width={30} /><Skeleton variant="text" width="70%" /></div>))}
              </div>
            </div>
            <Skeleton variant="rectangular" width="100%" height={34} sx={{ borderRadius: '8px' }} />
          </div>
        </div>
      </div>
    );
  }

  if (loading && !containerStatus) {
    return (
      <div className={`session-sidebar-wrapper${collapsed ? " collapsed" : ""}`} ref={wrapperRef} style={collapsed ? {} : { width: sidebarWidth, minWidth: sidebarWidth }}>
        <div className={`session-sidebar-resize-handle${isResizing ? " active" : ""}`} onMouseDown={() => setIsResizing(true)} />
        <div className="session-sidebar">
          <div className="session-sidebar-skeleton">
            <div className="session-sidebar-section"><Skeleton variant="circular" width={18} height={18} /><Skeleton variant="text" width="60%" /></div>
            <div className="session-sidebar-section"><Skeleton variant="circular" width={16} height={16} /><Skeleton variant="text" width="80%" /></div>
            <div className="session-sidebar-section"><Skeleton variant="circular" width={16} height={16} /><div className="session-sidebar-section-content"><Skeleton variant="rectangular" width="100%" height={6} sx={{ borderRadius: '3px' }} /><Skeleton variant="text" width="40%" /></div></div>
            <div className="session-sidebar-section"><Skeleton variant="circular" width={16} height={16} /><Skeleton variant="text" width="50%" /></div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Collapsed view ── */
  if (collapsed) {
    return (
      <div className="session-sidebar-wrapper collapsed" ref={wrapperRef}>
        <div className="session-sidebar-collapsed">
          <div className="session-collapsed-nav">
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
              <Tooltip title={sessionInfo ? t('contextPercent', { percent: sessionInfo.contextUsage.percent }) : t('context')} placement="left">
                <div className="session-collapsed-icon-btn">
                  <DataUsageOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
                </div>
              </Tooltip>
            )}
            {isRunning && (
              <Tooltip title={sessionInfo ? t('costValue', { value: sessionInfo.cost.total.toFixed(4) }) : t('cost')} placement="left">
                <div className="session-collapsed-icon-btn">
                  <AttachMoneyOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
                </div>
              </Tooltip>
            )}
            {participants.length > 0 && (
              <div className="session-collapsed-participants-wrapper" onMouseEnter={openParticipantsPopover} onMouseLeave={closeParticipantsPopover}>
                <div className="session-collapsed-icon-btn">
                  <GroupOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
                </div>
                {participantsPopoverOpen && (
                  <div className="session-collapsed-popover" onMouseEnter={openParticipantsPopover} onMouseLeave={closeParticipantsPopover}>
                    <div className="session-collapsed-popover-header"><span>{t('participants')}</span></div>
                    <div className="session-collapsed-popover-list">
                      {participants.map((p) => {
                        const name = p.profile?.display_name || p.account?.username || p.account?.email || "?";
                        return (
                          <div key={p._id} className="session-collapsed-participant-item">
                            <UserAvatar avatarFileId={p.profile?.avatar_fileId} fallbackName={name} size="sm" sx={{ width: 24, height: 24, fontSize: "0.65rem" }} />
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

          {isRunning && (
            <div className="session-collapsed-bottom">
              <div className="session-collapsed-changes-wrapper" onMouseEnter={openDetailsPopover} onMouseLeave={closeDetailsPopover}>
                <Tooltip title={t('changedFilesCount', { count: changedFiles.length })} placement="left">
                  <div className="session-collapsed-icon-btn">
                    <PublishOutlined sx={{ fontSize: 20, color: changedFiles.length > 0 ? "var(--joy-palette-success-600, #1b7d2c)" : "var(--text-tertiary)" }} />
                  </div>
                </Tooltip>
                {detailsPopoverOpen && changedFiles.length > 0 && (
                  <div className="session-collapsed-popover" onMouseEnter={openDetailsPopover} onMouseLeave={closeDetailsPopover}>
                    <div className="session-collapsed-popover-header"><span>{t('changedFiles')}</span></div>
                    <div className="session-collapsed-popover-list">
                      {changedFiles.map((file, i) => (
                        <div key={i} className="changed-file-row">
                          <span className="changed-file-stats">
                            {file.added > 0 && <span className="changed-file-added">+{file.added}</span>}
                            {file.deleted > 0 && <span className="changed-file-deleted">-{file.deleted}</span>}
                            {file.added === 0 && file.deleted === 0 && <span className="changed-file-neutral">~</span>}
                          </span>
                          <Tooltip title={file.filename} placement="left"><span className="changed-file-name">{file.filename.split("/").pop()}</span></Tooltip>
                        </div>
                      ))}
                    </div>
                    <div className="session-collapsed-popover-footer">
                      <Button size="sm" variant="soft" color="success" startDecorator={<PublishOutlined sx={{ fontSize: 16 }} />}
                        onClick={() => { setDetailsPopoverOpen(false); setCommitModalOpen(true); }}
                        sx={{ width: "100%", fontWeight: 600, fontSize: "0.8rem", py: 0.5, borderRadius: "6px" }}>
                        {t('concludeChange')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <CommitPushModal open={commitModalOpen} onClose={() => setCommitModalOpen(false)} conversationId={conversationId} />
      </div>
    );
  }

  /* ── Expanded view ── */
  return (
    <div className="session-sidebar-wrapper" ref={wrapperRef} style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
      <div className={`session-sidebar-resize-handle${isResizing ? " active" : ""}`} onMouseDown={() => setIsResizing(true)} />
      <div className="session-sidebar">
        <div className="session-sidebar-section">
          <Tooltip title={t('session')} placement="left"><TerminalOutlined sx={{ fontSize: 18, color: "text.tertiary" }} /></Tooltip>
          <Typography level="body-sm" sx={{ fontWeight: 500, wordBreak: "break-word" }}>{envStatus}</Typography>
        </div>

        <div className="session-sidebar-section">
          <Tooltip title={t('repository')} placement="left"><FolderOutlined sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }} /></Tooltip>
          <div className="session-sidebar-section-content">
            <Typography level="body-sm" sx={{ fontWeight: 500, wordBreak: "break-word" }}>{sessionInfo?.repoName || (loading ? "..." : "N/A")}</Typography>
          </div>
        </div>

        {isRunning && (
          <div className="session-sidebar-section">
            <Tooltip title={t('contextWindow')} placement="left"><DataUsageOutlined sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }} /></Tooltip>
            <div className="session-sidebar-section-content">
              {sessionInfo ? (
                <>
                  <LinearProgress determinate value={sessionInfo.contextUsage.percent}
                    color={sessionInfo.contextUsage.percent > 80 ? "danger" : sessionInfo.contextUsage.percent > 50 ? "warning" : "primary"} sx={{ my: 0.5 }} />
                  <div className="context-stats">
                    <Typography level="body-xs">{sessionInfo.contextUsage.percent}%</Typography>
                    <Typography level="body-xs" sx={{ color: "text.tertiary" }}>{formatTokens(sessionInfo.contextUsage.used)} / {formatTokens(sessionInfo.contextUsage.limit)}</Typography>
                  </div>
                </>
              ) : (
                <Typography level="body-xs" sx={{ color: "text.tertiary" }}>{loading ? "..." : t('noData')}</Typography>
              )}
            </div>
          </div>
        )}

        {isRunning && (
          <div className="session-sidebar-section">
            <Tooltip title={t('sessionCost')} placement="left"><AttachMoneyOutlined sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }} /></Tooltip>
            <div className="session-sidebar-section-content">
              <Typography level="body-sm" sx={{ fontWeight: 500, wordBreak: "break-word" }}>
                {sessionInfo ? `$${sessionInfo.cost.total.toFixed(4)}` : loading ? "..." : "$0.0000"}
              </Typography>
            </div>
          </div>
        )}

        {participants.length > 0 && (
          <div className="session-sidebar-section">
            <Tooltip title={t('participants')} placement="left"><GroupOutlined sx={{ fontSize: 16, color: "text.tertiary", mt: "2px" }} /></Tooltip>
            <div className="session-sidebar-section-content">
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {participants.map((p) => {
                  const name = p.profile?.display_name || p.account?.username || p.account?.email || "?";
                  return (
                    <Tooltip key={p._id} title={name} placement="bottom">
                      <span><UserAvatar avatarFileId={p.profile?.avatar_fileId} fallbackName={name} size="sm" sx={{ width: 24, height: 24, fontSize: "0.65rem" }} /></span>
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
                <Typography level="body-xs" sx={{ color: "text.tertiary", mb: 0.5, fontWeight: 600 }}>{t('changedFiles')}</Typography>
                <div className="changed-files-list">
                  {changedFiles.map((file, i) => (
                    <div key={i} className="changed-file-row">
                      <span className="changed-file-stats">
                        {file.added > 0 && <span className="changed-file-added">+{file.added}</span>}
                        {file.deleted > 0 && <span className="changed-file-deleted">-{file.deleted}</span>}
                        {file.added === 0 && file.deleted === 0 && <span className="changed-file-neutral">~</span>}
                      </span>
                      <Tooltip title={file.filename} placement="left"><span className="changed-file-name">{file.filename.split("/").pop()}</span></Tooltip>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button size="sm" variant="soft" color="success" startDecorator={<PublishOutlined sx={{ fontSize: 18 }} />}
              onClick={() => setCommitModalOpen(true)} disabled={changedFiles.length === 0}
              sx={{ width: "100%", justifyContent: "flex-start", fontWeight: 600, fontSize: "0.8rem", py: 0.75, px: 1.25, borderRadius: "8px", gap: 1 }}>
              {t('concludeChange')}
            </Button>
          </div>
        )}

        <CommitPushModal open={commitModalOpen} onClose={() => setCommitModalOpen(false)} conversationId={conversationId} />
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
