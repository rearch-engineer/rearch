import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Box } from "@mui/joy";
import ChangePassword from "../../components/Account/ChangePassword";
import Preferences from "../../components/Account/Preferences";
import Tools from "../../components/Account/Tools";
import Integrations from "../../components/Account/Integrations";
import IntegrationsCallback from "../../components/Account/IntegrationsCallback";

export default function AccountPage() {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/account/preferences" replace />}
        />
        <Route path="/preferences" element={<Preferences />} />
        <Route path="/security" element={<ChangePassword />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/integrations/callback" element={<IntegrationsCallback />} />
      </Routes>
    </Box>
  );
}
