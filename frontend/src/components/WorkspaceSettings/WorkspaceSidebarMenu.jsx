import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import PeopleIcon from "@mui/icons-material/People";

const WorkspaceSidebarMenu = () => {
  const { t } = useTranslation("WorkspaceSettings");
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId } = useParams();

  const basePath = `/workspace/${workspaceId}/settings`;

  const menuItems = [
    {
      label: t("sidebar.general"),
      path: `${basePath}/general`,
      icon: <SettingsOutlined />,
    },
    {
      label: t("sidebar.members"),
      path: `${basePath}/members`,
      icon: <PeopleIcon />,
    },
  ];

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="conversations">
      <div className="main-menu-nav-item" onClick={() => navigate("/")}>
        <ChevronLeftIcon
          sx={{ fontSize: 20, color: "var(--text-tertiary)" }}
        />
        <span>{t("sidebar.back")}</span>
      </div>
      <div className="admin-menu-group">
        <div className="admin-menu-group-label">
          {t("sidebar.workspaceSettings")}
        </div>
        {menuItems.map((item) => (
          <div
            key={item.path}
            className={`conversation-item admin-menu-group-item ${isActive(item.path) ? "active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            <div className="conversation-info">
              <div
                className="conversation-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                {item.icon}
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkspaceSidebarMenu;
