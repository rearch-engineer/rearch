import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import Typography from "@mui/joy/Typography";
import IconButton from "@mui/joy/IconButton";
import Tooltip from "@mui/joy/Tooltip";
import CircularProgress from "@mui/joy/CircularProgress";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { api } from "../../api/client";
import { useWorkspaces } from "../../contexts/WorkspacesContext";
import { usePanels } from "../../contexts/PanelContext";
import "./FilesPanel.css";

const POLL_INTERVAL = 30000;
const INDENT_PX = 14;

const storageKey = (id) => `files-panel-expanded:${id}`;

function loadExpanded(id) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(id, expanded) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify([...expanded]));
  } catch { /* quota */ }
}

/**
 * Lazy file tree of the agent's working directory (/repository inside the
 * container). Folders load on expand; files open in a FileEditorPanel tab.
 */
const FilesPanel = ({ conversationId, active = true }) => {
  const { t } = useTranslation("FilesPanel");
  const { activeWorkspace } = useWorkspaces();
  const { addTab, getOpenPanels } = usePanels();
  const workspaceId = activeWorkspace?._id;

  // path -> { entries, loading, error }
  const [dirs, setDirs] = useState({});
  const [expanded, setExpanded] = useState(() => loadExpanded(conversationId));
  const [refreshing, setRefreshing] = useState(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    setDirs({});
    setExpanded(loadExpanded(conversationId));
  }, [conversationId]);

  useEffect(() => {
    saveExpanded(conversationId, expanded);
  }, [conversationId, expanded]);

  const loadDir = useCallback(async (path) => {
    if (!workspaceId || !conversationId) return;
    setDirs((prev) => ({
      ...prev,
      [path]: { ...(prev[path] || {}), loading: !prev[path]?.entries },
    }));
    try {
      const res = await api.listFiles(workspaceId, conversationId, path);
      setDirs((prev) => ({
        ...prev,
        [path]: { entries: res.entries || [], loading: false, error: null },
      }));
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setDirs((prev) => ({
        ...prev,
        [path]: { ...(prev[path] || {}), loading: false, error: message },
      }));
    }
  }, [workspaceId, conversationId]);

  /** Reload the root and every expanded folder. */
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDir("");
      for (const path of [...expandedRef.current]) await loadDir(path);
    } finally {
      setRefreshing(false);
    }
  }, [loadDir]);

  // Initial load + periodic refresh while the panel is visible
  useEffect(() => {
    if (!active) return;
    refreshAll();
    const interval = setInterval(refreshAll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [active, refreshAll]);

  const toggleDir = (path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        loadDir(path);
      }
      return next;
    });
  };

  const openFile = (path) => addTab(`file:${path}`);

  const openPanels = getOpenPanels();

  const renderEntries = (path, depth) => {
    const dir = dirs[path];
    const indent = { paddingLeft: 8 + depth * INDENT_PX };
    if (!dir) return null;
    if (dir.error) {
      return <div className="files-panel-msg files-panel-error" style={indent}>{dir.error}</div>;
    }
    if (dir.loading && !dir.entries) {
      return <div className="files-panel-msg" style={indent}><CircularProgress size="sm" /></div>;
    }
    if (dir.entries && dir.entries.length === 0) {
      return <div className="files-panel-msg" style={indent}>{t("empty")}</div>;
    }
    return (dir.entries || []).map((entry) => {
      const isDir = entry.type === "dir";
      const isOpen = isDir && expanded.has(entry.path);
      const isOpenFile = !isDir && openPanels.has(`file:${entry.path}`);
      return (
        <React.Fragment key={entry.path}>
          <div
            className={`files-panel-row${isOpenFile ? " open" : ""}`}
            style={indent}
            onClick={() => (isDir ? toggleDir(entry.path) : openFile(entry.path))}
            title={entry.path}
          >
            <span className="files-panel-chevron">
              {isDir && (isOpen
                ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
                : <ChevronRightIcon sx={{ fontSize: 16 }} />)}
            </span>
            {isDir
              ? (isOpen
                ? <FolderOpenOutlined className="files-panel-icon" sx={{ fontSize: 16 }} />
                : <FolderOutlined className="files-panel-icon" sx={{ fontSize: 16 }} />)
              : <InsertDriveFileOutlined className="files-panel-icon" sx={{ fontSize: 16 }} />}
            <span className="files-panel-name">{entry.name}</span>
          </div>
          {isDir && isOpen && renderEntries(entry.path, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="files-panel">
      <div className="files-panel-toolbar">
        <Typography level="body-xs" sx={{ color: "text.tertiary", fontWeight: 600 }} noWrap>
          {t("workingDirectory")}
        </Typography>
        <Tooltip title={t("refresh")} placement="left">
          <IconButton size="sm" variant="plain" onClick={refreshAll} disabled={refreshing} sx={{ "--IconButton-size": "24px" }}>
            <RefreshOutlined className={refreshing ? "files-panel-spin" : ""} sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </div>
      <div className="files-panel-tree">{renderEntries("", 0)}</div>
    </div>
  );
};

export default FilesPanel;
