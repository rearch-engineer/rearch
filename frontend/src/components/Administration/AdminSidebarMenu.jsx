import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Badge from "@mui/joy/Badge";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
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
import { useJobs } from "../../contexts/JobsContext";

const AdminSidebarMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCount } = useJobs();

  const menuGroups = [
    {
      label: "ReArch",
      items: [
        { label: "General", path: "/administration/general", icon: <SettingsOutlined /> },
        { label: "Users", path: "/administration/users", icon: <PeopleIcon /> },
        { label: "Usage", path: "/administration/usage", icon: <BarChartIcon /> },
        { label: "Jobs", path: "/administration/jobs", icon: <WorkIcon />, badge: activeCount },
      ],
    },
    {
      label: "Generative AI",
      items: [
        { label: "Providers", path: "/administration/llm-providers", icon: <SmartToyIcon /> },
        { label: "Skills", path: "/administration/skills", icon: <ArticleIcon /> },
        { label: "MCP Servers", path: "/administration/mcp-servers", icon: <HubIcon fontSize="small" /> },
        { label: "Suggested Prompts", path: "/administration/suggested-prompts", icon: <LightbulbIcon /> },
      ],
    },
    {
      label: "Repositories",
      items: [
        { label: "Resources", path: "/administration/resources", icon: <StorageIcon /> },
      ],
    },
    {
      label: "Containers",
      items: [
        { label: "Rebuild", path: "/administration/docker-rebuild", icon: <BuildIcon /> },
        { label: "Clean up", path: "/administration/container-cleanup", icon: <CleaningServicesIcon /> },
      ],
    },
  ];

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="conversations">
      <div
        className="main-menu-nav-item main-menu-go-back"
        onClick={() => navigate("/")}
      >
        <ArrowBackIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
        <span>Go back</span>
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
                  {item.badge > 0 ? (
                    <Badge badgeContent={item.badge} size="sm" color="primary">
                      {item.icon}
                    </Badge>
                  ) : (
                    item.icon
                  )}
                  {item.label}
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
