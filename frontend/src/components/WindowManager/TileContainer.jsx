import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "@mui/joy/Tooltip";
import Menu from "@mui/joy/Menu";
import MenuItem from "@mui/joy/MenuItem";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import ChatOutlined from "@mui/icons-material/ChatOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import WebOutlined from "@mui/icons-material/WebOutlined";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import ApiOutlined from "@mui/icons-material/ApiOutlined";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";
import BrushOutlined from "@mui/icons-material/BrushOutlined";
import TerminalOutlined from "@mui/icons-material/TerminalOutlined";
import WidgetsOutlined from "@mui/icons-material/WidgetsOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { usePanels } from "../../contexts/PanelContext";

const SERVICE_ICON_MAP = {
  Code: CodeOutlined, Web: WebOutlined, Storage: StorageOutlined,
  Api: ApiOutlined, AI: SmartToyOutlined, Design: BrushOutlined,
  Terminal: TerminalOutlined, Widgets: WidgetsOutlined,
};

const DRAG_MIME = "application/panel-tab";

function getPanelMeta(panelId, services) {
  if (panelId === "conversation") return { label: "Conversation", Icon: ChatOutlined };
  if (panelId === "session-info") return { label: "Session", Icon: InfoOutlined };
  if (panelId.startsWith("service:")) {
    const idx = parseInt(panelId.split(":")[1], 10);
    const svc = services[idx];
    if (svc) return { label: svc.label, Icon: SERVICE_ICON_MAP[svc.icon] || OpenInNewOutlined };
    return { label: "Service", Icon: OpenInNewOutlined };
  }
  return { label: panelId, Icon: WidgetsOutlined };
}

/**
 * Determine which edge zone the cursor is in relative to an element.
 * Returns "left" | "right" | "top" | "bottom" | "center"
 */
function getDropZone(e, element) {
  const rect = element.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const edgeThreshold = 0.22;

  if (x < edgeThreshold) return "left";
  if (x > 1 - edgeThreshold) return "right";
  if (y < edgeThreshold) return "top";
  if (y > 1 - edgeThreshold) return "bottom";
  return "center";
}

