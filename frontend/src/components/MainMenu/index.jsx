import React, { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import Dropdown from "@mui/joy/Dropdown";
import Menu from "@mui/joy/Menu";
import MenuButton from "@mui/joy/MenuButton";
import MenuItem from "@mui/joy/MenuItem";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import CircularProgress from "@mui/joy/CircularProgress";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import DialogTitle from "@mui/joy/DialogTitle";
import DialogContent from "@mui/joy/DialogContent";
import DialogActions from "@mui/joy/DialogActions";
import Button from "@mui/joy/Button";
import ModalClose from "@mui/joy/ModalClose";
import Input from "@mui/joy/Input";

import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ForumIcon from "@mui/icons-material/Forum";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LogoutIcon from "@mui/icons-material/Logout";
import ListDivider from "@mui/joy/ListDivider";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import PersonAddIcon from "@mui/icons-material/PersonAdd";

import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import ButtonGroup from "@mui/joy/ButtonGroup";
import WorkspacesIcon from "@mui/icons-material/Workspaces";
import { useAuth } from "../../contexts/AuthContext";
import { useConversations } from "../../contexts/ConversationsContext";
import { useWorkspaces } from "../../contexts/WorkspacesContext";
import { api } from "../../api/client";
import AdminSidebarMenu from "../Administration/AdminSidebarMenu";
import AccountSidebarMenu from "../Account/AccountSidebarMenu";

import "./MainMenu.css";

const timeAgo = (date) => {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  if (diff < 30 * 86400) return `${Math.floor(diff / (7 * 86400))}w`;
  return `${Math.floor(diff / (30 * 86400))}mo`;
};

const ConversationStatusIndicator = ({
  conv,
  busyConversationIds,
  unreadConversationIds,
}) => {
  const envStatus = conv.environment?.status;

  if (envStatus === "starting") {
    return (
      <CircularProgress
        size="sm"
        sx={{
          "--CircularProgress-size": "12px",
          "--CircularProgress-trackThickness": "2px",
          "--CircularProgress-progressThickness": "2px",
          flexShrink: 0,
        }}
      />
    );
  }

  if (envStatus === "error") {
    return (
      <WarningAmberIcon
        sx={{ fontSize: 14, color: "#e57373", flexShrink: 0 }}
      />
    );
  }

  if (envStatus === "running") {
    const isUnread = unreadConversationIds.has(conv._id);
    return (
      <span className={`conv-status-dot running${isUnread ? " blink" : ""}`} />
    );
  }

  // stopped or unknown
  return <span className="conv-status-dot stopped" />;
};

const MainMenu = () => {
  const { t } = useTranslation("MainMenu");
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, user, logout } = useAuth();
  const {
    conversations,
    busyConversationIds,
    unreadConversationIds,
    handleDeleteConversation,
    handleRenameConversation,
    markRead,
  } = useConversations();
  const { workspaces, activeWorkspace, setActiveWorkspace, createWorkspace, updateWorkspace, deleteWorkspace } = useWorkspaces();

  const isOnAdministration = location.pathname.startsWith("/administration");
  const isOnAccount = location.pathname.startsWith("/account");

  const [collapsed, setCollapsed] = useState(false);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [createWsName, setCreateWsName] = useState("");
  const [createWsLoading, setCreateWsLoading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [convPopoverOpen, setConvPopoverOpen] = useState(false);
  const convPopoverTimeout = useRef(null);
  const renameInputRef = useRef(null);

  // Invite members modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteList, setInviteList] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [existingMembers, setExistingMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [renamingWs, setRenamingWs] = useState(false);
  const [renameWsValue, setRenameWsValue] = useState("");
  const [deleteWsConfirm, setDeleteWsConfirm] = useState(null);
  const [deleteWsLoading, setDeleteWsLoading] = useState(false);
  const [isWsAdmin, setIsWsAdmin] = useState(false);
  const [wsActionMenu, setWsActionMenu] = useState({ anchorEl: null, wsId: null });
  const wsSelectorRef = useRef(null);

  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }, []);

  const onSelectConversation = (id) => {
    markRead(id);
    navigate(`/conversations/${id}`);
  };

  const onNewConversation = () => {
    navigate("/conversations/new");
  };

  const onRequestDelete = (id) => {
    setDeleteConfirm(id);
  };

  const onConfirmDelete = () => {
    if (deleteConfirm) {
      handleDeleteConversation(deleteConfirm);
      if (location.pathname === `/conversations/${deleteConfirm}`) {
        navigate("/");
      }
    }
    setDeleteConfirm(null);
  };

  const onStartRename = (id, currentTitle) => {
    setRenameValue(currentTitle);
    setTimeout(() => {
      setRenamingId(id);
    }, 0);
  };

  const onConfirmRename = (id) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conversations.find((c) => c._id === id)?.title) {
      handleRenameConversation(id, trimmed);
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const onCancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const onCreateWorkspace = async () => {
    const trimmed = createWsName.trim();
    if (!trimmed) return;
    setCreateWsLoading(true);
    try {
      const newWs = await createWorkspace(trimmed);
      setActiveWorkspace(newWs);
      setCreateWsOpen(false);
      setCreateWsName("");
    } catch (err) {
      console.error("Error creating workspace:", err);
    } finally {
      setCreateWsLoading(false);
    }
  };

  const loadWorkspaceMembers = useCallback(async () => {
    if (!activeWorkspace) return;
    setMembersLoading(true);
    try {
      const members = await api.getWorkspaceMembers(activeWorkspace._id);
      setExistingMembers(members);
    } catch (err) {
      console.error("Error loading workspace members:", err);
    } finally {
      setMembersLoading(false);
    }
  }, [activeWorkspace]);

  const openInviteModal = useCallback(() => {
    setInviteOpen(true);
    loadWorkspaceMembers();
  }, [loadWorkspaceMembers]);

  const onAddInviteEmail = () => {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!trimmed) return;
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    // Check against both new invites and existing members
    if (inviteList.some((item) => item.email === trimmed)) return;
    if (existingMembers.some((m) => m.user?.account?.email?.toLowerCase() === trimmed)) return;
    setInviteList((prev) => [...prev, { email: trimmed, role: "user" }]);
    setInviteEmail("");
  };

  const onRemoveInviteEmail = (email) => {
    setInviteList((prev) => prev.filter((item) => item.email !== email));
  };

  const onChangeInviteRole = (email, role) => {
    setInviteList((prev) =>
      prev.map((item) => (item.email === email ? { ...item, role } : item))
    );
  };

  const onSubmitInvites = async () => {
    if (inviteList.length === 0 || !activeWorkspace) return;
    setInviteLoading(true);
    try {
      await api.inviteWorkspaceMembersByEmail(activeWorkspace._id, inviteList);
      setInviteOpen(false);
      setInviteList([]);
      setInviteEmail("");
    } catch (err) {
      console.error("Error inviting members:", err);
    } finally {
      setInviteLoading(false);
    }
  };

  // Check if current user is admin of active workspace
  const checkWsAdmin = useCallback(async () => {
    if (!activeWorkspace || activeWorkspace.isPersonal) {
      setIsWsAdmin(false);
      return;
    }
    try {
      const members = await api.getWorkspaceMembers(activeWorkspace._id);
      const me = members.find((m) => m.user?._id === user?.userId);
      setIsWsAdmin(me?.role === "admin");
    } catch {
      setIsWsAdmin(false);
    }
  }, [activeWorkspace, user]);

  React.useEffect(() => {
    checkWsAdmin();
  }, [checkWsAdmin]);

  const onStartRenameWs = (wsId) => {
    const ws = workspaces.find(w => w._id === wsId);
    if (!ws) return;
    setRenameWsValue(ws.name);
    setRenamingWs(wsId);
  };

  const onConfirmRenameWs = async () => {
    const trimmed = renameWsValue.trim();
    const ws = workspaces.find(w => w._id === renamingWs);
    if (trimmed && ws && trimmed !== ws.name) {
      try {
        await updateWorkspace(renamingWs, { name: trimmed });
      } catch (err) {
        console.error("Error renaming workspace:", err);
      }
    }
    setRenamingWs(null);
    setRenameWsValue("");
  };

  const onConfirmDeleteWs = async () => {
    if (!deleteWsConfirm) return;
    setDeleteWsLoading(true);
    try {
      // Delete all conversations in this workspace
      const wsConversations = conversations.filter(
        (c) => c.workspace === deleteWsConfirm
      );
      await Promise.all(
        wsConversations.map((c) => handleDeleteConversation(c._id))
      );
      await deleteWorkspace(deleteWsConfirm);
      navigate("/");
    } catch (err) {
      console.error("Error deleting workspace:", err);
    } finally {
      setDeleteWsLoading(false);
      setDeleteWsConfirm(null);
    }
  };

  const openConvPopover = () => {
    clearTimeout(convPopoverTimeout.current);
    setConvPopoverOpen(true);
  };

  const closeConvPopover = () => {
    convPopoverTimeout.current = setTimeout(() => {
      setConvPopoverOpen(false);
    }, 150);
  };

  return (
    <div className={`main-menu${collapsed ? " collapsed" : ""}`}>
      {/* ── Top bar: brand + actions ── */}
      <div className="main-menu-topbar">
        {collapsed ? (
          <>
            <div className="collapsed-topbar-toggle">
              <ForumIcon
                className="collapsed-topbar-brand"
                sx={{ fontSize: 22, color: "#DB4F15", cursor: "pointer" }}
                onClick={() => navigate("/")}
              />
              <div
                className="main-menu-icon-btn collapsed-topbar-expand"
                onClick={() => setCollapsed(false)}
                title={t("expandSidebar")}
              >
                <ChevronRightIcon sx={{ fontSize: 20 }} />
              </div>
            </div>
            <div
              className="main-menu-icon-btn"
              onClick={openCommandPalette}
              title={t("searchShortcut")}
              style={{ marginTop: 4 }}
            >
              <SearchIcon sx={{ fontSize: 20 }} />
            </div>
          </>
        ) : (
          <>
            <span className="main-menu-brand" onClick={() => navigate("/")}>
              <ForumIcon
                className="main-menu-brand-logo"
                sx={{ fontSize: 22, verticalAlign: "middle", color: "#DB4F15" }}
              />
              ReArch
            </span>
            <div className="main-menu-topbar-actions">
              <div
                className="main-menu-icon-btn"
                onClick={openCommandPalette}
                title={t("searchShortcut")}
              >
                <SearchIcon sx={{ fontSize: 20 }} />
              </div>
              <div
                className="main-menu-icon-btn"
                onClick={() => setCollapsed(true)}
                title={t("collapseSidebar")}
              >
                <ChevronLeftIcon sx={{ fontSize: 20 }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Nav items ── */}
      <div className="main-menu-nav">
        <div
          className="main-menu-nav-item"
          onClick={onNewConversation}
          title={t("newConversation")}
        >
          <AddIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
          {!collapsed && <span>{t("newConversation")}</span>}
        </div>
      </div>

      {/* ── Contextual content area ── */}
      {collapsed ? (
        /* Collapsed: conversations icon with hover popover */
        <div className="collapsed-nav-icons">
          <div
            className={`main-menu-nav-item`}
            title={activeWorkspace?.name || t("workspace")}
            onClick={() => setCollapsed(false)}
          >
            <WorkspacesIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
          </div>
          <div
            className="collapsed-conv-wrapper"
            onMouseEnter={openConvPopover}
            onMouseLeave={closeConvPopover}
          >
            <div
              className={`main-menu-nav-item${location.pathname.startsWith("/conversations") ? " active" : ""}`}
              title={t("conversations")}
            >
              <ChatBubbleOutlineIcon
                sx={{ fontSize: 20, color: "var(--text-tertiary)" }}
              />
            </div>
            {convPopoverOpen && (
              <div
                className="collapsed-conv-popover"
                onMouseEnter={openConvPopover}
                onMouseLeave={closeConvPopover}
              >
                {activeWorkspace && (
                <div className="collapsed-conv-popover-workspace">
                  <WorkspacesIcon sx={{ fontSize: 14, color: "var(--text-tertiary)" }} />
                  <span>{activeWorkspace.name}</span>
                </div>
              )}
              <div className="collapsed-conv-popover-header">
                  <span>{t("conversations")}</span>
                  <div
                    className="main-menu-section-action"
                    onClick={onNewConversation}
                    title={t("newConversation")}
                  >
                    <AddIcon sx={{ fontSize: 16 }} />
                  </div>
                </div>
                <div className="collapsed-conv-popover-list">
                  {conversations.length === 0 ? (
                    <></>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv._id}
                        className={`collapsed-conv-popover-item${location.pathname === `/conversations/${conv._id}` ? " active" : ""}`}
                        onClick={() => {
                          onSelectConversation(conv._id);
                          setConvPopoverOpen(false);
                        }}
                      >
                        <div className="collapsed-conv-popover-item-row">
                          <ConversationStatusIndicator
                            conv={conv}
                            busyConversationIds={busyConversationIds}
                            unreadConversationIds={unreadConversationIds}
                          />
                          <div className="conversation-title">{conv.title}</div>
                        </div>
                        <div className="conversation-meta">
                          {conv.updatedAt && (
                            <span>{timeAgo(conv.updatedAt)}</span>
                          )}
                          {conv.subResource?.name && (
                            <>
                              <span className="conversation-meta-sep">·</span>
                              <span className="conversation-meta-repo">
                                {conv.subResource.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : isOnAdministration ? (
        <AdminSidebarMenu />
      ) : isOnAccount ? (
        <AccountSidebarMenu />
      ) : (
        <div className="conversations">
          <div className="workspace-selector">
            <Dropdown>
              <MenuButton
                ref={wsSelectorRef}
                variant="plain"
                color="neutral"
                size="sm"
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  minHeight: 32,
                  gap: "6px",
                  px: "8px",
                  justifyContent: "flex-start",
                  flex: 1,
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                }}
                startDecorator={<WorkspacesIcon sx={{ fontSize: 16, color: "var(--text-tertiary)" }} />}
                endDecorator={<KeyboardArrowDownIcon sx={{ fontSize: 18, color: "var(--text-tertiary)", ml: "auto" }} />}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                  {activeWorkspace?.name || t("workspace")}
                </span>
              </MenuButton>
              <Menu size="sm" placement="bottom-start" sx={{ minWidth: wsSelectorRef.current?.offsetWidth || 220 }}>
                {workspaces.map((ws) => (
                  <MenuItem
                    key={ws._id}
                    selected={ws._id === activeWorkspace?._id}
                    onClick={() => setActiveWorkspace(ws)}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ws.name}
                    </span>
                    {!ws.isPersonal && isWsAdmin && (
                      <div
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setWsActionMenu({ anchorEl: e.currentTarget, wsId: ws._id });
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 24,
                          height: 24,
                          marginLeft: 4,
                          borderRadius: 4,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        <MoreHorizIcon sx={{ fontSize: 16 }} />
                      </div>
                    )}
                  </MenuItem>
                ))}
                <MenuItem onClick={() => setCreateWsOpen(true)} sx={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  <ListItemDecorator>
                    <AddIcon sx={{ fontSize: 16 }} />
                  </ListItemDecorator>
                  {t("createWorkspace")}
                </MenuItem>
                <ListDivider />
                <MenuItem onClick={() => openInviteModal()} sx={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  <ListItemDecorator>
                    <PersonAddIcon sx={{ fontSize: 16 }} />
                  </ListItemDecorator>
                  {t("inviteMembers")}
                </MenuItem>
              </Menu>
            </Dropdown>
            <Menu
              size="sm"
              placement="right-start"
              open={!!wsActionMenu.anchorEl}
              anchorEl={wsActionMenu.anchorEl}
              onClose={() => setWsActionMenu({ anchorEl: null, wsId: null })}
            >
              <MenuItem onClick={() => {
                onStartRenameWs(wsActionMenu.wsId);
                setWsActionMenu({ anchorEl: null, wsId: null });
              }}>
                <ListItemDecorator>
                  <EditOutlinedIcon fontSize="small" />
                </ListItemDecorator>
                {t("renameWorkspace")}
              </MenuItem>
              <MenuItem
                color="danger"
                onClick={() => {
                  setDeleteWsConfirm(wsActionMenu.wsId);
                  setWsActionMenu({ anchorEl: null, wsId: null });
                }}
              >
                <ListItemDecorator>
                  <DeleteOutlineIcon fontSize="small" />
                </ListItemDecorator>
                {t("deleteWorkspace")}
              </MenuItem>
            </Menu>
          </div>
          <div className="main-menu-section-title">
            <span>{t("conversations")}</span>
          </div>
          {conversations.length === 0 ? (
            <></>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv._id}
                className={`conversation-item ${location.pathname === `/conversations/${conv._id}` ? "active" : ""}`}
                onClick={() => {
                  if (renamingId !== conv._id) onSelectConversation(conv._id);
                }}
              >
                <div className="conversation-info">
                  {renamingId === conv._id ? (
                    <input
                      ref={renameInputRef}
                      className="conversation-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onConfirmRename(conv._id);
                        if (e.key === "Escape") onCancelRename();
                      }}
                      onBlur={() => onConfirmRename(conv._id)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <div className="conversation-title">{conv.title}</div>
                  )}
                  <div className="conversation-meta">
                    {conv.updatedAt && <span>{timeAgo(conv.updatedAt)}</span>}
                    {conv.subResource?.name && (
                      <>
                        <span className="conversation-meta-sep">·</span>
                        <span className="conversation-meta-repo">
                          {conv.subResource.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="conversation-trailing">
                  <span className="conversation-status-indicator">
                    <ConversationStatusIndicator
                      conv={conv}
                      busyConversationIds={busyConversationIds}
                      unreadConversationIds={unreadConversationIds}
                    />
                  </span>
                  <Dropdown>
                    <MenuButton
                      className="conversation-menu-btn"
                      variant="plain"
                      color="neutral"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        "--IconButton-size": "28px",
                        minWidth: "28px",
                        minHeight: "28px",
                        p: 0,
                        borderRadius: "6px",
                      }}
                    >
                      <MoreHorizIcon sx={{ fontSize: 18 }} />
                    </MenuButton>
                    <Menu size="sm" placement="bottom-end">
                      <MenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartRename(conv._id, conv.title);
                        }}
                      >
                        <ListItemDecorator>
                          <EditOutlinedIcon fontSize="small" />
                        </ListItemDecorator>
                        {t("rename")}
                      </MenuItem>
                      <MenuItem
                        color="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestDelete(conv._id);
                        }}
                      >
                        <ListItemDecorator>
                          <DeleteOutlineIcon fontSize="small" />
                        </ListItemDecorator>
                        {t("delete")}
                      </MenuItem>
                    </Menu>
                  </Dropdown>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Bottom pinned: User dropdown ── */}
      <div className="main-menu-bottom">
        <Dropdown>
          <MenuButton
            variant="plain"
            color="neutral"
            className="main-menu-user-btn"
            sx={{
              width: "100%",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: "10px",
              px: collapsed ? "6px" : "8px",
              py: "6px",
              borderRadius: "6px",
              fontWeight: 500,
              fontSize: 14,
              color: "var(--text-primary)",
              "&:hover": { bgcolor: "var(--bg-hover)" },
            }}
          >
            <PersonOutlineIcon
              sx={{ fontSize: 20, color: "var(--text-tertiary)" }}
            />
            {!collapsed && (
              <span className="main-menu-user-email">
                {user?.profile?.display_name ||
                  user?.username ||
                  user?.email ||
                  t("account")}
              </span>
            )}
          </MenuButton>
          <Menu size="sm" placement="top-start">
            {user?.email && (
              <MenuItem
                sx={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  pointerEvents: "none",
                  py: 0.5,
                }}
              >
                {user.email}
              </MenuItem>
            )}
            <MenuItem
              onClick={() =>
                window.open("https://docs.rearch.engineer", "_blank")
              }
            >
              <ListItemDecorator>
                <HelpOutlineIcon fontSize="small" />
              </ListItemDecorator>
              {t("help")}
            </MenuItem>
            {isAdmin() && (
              <MenuItem onClick={() => navigate("/administration")}>
                <ListItemDecorator>
                  <AdminPanelSettingsOutlined fontSize="small" />
                </ListItemDecorator>
                {t("administration")}
              </MenuItem>
            )}
            <MenuItem onClick={() => navigate("/account")}>
              <ListItemDecorator>
                <SettingsOutlined fontSize="small" />
              </ListItemDecorator>
              {t("account")}
            </MenuItem>
            <ListDivider />
            <MenuItem
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            >
              <ListItemDecorator>
                <LogoutIcon fontSize="small" />
              </ListItemDecorator>
              {t("logout")}
            </MenuItem>
          </Menu>
        </Dropdown>
      </div>

      {/* ── Delete confirmation modal ── */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <ModalDialog
          variant="outlined"
          sx={{
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            maxWidth: 420,
          }}
        >
          <ModalClose />
          <DialogTitle sx={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {t("deleteConversation")}
          </DialogTitle>
          <DialogContent sx={{ color: "var(--text-secondary)" }}>
            {t("deleteConfirmation")}{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {conversations.find((c) => c._id === deleteConfirm)?.title}
            </strong>
            ? <span style={{ color: "#e57373" }}>{t("deleteWarning")}</span>
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="danger"
              onClick={onConfirmDelete}
              sx={{ fontWeight: 600 }}
            >
              {t("delete")}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setDeleteConfirm(null)}
            >
              {t("cancel")}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ── Create workspace modal ── */}
      <Modal open={createWsOpen} onClose={() => { setCreateWsOpen(false); setCreateWsName(""); }}>
        <ModalDialog
          variant="outlined"
          sx={{
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            maxWidth: 420,
          }}
        >
          <ModalClose />
          <DialogTitle sx={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {t("createWorkspace")}
          </DialogTitle>
          <DialogContent sx={{ color: "var(--text-secondary)" }}>
            <Input
              placeholder={t("workspaceName")}
              value={createWsName}
              onChange={(e) => setCreateWsName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onCreateWorkspace(); }}
              size="sm"
              autoFocus
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="primary"
              onClick={onCreateWorkspace}
              loading={createWsLoading}
              disabled={!createWsName.trim()}
              sx={{ fontWeight: 600 }}
            >
              {t("create")}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => { setCreateWsOpen(false); setCreateWsName(""); }}
            >
              {t("cancel")}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ── Invite members modal ── */}
      <Modal open={inviteOpen} onClose={() => { setInviteOpen(false); setInviteList([]); setInviteEmail(""); }}>
        <ModalDialog
          variant="outlined"
          sx={{
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            maxWidth: 520,
            width: "100%",
          }}
        >
          <ModalClose />
          <DialogTitle sx={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {t("inviteMembersTo", { name: activeWorkspace?.name || t("workspace") })}
          </DialogTitle>
          <DialogContent>
            <Typography level="title-sm" sx={{ color: "var(--text-primary)", mb: 1 }}>
              {t("emailAddresses")}
            </Typography>
            <Input
              placeholder={t("enterEmails")}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  onAddInviteEmail();
                }
              }}
              size="sm"
              autoFocus
              sx={{ mb: 2 }}
            />
            {membersLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size="sm" />
              </Box>
            ) : (
              <>
                {existingMembers.map((member) => (
                  <Box
                    key={member.user?._id || member._id}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      py: 1,
                      px: 0.5,
                    }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        mr: 2,
                      }}
                    >
                      {member.user?.account?.email || member.user?.profile?.display_name || "\u2014"}
                    </Typography>
                    <ButtonGroup
                      size="sm"
                      variant="outlined"
                      sx={{
                        '--ButtonGroup-radius': '6px',
                        flexShrink: 0,
                      }}
                    >
                      {["user", "admin"].map((role) => (
                        <Button
                          key={role}
                          variant={member.role === role ? "solid" : "outlined"}
                          color="neutral"
                          sx={{
                            fontSize: 12,
                            fontWeight: member.role === role ? 700 : 400,
                            px: 1.5,
                            textTransform: "capitalize",
                            pointerEvents: "none",
                          }}
                        >
                          {t(`role_${role}`)}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </Box>
                ))}
                {inviteList.map((item) => (
                  <Box
                    key={item.email}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      py: 1,
                      px: 0.5,
                    }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        mr: 2,
                      }}
                    >
                      {item.email}
                    </Typography>
                    <ButtonGroup
                      size="sm"
                      variant="outlined"
                      sx={{
                        '--ButtonGroup-radius': '6px',
                        flexShrink: 0,
                      }}
                    >
                      {["user", "admin"].map((role) => (
                        <Button
                          key={role}
                          variant={item.role === role ? "solid" : "outlined"}
                          color="neutral"
                          onClick={() => onChangeInviteRole(item.email, role)}
                          sx={{
                            fontSize: 12,
                            fontWeight: item.role === role ? 700 : 400,
                            px: 1.5,
                            textTransform: "capitalize",
                          }}
                        >
                          {t(`role_${role}`)}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </Box>
                ))}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="neutral"
              onClick={onSubmitInvites}
              loading={inviteLoading}
              disabled={inviteList.length === 0}
              sx={{ fontWeight: 600 }}
            >
              {t("invite")}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ── Rename workspace modal ── */}
      <Modal open={!!renamingWs} onClose={() => { setRenamingWs(null); setRenameWsValue(""); }}>
        <ModalDialog
          variant="outlined"
          sx={{
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            maxWidth: 420,
          }}
        >
          <ModalClose />
          <DialogTitle sx={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {t("renameWorkspace")}
          </DialogTitle>
          <DialogContent>
            <Input
              placeholder={t("workspaceName")}
              value={renameWsValue}
              onChange={(e) => setRenameWsValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onConfirmRenameWs(); }}
              size="sm"
              autoFocus
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="primary"
              onClick={onConfirmRenameWs}
              disabled={!renameWsValue.trim()}
              sx={{ fontWeight: 600 }}
            >
              {t("rename")}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => { setRenamingWs(null); setRenameWsValue(""); }}
            >
              {t("cancel")}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ── Delete workspace confirmation modal ── */}
      <Modal open={!!deleteWsConfirm} onClose={() => setDeleteWsConfirm(null)}>
        <ModalDialog
          variant="outlined"
          sx={{
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            maxWidth: 420,
          }}
        >
          <ModalClose />
          <DialogTitle sx={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {t("deleteWorkspace")}
          </DialogTitle>
          <DialogContent sx={{ color: "var(--text-secondary)" }}>
            {t("deleteWsConfirmation")}{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {workspaces.find((w) => w._id === deleteWsConfirm)?.name}
            </strong>
            ? <span style={{ color: "#e57373" }}>{t("deleteWsWarning")}</span>
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="danger"
              onClick={onConfirmDeleteWs}
              loading={deleteWsLoading}
              sx={{ fontWeight: 600 }}
            >
              {t("delete")}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setDeleteWsConfirm(null)}
            >
              {t("cancel")}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </div>
  );
};

export default MainMenu;
