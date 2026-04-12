import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import LockIcon from "@mui/icons-material/Lock";
import LogoutIcon from "@mui/icons-material/Logout";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import { useAuth } from "../../contexts/AuthContext";

const AccountSidebarMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const menuItems = [
    { label: "Preferences", path: "/account/preferences", icon: <SettingsOutlined /> },
    { label: "Security", path: "/account/security", icon: <LockIcon /> },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="conversations">
      <div
        className="main-menu-nav-item"
        onClick={() => navigate("/")}
      >
        <ChevronLeftIcon sx={{ fontSize: 20, color: "var(--text-tertiary)" }} />
        <span>Back</span>
      </div>
      <Box className="main-menu-section-title" sx={{ color: "#5E5E5E" }}>
        <Typography level="body-sm" sx={{ color: "inherit" }}>Account</Typography>
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
      <div className="conversation-item" onClick={handleLogout}>
        <div className="conversation-info">
          <div className="conversation-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LogoutIcon />
            Logout
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSidebarMenu;
