import React from "react";
import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Box } from "@mui/joy";
import GeneralSettings from "../components/Administration/GeneralSettings";
import LlmProvidersSettings from "../components/Administration/LlmProvidersSettings";
import SuggestedPromptsSettings from "../components/Administration/SuggestedPromptsSettings";
import SkillsSettings from "../components/Administration/SkillsSettings";
import SkillEditPage from "../components/Administration/SkillEditPage";
import UsersSettings from "../components/Administration/UsersSettings";
import JobsSettings from "../components/Administration/JobsSettings";
import UsageSettings from "../components/Administration/UsageSettings";
import DockerRebuildSettings from "../components/Administration/DockerRebuildSettings";
import ContainerCleanupSettings from "../components/Administration/ContainerCleanupSettings";
import McpServersSettings from "../components/Administration/McpServersSettings";
import McpServersGalleryPage from "../components/Administration/McpServersGalleryPage";
import McpServersManualPage from "../components/Administration/McpServersManualPage";
import McpServersEditPage from "../components/Administration/McpServersEditPage";
import ResourceListPage from "../components/Administration/Resources/ResourceListPage";
import ResourceTypeSelection from "../components/Administration/Resources/ResourceTypeSelection";
import ResourceFormPage from "../components/Administration/Resources/ResourceFormPage";
import ResourceDetailsPage from "../components/Administration/Resources/ResourceDetailsPage";
import SubResourceDetailsPage from "../components/Administration/Resources/SubResourceDetailsPage";
import SubResourcesListPage from "../components/Administration/Resources/SubResourcesListPage";
import BitbucketResourceForm from "../components/Administration/Resources/SubResources/Bitbucket/BitbucketResourceForm";

export default function AdministrationPage() {
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
          element={<Navigate to="/administration/general" replace />}
        />
        <Route path="/resources" element={<ResourceListPage />} />
        <Route path="/resources/new" element={<ResourceTypeSelection />} />
        <Route
          path="/resources/new/bitbucket"
          element={<BitbucketResourceForm />}
        />
        <Route path="/resources/:id" element={<ResourceDetailsPage />} />
        <Route path="/resources/:id/edit" element={<ResourceFormPage />} />
        <Route
          path="/resources/:id/subresources"
          element={<SubResourcesListPage />}
        />
        <Route
          path="/resources/:id/subresources/:subId"
          element={<SubResourceDetailsPage />}
        />
        <Route path="/general" element={<GeneralSettings />} />
        <Route path="/llm-providers" element={<LlmProvidersSettings />} />
        <Route path="/users" element={<UsersSettings />} />
        <Route path="/skills" element={<SkillsSettings />} />
        <Route path="/skills/:id" element={<SkillEditPage />} />
        <Route path="/jobs" element={<JobsSettings />} />
        <Route path="/docker-rebuild" element={<DockerRebuildSettings />} />
        <Route
          path="/container-cleanup"
          element={<ContainerCleanupSettings />}
        />
        <Route path="/mcp-servers" element={<McpServersSettings />} />
        <Route path="/mcp-servers/new" element={<McpServersGalleryPage />} />
        <Route
          path="/mcp-servers/new/manual"
          element={<McpServersManualPage />}
        />
        <Route path="/mcp-servers/:id" element={<McpServersEditPage />} />
        <Route
          path="/suggested-prompts"
          element={<SuggestedPromptsSettings />}
        />
        <Route path="/usage" element={<UsageSettings />} />
      </Routes>
    </Box>
  );
}
