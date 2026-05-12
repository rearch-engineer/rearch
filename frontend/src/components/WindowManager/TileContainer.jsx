import React, { useState, useRef, useEffect, useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useTranslation } from "react-i18next";
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
import { usePanels } from "../../contexts/PanelContext";

const SERVICE_ICON_MAP = {
  Code: CodeOutlined, Web: WebOutlined, Storage: StorageOutlined,
  Api: ApiOutlined, AI: SmartToyOutlined, Design: BrushOutlined,
  Terminal: TerminalOutlined, Widgets: WidgetsOutlined,
};

/** Custom drag type -- must NOT collide with MosaicDragType.WINDOW ("MosaicWindow") */
const PANEL_TAB_TYPE = "PANEL_TAB";

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
 * Determine which edge zone a point is in relative to a rect.
 * Returns "left" | "right" | "top" | "bottom" | "center"
 */
function getDropZoneFromOffset(clientOffset, rect) {
  const x = (clientOffset.x - rect.left) / rect.width;
  const y = (clientOffset.y - rect.top) / rect.height;
  const edgeThreshold = 0.22;

  if (x < edgeThreshold) return "left";
  if (x > 1 - edgeThreshold) return "right";
  if (y < edgeThreshold) return "top";
  if (y > 1 - edgeThreshold) return "bottom";
  return "center";
}

/* ─────────────────────────────────────────────────────────
 * DraggableTab -- individual tab with useDrag + useDrop
 * ───────────────────────────────────────────────────────── */
