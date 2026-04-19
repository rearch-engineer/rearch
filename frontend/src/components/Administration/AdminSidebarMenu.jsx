import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import Badge from "@mui/joy/Badge";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import ArticleIcon from "@mui/icons-material/Article";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";
import BuildIcon from "@mui/icons-material/Build";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import HubIcon from "@mui/icons-material/Hub";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import StorageIcon from "@mui/icons-material/Storage";
import WorkIcon from "@mui/icons-material/Work";
import WorkspacesIcon from "@mui/icons-material/Workspaces";
import { useJobs } from "../../contexts/JobsContext";

const AdminSidebarMenu = () => {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCount } = useJobs();

  const menuGroups = [
    {
      label: t("sidebar.groupReArch"),
      items: [
        { label: t("sidebar.general"), path: "/administration/general", icon: <SettingsOutlined /> },
        { label: t("sidebar.users"), path: "/administration/users", icon: <PeopleIcon /> },
        { label: t("sidebar.workspaces"), path: "/administration/workspaces", icon: <WorkspacesIcon /> },
        { label: t("sidebar.usage"), path: "/administration/usage", icon: <BarChartIcon /> },
        { label: t("sidebar.jobs"), path: "/administration/jobs", icon: <WorkIcon />, badge: activeCount },
      ],
    },
    {
      label: t("sidebar.groupGenerativeAI"),
      items: [
        { label: t("sidebar.providers"), path: "/administration/llm-providers", icon: <SmartToyIcon /> },
        { label: t("sidebar.skills"), path: "/administration/skills", icon: <ArticleIcon /> },
        { label: t("sidebar.mcpServers"), path: "/administration/mcp-servers", icon: <HubIcon fontSize="small" /> },
        { label: t("sidebar.suggestedPrompts"), path: "/administration/suggested-prompts", icon: <LightbulbIcon /> },
      ],
    },
    {
      label: t("sidebar.groupRepositories"),
      items: [
        { label: t("sidebar.resources"), path: "/administration/resources", icon: <StorageIcon /> },
      ],
    },
    {
      label: t("sidebar.groupContainers"),
      items: [
        { label: t("sidebar.rebuild"), path: "/administration/docker-rebuild", icon: <BuildIcon /> },
        { label: t("sidebar.cleanup"), path: "/administration/container-cleanup", icon: <CleaningServicesIcon /> },
      ],
    },
  ];

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="conversations">
      <div
        className="main-menu-nav-item"
        onClick={() => navigate("/")}
      >
        <ChevronLeftIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
        <span>{t("sidebar.back")}</span>
      </div>
      {menuGroups.map((group) => (
        <div key={group.label} className="admin-menu-group">
          <div className="admin-menu-group-label">{group.label}</div>
          {group.items.map((item) => (
            <div
              key={item.path}
              className={`conversation-item admin-menu-group-item ${isActive(item.path) ? "active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <div className="conversation-info">
                <div className="conversation-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {item.icon}
                  {item.label}
                  {item.badge > 0 && (
                    <span style={{
                      marginLeft: 4,
                      minWidth: 20,
                      height: 20,
                      borderRadius: "50%",
                      backgroundColor: "var(--joy-palette-primary-500, #1976d2)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default AdminSidebarMenu;
