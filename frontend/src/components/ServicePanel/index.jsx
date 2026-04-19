import React, { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePanels } from "../../contexts/PanelContext";
import "./ServicePanel.css";

const ServicePanel = ({ service, panelId }) => {
  const { t } = useTranslation("ServicePanel");
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const { registerPanelActions, unregisterPanelActions } = usePanels();

  const reload = useCallback(() => {
    if (iframeRef.current) { setLoading(true); iframeRef.current.src = service.url; }
  }, [service.url]);

  const openExternal = useCallback(() => {
    window.open(service.url, "_blank");
  }, [service.url]);

  useEffect(() => {
    registerPanelActions(panelId, { reload, openExternal });
    return () => unregisterPanelActions(panelId);
  }, [panelId, reload, openExternal, registerPanelActions, unregisterPanelActions]);

  return (
    <div className="service-panel">
      <div className="service-panel-content">
        {loading && (
          <div className="service-panel-loading">
            <span>{t("loading")}</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={service.url}
          title={service.label}
          className="service-panel-iframe"
          onLoad={() => setLoading(false)}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
        />
      </div>
    </div>
  );
};

export default ServicePanel;
