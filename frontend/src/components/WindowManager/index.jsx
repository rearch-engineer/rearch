import React, { useCallback } from "react";
import { Mosaic } from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";
import { usePanels } from "../../contexts/PanelContext";
import TileContainer from "./TileContainer";
import ChatInterface from "../ChatInterface";
import ServicePanel from "../ServicePanel";
import "./WindowManager.css";

const WindowManager = ({
  conversationId,
  onConversationUpdate,
  onConversationCreated,
  onSessionInfoUpdate,
}) => {
  const { layout, services, updateMosaicTree } = usePanels();

  const renderPanelContent = useCallback(
    (panelId) => {
      if (panelId === "conversation") {
        return (
          <ChatInterface
            conversationId={conversationId}
            onConversationUpdate={onConversationUpdate}
            onConversationCreated={onConversationCreated}
            onSessionInfoUpdate={onSessionInfoUpdate}
          />
        );
      }
      if (panelId.startsWith("service:")) {
        const idx = parseInt(panelId.split(":")[1], 10);
        const service = services[idx];
        if (service) return <ServicePanel service={service} panelId={panelId} />;
        return <div className="wm-panel-placeholder">Service not available</div>;
      }
      return <div className="wm-panel-placeholder">Unknown panel: {panelId}</div>;
    },
    [conversationId, onConversationUpdate, onConversationCreated, onSessionInfoUpdate, services]
  );

  const renderTile = useCallback(
    (tileId, path) => <TileContainer tileId={tileId} renderPanelContent={renderPanelContent} />,
    [renderPanelContent]
  );

  const handleChange = useCallback((newTree) => updateMosaicTree(newTree), [updateMosaicTree]);

  return (
    <div className="window-manager">
      <Mosaic
        renderTile={renderTile}
        value={layout.mosaicTree}
        onChange={handleChange}
        className="wm-mosaic-theme"
        resize={{ minimumPaneSizePercentage: 15 }}
      />
    </div>
  );
};

export default WindowManager;