const TileContainer = ({ tileId, renderPanelContent }) => {
  const { t } = useTranslation("WindowManager");
  const {
    layout, services, setActiveTab, moveTab, reorderTabs, splitFromTab, removeTab,
    getPanelActions, sidebarCollapsed, toggleSidebar,
  } = usePanels();
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxAnchorRef = useRef(null);

  // Drop zone state for edge-based splitting
  const [dropZone, setDropZone] = useState(null); // "left"|"right"|"top"|"bottom"|"center"|null
  const contentRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Tab reorder state
  const [tabDropIndex, setTabDropIndex] = useState(null);

  const tile = layout.tiles[tileId];
  if (!tile) return null;
  const { tabs, activeTab } = tile;

  // Total tab count across all tiles (to prevent closing the very last tab)
  const totalTabCount = Object.values(layout.tiles).reduce((sum, t) => sum + t.tabs.length, 0);

  /* ── Context menu ── */
  const handleContextMenu = (e, panelId) => {
    if (!panelId.startsWith("service:")) return;
    e.preventDefault();
    e.stopPropagation();
    ctxAnchorRef.current = {
      getBoundingClientRect: () => ({
        x: e.clientX, y: e.clientY,
        top: e.clientY, bottom: e.clientY,
        left: e.clientX, right: e.clientX,
        width: 0, height: 0,
      }),
    };
    setCtxMenu({ panelId });
  };

  const closeCtxMenu = () => setCtxMenu(null);

  const menuRef = useRef(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClose = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      closeCtxMenu();
    };
    document.addEventListener("mousedown", handleClose);
    document.addEventListener("contextmenu", handleClose);
    return () => {
      document.removeEventListener("mousedown", handleClose);
      document.removeEventListener("contextmenu", handleClose);
    };
  }, [ctxMenu]);

  const handleRefresh = () => {
    if (ctxMenu) {
      const actions = getPanelActions(ctxMenu.panelId);
      if (actions?.reload) actions.reload();
    }
    closeCtxMenu();
  };

  const handleOpenInNewTab = () => {
    if (ctxMenu) {
      const actions = getPanelActions(ctxMenu.panelId);
      if (actions?.openExternal) actions.openExternal();
    }
    closeCtxMenu();
  };

  /* ── Close tab ── */
  const handleCloseTab = (e, panelId) => {
    e.stopPropagation();
    // Don't close if this is the very last tab across all tiles
    if (totalTabCount <= 1) return;
    removeTab(panelId);
  };

  /* ── Tab drag (reorder within tile + move between tiles) ── */
  const handleTabDragStart = (e, panelId, index) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ panelId, fromTileId: tileId, fromIndex: index }));
    e.dataTransfer.effectAllowed = "move";
    // Add a drag class after a tick for styling
    requestAnimationFrame(() => e.target.classList.add("dragging"));
  };

  const handleTabDragEnd = (e) => {
    e.target.classList.remove("dragging");
    setTabDropIndex(null);
  };

  const handleTabDragOver = (e, index) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setTabDropIndex(index);
  };

  const handleTabDrop = (e, toIndex) => {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    setTabDropIndex(null);
    try {
      const { panelId, fromTileId, fromIndex } = JSON.parse(raw);
      if (fromTileId === tileId && fromIndex !== undefined) {
        // Reorder within same tile
        if (fromIndex !== toIndex) reorderTabs(tileId, fromIndex, toIndex);
      } else if (fromTileId !== tileId) {
        // Move from another tile into this tile's tab bar (merge)
        moveTab(panelId, fromTileId, tileId);
      }
    } catch { /* ignore */ }
  };

  const handleTabBarDragLeave = () => {
    setTabDropIndex(null);
  };

  /* ── Content area drop zones (edge-based split) ── */
  const handleContentDragOver = useCallback((e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (contentRef.current) {
      setDropZone(getDropZone(e, contentRef.current));
    }
  }, []);

  const handleContentDragEnter = useCallback((e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    dragCounterRef.current++;
  }, []);

  const handleContentDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDropZone(null);
    }
  }, []);

  const handleContentDrop = useCallback((e) => {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;

    const zone = contentRef.current ? getDropZone(e, contentRef.current) : "center";
    setDropZone(null);

    try {
      const { panelId, fromTileId } = JSON.parse(raw);
      if (zone === "center") {
        // Merge: move tab into this tile
        if (fromTileId !== tileId) {
          moveTab(panelId, fromTileId, tileId);
        }
      } else {
        // Edge drop: split the target tile
        splitFromTab(panelId, fromTileId, tileId, zone);
      }
    } catch { /* ignore */ }
  }, [tileId, moveTab, splitFromTab]);

  return (
    <div className="tile-container">
      <div className="tile-tab-bar" onDragLeave={handleTabBarDragLeave}>
        <div className="tile-tabs">
          {tabs.map((panelId, index) => {
            const { label, Icon } = getPanelMeta(panelId, services);
            const isActive = panelId === activeTab;
            const showDropIndicator = tabDropIndex === index;
            const canClose = totalTabCount > 1;
            return (
              <div
                key={panelId}
                className={`tile-tab${isActive ? " active" : ""}${showDropIndicator ? " drop-before" : ""}`}
                onClick={() => setActiveTab(tileId, panelId)}
                onContextMenu={(e) => handleContextMenu(e, panelId)}
                draggable
                onDragStart={(e) => handleTabDragStart(e, panelId, index)}
                onDragEnd={handleTabDragEnd}
                onDragOver={(e) => handleTabDragOver(e, index)}
                onDrop={(e) => handleTabDrop(e, index)}
              >
                <Icon sx={{ fontSize: 14 }} />
                <span className="tile-tab-label">{label}</span>
                {canClose && (
                  <span
                    className="tile-tab-close"
                    onClick={(e) => handleCloseTab(e, panelId)}
                    title={t("closeTab", "Close")}
                  >
                    <CloseOutlined sx={{ fontSize: 12 }} />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar toggle */}
        <Tooltip title={sidebarCollapsed ? t("showSidebar") : t("hideSidebar")} placement="bottom">
          <div className="tile-tab-sidebar-toggle" onClick={toggleSidebar}>
            {sidebarCollapsed ? <ChevronLeftIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
          </div>
        </Tooltip>
      </div>

      {/* All tabs stay mounted; only active one visible */}
      <div
        ref={contentRef}
        className="tile-content"
        onDragOver={handleContentDragOver}
        onDragEnter={handleContentDragEnter}
        onDragLeave={handleContentDragLeave}
        onDrop={handleContentDrop}
      >
        {tabs.map((panelId) => (
          <div key={panelId} className="tile-content-panel" style={{ display: panelId === activeTab ? "contents" : "none" }}>
            {renderPanelContent(panelId)}
          </div>
        ))}

        {/* Drop zone overlay */}
        {dropZone && (
          <div className="drop-zone-overlay">
            <div className={`drop-zone-indicator drop-zone-${dropZone}`} />
          </div>
        )}
      </div>

      {/* Right-click context menu for service tabs */}
      <Menu
        ref={menuRef}
        open={Boolean(ctxMenu)}
        onClose={closeCtxMenu}
        anchorEl={ctxAnchorRef.current}
        placement="bottom-start"
        size="sm"
        sx={{ zIndex: 1300 }}
      >
        <MenuItem onClick={handleRefresh}>
          <ListItemDecorator>
            <RefreshOutlined fontSize="small" />
          </ListItemDecorator>
          {t("refresh")}
        </MenuItem>
        <MenuItem onClick={handleOpenInNewTab}>
          <ListItemDecorator>
            <OpenInNewOutlined fontSize="small" />
          </ListItemDecorator>
          {t("openInNewTab")}
        </MenuItem>
      </Menu>
    </div>
  );
};

export { getPanelMeta };
export default TileContainer;
