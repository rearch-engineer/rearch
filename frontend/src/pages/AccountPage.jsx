import React from "react";
import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Box } from "@mui/joy";
import ChangePassword from "../components/Account/ChangePassword";
import Preferences from "../components/Account/Preferences";

export default function AccountPage() {
  return (
    <Box
      sx={{
        width: "100%",
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
  );
}
