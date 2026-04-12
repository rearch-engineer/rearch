import React, { useState, useRef, useCallback } from "react";
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

import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ForumIcon from "@mui/icons-material/Forum";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useAuth } from "../contexts/AuthContext";
import { useConversations } from "../contexts/ConversationsContext";
import AdminSidebarMenu from "./Administration/AdminSidebarMenu";
import AccountSidebarMenu from "./Account/AccountSidebarMenu";
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

const ConversationStatusIndicator = ({ conv, busyConversationIds, unreadConversationIds }) => {
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
      <span
        className={`conv-status-dot running${isUnread ? " blink" : ""}`}
      />
    );
  }

  // stopped or unknown
  return <span className="conv-status-dot stopped" />;
};

const MainMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const {
    conversations,
    busyConversationIds,
    unreadConversationIds,
    handleDeleteConversation,
    handleRenameConversation,
    markRead,
  } = useConversations();

  const isOnAdministration = location.pathname.startsWith("/administration");
  const isOnAccount = location.pathname.startsWith("/account");

  const [collapsed, setCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [convPopoverOpen, setConvPopoverOpen] = useState(false);
  const convPopoverTimeout = useRef(null);
  const renameInputRef = useRef(null);

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
          <div className="collapsed-topbar-toggle">
            <ForumIcon
              className="collapsed-topbar-brand"
              sx={{ fontSize: 22, color: "#DB4F15", cursor: "pointer" }}
              onClick={() => navigate("/")}
            />
            <div
              className="main-menu-icon-btn collapsed-topbar-expand"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
            >
              <ChevronRightIcon sx={{ fontSize: 20 }} />
            </div>
          </div>
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
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
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
          className={`main-menu-nav-item${location.pathname === "/" ? " active" : ""}`}
          onClick={() => navigate("/")}
          title="Home"
        >
          <HomeOutlinedIcon
            sx={{ fontSize: 20, color: "var(--text-tertiary)" }}
          />
          {!collapsed && <span>Home</span>}
        </div>
        <div
          className="main-menu-nav-item"
          onClick={openCommandPalette}
          title="Search (Ctrl+P)"
        >
          <SearchIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
          {!collapsed && <span>Search</span>}
        </div>
      </div>

      {/* ── Contextual content area ── */}
      {collapsed ? (
        /* Collapsed: conversations icon with hover popover */
        <div className="collapsed-nav-icons">
          <div
            className="collapsed-conv-wrapper"
            onMouseEnter={openConvPopover}
            onMouseLeave={closeConvPopover}
          >
            <div
              className={`main-menu-nav-item${location.pathname.startsWith("/conversations") ? " active" : ""}`}
              title="Conversations"
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
                <div className="collapsed-conv-popover-header">
                  <span>Conversations</span>
                  <div
                    className="main-menu-section-action"
                    onClick={onNewConversation}
                    title="New conversation"
                  >
                    <AddIcon sx={{ fontSize: 16 }} />
                  </div>
                </div>
                <div className="collapsed-conv-popover-list">
                  {conversations.length === 0 ? (
                    <div className="collapsed-conv-popover-empty">
                      No conversations yet
                    </div>
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
                          <div className="conversation-title">
                            {conv.title}
                          </div>
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
          <div className="main-menu-section-title">
            <span>Conversations</span>
            <div
              className="main-menu-section-action"
              onClick={onNewConversation}
              title="New conversation"
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </div>
          </div>
          {conversations.length === 0 ? (
            <div className="empty-state">
              <p>No conversations yet</p>
              <p className="empty-hint">Click + to start</p>
            </div>
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
                    <div className="conversation-title">
                      {conv.title}
                    </div>
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
                      Rename
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
                      Delete
                    </MenuItem>
                  </Menu>
                  </Dropdown>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Bottom pinned: Help & Account ── */}
      <div className="main-menu-bottom">
        <div
          className="main-menu-nav-item"
          onClick={() => window.open("https://docs.rearch.engineer", "_blank")}
          title="Help"
        >
          <HelpOutlineIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
          {!collapsed && <span>Help</span>}
        </div>
        {isAdmin() && (
          <div
            className={`main-menu-nav-item${location.pathname.startsWith("/administration") ? " active" : ""}`}
            onClick={() => navigate("/administration")}
            title="Administration"
          >
            <AdminPanelSettingsOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
            {!collapsed && <span>Administration</span>}
          </div>
        )}
        <div
          className={`main-menu-nav-item${location.pathname === "/account" ? " active" : ""}`}
          onClick={() => navigate("/account")}
          title="Account"
        >
          <SettingsOutlined sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
          {!collapsed && <span>Account</span>}
        </div>
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
            Delete Conversation
          </DialogTitle>
          <DialogContent sx={{ color: "var(--text-secondary)" }}>
            Are you sure you want to delete{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {conversations.find((c) => c._id === deleteConfirm)?.title}
            </strong>
            ?{" "}
            <span style={{ color: "#e57373" }}>
              All associated messages and unsaved changes will be removed.
            </span>
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="danger"
              onClick={onConfirmDelete}
              sx={{ fontWeight: 600 }}
            >
              Delete
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setDeleteConfirm(null)}
            >
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </div>
  );
};

export default MainMenu;
