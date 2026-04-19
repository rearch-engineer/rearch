import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import LockIcon from "@mui/icons-material/Lock";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import { useTranslation } from "react-i18next";

const AccountSidebarMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("Account");

  const menuItems = [
    { label: t("preferences"), path: "/account/preferences", icon: <SettingsOutlined /> },
    { label: t("security"), path: "/account/security", icon: <LockIcon /> },
  ];

  return (
    <div className="conversations">
      <div
        className="main-menu-nav-item"
        onClick={() => navigate("/")}
      >
        <ChevronLeftIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
        <span>{t("back")}</span>
      </div>
      <Box className="main-menu-section-title" sx={{ color: "#5E5E5E" }}>
        <Typography level="body-sm" sx={{ color: "inherit" }}>{t("account")}</Typography>
      </Box>
      {menuItems.map((item) => (
        <div
          key={item.path}
          className={`conversation-item ${location.pathname === item.path || location.pathname.startsWith(item.path + "/") ? "active" : ""}`}
          onClick={() => navigate(item.path)}
        >
          <div className="conversation-info">
            <div className="conversation-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {item.icon}
              {item.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AccountSidebarMenu;