const DraggableTab = ({
  panelId, index, tileId, isActive, label, Icon,
  tabDropIndex, setTabDropIndex,
  onActivate, onContextMenu,
  onReorder, onMoveBetweenTiles,
}) => {
  const ref = useRef(null);

  const [{ isDragging }, drag] = useDrag({
    type: PANEL_TAB_TYPE,
    item: () => {
      document.body.classList.add("dragging-tab");
      return { panelId, fromTileId: tileId, fromIndex: index };
    },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    end() {
      document.body.classList.remove("dragging-tab");
      setTabDropIndex(null);
    },
  });

  const [, drop] = useDrop({
    accept: PANEL_TAB_TYPE,
    hover(item, monitor) {
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const dropIdx = clientOffset.x > midX ? index + 1 : index;
      setTabDropIndex(dropIdx);
    },
    drop(item, monitor) {
      if (monitor.didDrop()) return; // already handled by a nested target
      const clientOffset = monitor.getClientOffset();
      let toIndex = index;
      if (clientOffset && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        toIndex = clientOffset.x > midX ? index + 1 : index;
      }
      if (item.fromTileId === tileId) {
        let adjustedTo = toIndex;
        if (item.fromIndex < toIndex) adjustedTo -= 1;
        if (item.fromIndex !== adjustedTo) onReorder(tileId, item.fromIndex, adjustedTo);
      } else {
        onMoveBetweenTiles(item.panelId, item.fromTileId, tileId);
      }
      setTabDropIndex(null);
    },
  });

  // Compose refs
  drag(drop(ref));

  const showDropIndicator = tabDropIndex === index;

  return (
    <div
      ref={ref}
      className={`tile-tab${isActive ? " active" : ""}${showDropIndicator ? " drop-before" : ""}${isDragging ? " dragging" : ""}`}
      onClick={onActivate}
      onContextMenu={onContextMenu}
    >
      <Icon sx={{ fontSize: 14 }} />
      <span className="tile-tab-label">{label}</span>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
 * TileContainer -- main tile wrapper with tab bar + content
 * ───────────────────────────────────────────────────────── */
const TileContainer = ({ tileId, renderPanelContent }) => {
  const { t } = useTranslation("WindowManager");
  const {
    layout, services, setActiveTab, moveTab, reorderTabs, splitFromTab,
    getPanelActions,
  } = usePanels();
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxAnchorRef = useRef(null);

  // Drop zone state for edge-based splitting
  const [dropZone, setDropZone] = useState(null);

  // Tab reorder drop indicator index
  const [tabDropIndex, setTabDropIndex] = useState(null);

  const tile = layout.tiles[tileId];
  if (!tile) return null;
  const { tabs, activeTab } = tile;

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

  /* ── Tab bar end-of-bar drop zone (react-dnd) ── */
  const [, tabBarDrop] = useDrop({
    accept: PANEL_TAB_TYPE,
    hover(item, monitor) {
      // Only show end-of-bar indicator when hovering the bar background itself
      // (individual tabs handle their own hover via DraggableTab)
      const isOverCurrent = monitor.isOver({ shallow: true });
      if (isOverCurrent) {
        setTabDropIndex(tabs.length);
      }
    },
    drop(item, monitor) {
      if (monitor.didDrop()) return; // handled by a child tab
      const toIndex = tabs.length;
      if (item.fromTileId === tileId) {
        let adjustedTo = toIndex;
        if (item.fromIndex < toIndex) adjustedTo -= 1;
        if (item.fromIndex !== adjustedTo) reorderTabs(tileId, item.fromIndex, adjustedTo);
      } else {
        moveTab(item.panelId, item.fromTileId, tileId);
      }
      setTabDropIndex(null);
    },
    collect(monitor) {
      // Clear indicator when drag leaves the bar entirely
      if (!monitor.isOver()) {
        // Use a microtask to avoid clearing during child transitions
        queueMicrotask(() => setTabDropIndex((prev) => prev));
      }
      return {};
    },
  });

  /* ── Content area drop zone (edge-based split / center merge) ── */
  const [{ isOverContent }, contentDrop] = useDrop({
    accept: PANEL_TAB_TYPE,
    hover(item, monitor) {
      const clientOffset = monitor.getClientOffset();
      const el = contentRef.current;
      if (!clientOffset || !el) return;
      const rect = el.getBoundingClientRect();
      setDropZone(getDropZoneFromOffset(clientOffset, rect));
    },
    drop(item, monitor) {
      if (monitor.didDrop()) return;
      const clientOffset = monitor.getClientOffset();
      const el = contentRef.current;
      const zone = (clientOffset && el)
        ? getDropZoneFromOffset(clientOffset, el.getBoundingClientRect())
        : "center";
      setDropZone(null);

      if (zone === "center") {
        if (item.fromTileId !== tileId) {
          moveTab(item.panelId, item.fromTileId, tileId);
        }
      } else {
        splitFromTab(item.panelId, item.fromTileId, tileId, zone);
      }
    },
    collect(monitor) {
      const over = monitor.isOver({ shallow: true });
      if (!over) {
        // Clear drop zone when cursor leaves
        queueMicrotask(() => setDropZone(null));
      }
      return { isOverContent: over };
    },
  });

  const contentRef = useRef(null);
  const setContentRef = useCallback((node) => {
    contentRef.current = node;
    contentDrop(node);
  }, [contentDrop]);

  return (
    <div className="tile-container">
      <div className="tile-tab-bar" ref={tabBarDrop}>
        <div className="tile-tabs">
          {tabs.map((panelId, index) => {
            const { label, Icon } = getPanelMeta(panelId, services);
            const isActive = panelId === activeTab;
            return (
              <DraggableTab
                key={panelId}
                panelId={panelId}
                index={index}
                tileId={tileId}
                isActive={isActive}
                label={label}
                Icon={Icon}
                tabDropIndex={tabDropIndex}
                setTabDropIndex={setTabDropIndex}
                onActivate={() => setActiveTab(tileId, panelId)}
                onContextMenu={(e) => handleContextMenu(e, panelId)}
                onReorder={reorderTabs}
                onMoveBetweenTiles={moveTab}
              />
            );
          })}
          {/* Drop indicator after the last tab */}
          {tabDropIndex === tabs.length && (
            <div className="tile-tab-drop-end" />
          )}
        </div>
      </div>

      {/* All tabs stay mounted; only active one visible (use visibility instead of display to preserve iframes) */}
      <div ref={setContentRef} className="tile-content">
        {tabs.map((panelId) => {
          const isActive = panelId === activeTab;
          return (
            <div
              key={panelId}
              className="tile-content-panel"
              style={{
                visibility: isActive ? "visible" : "hidden",
                position: isActive ? "relative" : "absolute",
                width: "100%",
                height: "100%",
                top: 0,
                left: 0,
                zIndex: isActive ? 1 : 0,
              }}
            >
              {renderPanelContent(panelId)}
            </div>
          );
        })}

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
