import React from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Box } from "@mui/joy";
import WorkspaceGeneralSettings from "../../components/WorkspaceSettings/GeneralSettings";
import WorkspaceMembersSettings from "../../components/WorkspaceSettings/MembersSettings";

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams();

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        bgcolor: "var(--bg-primary)",
      }}
    >
      <Routes>
        <Route
          path="/"
          element={
            <Navigate
              to={`/workspace/${workspaceId}/settings/general`}
              replace
            />
          }
        />
        <Route path="/general" element={<WorkspaceGeneralSettings />} />
        <Route path="/members" element={<WorkspaceMembersSettings />} />
      </Routes>
    </Box>
  );
}
