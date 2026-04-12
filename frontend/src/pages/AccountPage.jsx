import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Box,
  Sheet,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  Typography,
} from "@mui/joy";
import LockIcon from "@mui/icons-material/Lock";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import ChangePassword from "../components/Account/ChangePassword";
import Preferences from "../components/Account/Preferences";
import { useAuth } from "../contexts/AuthContext";

export default function AccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const menuItems = [
    {
      label: "Preferences",
      path: "/account/preferences",
      icon: <SettingsIcon />,
    },
    {
      label: "Security",
      path: "/account/security",
      icon: <LockIcon />,
    },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <Sheet
        sx={{
          width: 250,
          height: "100%",
          borderRight: "1px solid",
          borderColor: "divider",
          overflow: "auto",
          p: 2,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.path}>
                <ListItemButton
                  selected={
                    location.pathname === item.path ||
                    location.pathname.startsWith(item.path + "/")
                  }
                  onClick={() => navigate(item.path)}
                  sx={{ borderRadius: "sm" }}
                >
                  {item.icon}
                  <ListItemContent sx={{ ml: 2 }}>
                    <Typography level="body-md">{item.label}</Typography>
                  </ListItemContent>
                </ListItemButton>
              </ListItem>
            ))}
            <ListItemButton onClick={handleLogout} sx={{ borderRadius: "sm" }}>
              <LogoutIcon />
              <ListItemContent sx={{ ml: 2 }}>
                <Typography level="body-md">Logout</Typography>
              </ListItemContent>
            </ListItemButton>
          </List>
        </Box>
      </Sheet>

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          height: "100%",
          overflow: "auto",
        }}
      >
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/account/preferences" replace />}
          />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/security" element={<ChangePassword />} />
        </Routes>
      </Box>
    </Box>
  );
}
