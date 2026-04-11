import React, { useState, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Dropdown from "@mui/joy/Dropdown";
import Menu from "@mui/joy/Menu";
import MenuButton from "@mui/joy/MenuButton";
import MenuItem from "@mui/joy/MenuItem";
import ListDivider from "@mui/joy/ListDivider";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import CircularProgress from "@mui/joy/CircularProgress";
import Typography from "@mui/joy/Typography";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import AddIcon from "@mui/icons-material/Add";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import SearchIcon from "@mui/icons-material/Search";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ForumIcon from "@mui/icons-material/Forum";
import { useAuth } from "../contexts/AuthContext";
import { useConversations } from "../contexts/ConversationsContext";
import UserAvatar from "./UserAvatar";
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

const MainMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const { conversations, busyConversationIds, unreadConversationIds, handleDeleteConversation, handleRenameConversation, markRead } = useConversations();

  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef(null);

  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const onSelectConversation = (id) => {
    markRead(id);
    navigate(`/conversations/${id}`);
  };

  const onNewConversation = () => {
    navigate("/conversations/new");
  };

  const onDeleteConversation = (id) => {
    handleDeleteConversation(id);
    if (location.pathname === `/conversations/${id}`) {
      navigate("/");
    }
  };

  const onStartRename = (id, currentTitle) => {
    setRenameValue(currentTitle);
    // Delay setting renamingId so the MUI dropdown fully closes
    // before the rename input appears and takes focus.
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

  const userDisplayName =
    user?.profile?.display_name || user?.email || user?.username || "?";
  const userEmail = user?.email || "";

  return (
    <div className="main-menu">
      {/* ── Top bar: brand + actions + avatar ── */}
      <div className="main-menu-topbar">
        <span className="main-menu-brand" onClick={() => navigate("/")}>
          <ForumIcon className="main-menu-brand-logo" sx={{ fontSize: 22, verticalAlign: "middle" }} />
          ReArch
        </span>

        <div className="main-menu-topbar-actions">
          <div
            data-testid="new-conversation-btn"
            className={`main-menu-icon-btn${location.pathname === "/conversations/new" ? " active" : ""}`}
            onClick={onNewConversation}
            title="New conversation"
          >
            <AddIcon sx={{ fontSize: 18 }} />
          </div>

          <div
            className={`main-menu-icon-btn${location.pathname === "/resources" ? " active" : ""}`}
            onClick={() => navigate("/resources")}
            title="Resources"
          >
            <StorageOutlined sx={{ fontSize: 18 }} />
          </div>

          {/* Avatar dropdown */}
          <Dropdown>
            <MenuButton
              variant="plain"
              color="neutral"
              size="sm"
              sx={{
                p: 0,
                minWidth: 0,
                minHeight: 0,
                borderRadius: "50%",
                "&:hover": { bgcolor: "transparent" },
              }}
            >
              <UserAvatar
                avatarFileId={user?.profile?.avatar_fileId}
                fallbackName={userDisplayName}
                size="sm"
              />
            </MenuButton>
            <Menu placement="bottom-end" size="sm">
              {/* User identity — not clickable */}
              <MenuItem
                disabled
                sx={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 0,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {userDisplayName}
                </span>
                {userEmail && userEmail !== userDisplayName && (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>
                    {userEmail}
                  </span>
                )}
              </MenuItem>
              <ListDivider />
              <MenuItem onClick={() => navigate("/account")}>
                <ListItemDecorator>
                  <PersonOutlined fontSize="small" />
                </ListItemDecorator>
                Account
              </MenuItem>
              {isAdmin() && (
                <MenuItem onClick={() => navigate("/administration")}>
                  <ListItemDecorator>
                    <AdminPanelSettingsOutlined fontSize="small" />
                  </ListItemDecorator>
                  Administration
                </MenuItem>
              )}
              <ListDivider />
              <MenuItem onClick={handleLogout}>
                <ListItemDecorator>
                  <LogoutIcon fontSize="small" />
                </ListItemDecorator>
                Logout
              </MenuItem>
            </Menu>
          </Dropdown>
        </div>
      </div>

      {/* ── Search trigger ── */}
      <div className="main-menu-search">
        <div
          className="main-menu-search-trigger"
          onClick={openCommandPalette}
          title="Search (Ctrl+P)"
        >
          <SearchIcon sx={{ fontSize: 16, color: "var(--text-tertiary)" }} />
          <Typography
            level="body-sm"
            sx={{ color: "var(--text-tertiary)", flex: 1, userSelect: "none" }}
          >
            Search...
          </Typography>
          <Typography
            level="body-xs"
            sx={{
              color: "var(--text-tertiary)",
              bgcolor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              px: 0.6,
              py: 0.1,
              fontSize: "11px",
              fontFamily: "inherit",
              lineHeight: 1.4,
            }}
          >
            Ctrl+P
          </Typography>
        </div>
      </div>

      {/* ── Conversation list ── */}
      <div className="conversations">
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
              onClick={() => { if (renamingId !== conv._id) onSelectConversation(conv._id); }}
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
                  <div className={`conversation-title${unreadConversationIds.has(conv._id) ? " unread" : ""}`}>{conv.title}</div>
                )}
                <div className="conversation-meta">
                  {busyConversationIds.has(conv._id) && (
                    <CircularProgress
                      size="sm"
                      sx={{ "--CircularProgress-size": "14px", "--CircularProgress-trackThickness": "2px", "--CircularProgress-progressThickness": "2px" }}
                    />
                  )}
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
                      onDeleteConversation(conv._id);
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
          ))
        )}
      </div>
    </div>
  );
};

export default MainMenu;
