import React, { useState, useRef, useEffect } from "react";
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
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { usePanels } from "../../contexts/PanelContext";

const SERVICE_ICON_MAP = {
  Code: CodeOutlined, Web: WebOutlined, Storage: StorageOutlined,
  Api: ApiOutlined, AI: SmartToyOutlined, Design: BrushOutlined,
  Terminal: TerminalOutlined, Widgets: WidgetsOutlined,
};

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

const TileContainer = ({ tileId, renderPanelContent }) => {
  const { t } = useTranslation("WindowManager");
  const { layout, services, setActiveTab, moveTab, getPanelActions, sidebarCollapsed, toggleSidebar } = usePanels();
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxAnchorRef = useRef(null);

  const tile = layout.tiles[tileId];
  if (!tile) return null;
  const { tabs, activeTab } = tile;

  const handleContextMenu = (e, panelId) => {
    if (!panelId.startsWith("service:")) return;
    e.preventDefault();
    e.stopPropagation();
    // Position a virtual anchor at the pointer location
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

  // Close context menu on any outside click or right-click elsewhere
  const menuRef = useRef(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClose = (e) => {
      // Don't close if the click is inside the menu (let MenuItem onClick handle it)
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      closeCtxMenu();
    };
    // Use mousedown for left-clicks, contextmenu for right-clicks elsewhere
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

  return (
    <div className="tile-container">
      <div className="tile-tab-bar">
        <div className="tile-tabs">
          {tabs.map((panelId) => {
            const { label, Icon } = getPanelMeta(panelId, services);
            const isActive = panelId === activeTab;
            return (
              <div
                key={panelId}
                className={`tile-tab${isActive ? " active" : ""}`}
                onClick={() => setActiveTab(tileId, panelId)}
                onContextMenu={(e) => handleContextMenu(e, panelId)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/panel-tab", JSON.stringify({ panelId, fromTileId: tileId }));
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <Icon sx={{ fontSize: 14 }} />
                <span className="tile-tab-label">{label}</span>
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
        className="tile-content"
        onDragOver={(e) => { if (e.dataTransfer.types.includes("application/panel-tab")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData("application/panel-tab");
          if (!raw) return;
          try { const { panelId, fromTileId } = JSON.parse(raw); if (fromTileId !== tileId) moveTab(panelId, fromTileId, tileId); } catch { /* ignore */ }
        }}
      >
        {tabs.map((panelId) => (
          <div key={panelId} className="tile-content-panel" style={{ display: panelId === activeTab ? "contents" : "none" }}>
            {renderPanelContent(panelId)}
          </div>
        ))}
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
