import React from "react";
import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Box } from "@mui/joy";
import GeneralSettings from "../../components/Administration/GeneralSettings";
import LlmProvidersSettings from "../../components/Administration/LlmProvidersSettings";
import SuggestedPromptsSettings from "../../components/Administration/SuggestedPromptsSettings";
import SkillsSettings from "../../components/Administration/SkillsSettings";
import SkillEditPage from "../../components/Administration/SkillEditPage";
import UsersSettings from "../../components/Administration/UsersSettings";
import JobsSettings from "../../components/Administration/JobsSettings";
import UsageSettings from "../../components/Administration/UsageSettings";
import DockerRebuildSettings from "../../components/Administration/DockerRebuildSettings";
import ContainerCleanupSettings from "../../components/Administration/ContainerCleanupSettings";
import McpServersSettings from "../../components/Administration/McpServersSettings";
import McpServersGalleryPage from "../../components/Administration/McpServersGalleryPage";
import McpServersManualPage from "../../components/Administration/McpServersManualPage";
import McpServersOpenApiPage from "../../components/Administration/McpServersOpenApiPage";
import McpServersEditPage from "../../components/Administration/McpServersEditPage";
import RepositoriesListPage from "../../components/Administration/Resources/RepositoriesListPage";
import ConnectionListPage from "../../components/Administration/Resources/ConnectionListPage";
import ConnectionTypeSelection from "../../components/Administration/Resources/ConnectionTypeSelection";
import ConnectionFormPage from "../../components/Administration/Resources/ConnectionFormPage";
import ConnectionDetailsPage from "../../components/Administration/Resources/ConnectionDetailsPage";
import ResourceDetailsPage from "../../components/Administration/Resources/ResourceDetailsPage";
import ConnectionResourcesPage from "../../components/Administration/Resources/ConnectionResourcesPage";
import BitbucketConnectionForm from "../../components/Administration/Resources/Providers/Bitbucket/BitbucketConnectionForm";
import GithubConnectionForm from "../../components/Administration/Resources/Providers/Github/GithubConnectionForm";
import AgentsSettings from "../../components/Administration/Agents/AgentsSettings";
import AgentEditPage from "../../components/Administration/Agents/AgentEditPage";
import WorkspacesSettings from "../../components/Administration/WorkspacesSettings";
import WorkspaceEditPage from "../../components/Administration/WorkspaceEditPage";

export default function AdministrationPage() {
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
          element={<Navigate to="/administration/general" replace />}
        />
        {/* Resources: repositories are the first (and so far only) resource kind.
            Provider connections (Bitbucket / GitHub) hang below them. */}
        <Route
          path="/resources"
          element={<Navigate to="/administration/resources/repositories" replace />}
        />
        <Route path="/resources/repositories" element={<RepositoriesListPage />} />
        <Route path="/resources/connections" element={<ConnectionListPage />} />
        <Route
          path="/resources/connections/new"
          element={<ConnectionTypeSelection />}
        />
        <Route
          path="/resources/connections/new/bitbucket"
          element={<BitbucketConnectionForm />}
        />
        <Route
          path="/resources/connections/new/github"
          element={<GithubConnectionForm />}
        />
        <Route
          path="/resources/connections/:id"
          element={<ConnectionDetailsPage />}
        />
        <Route
          path="/resources/connections/:id/edit"
          element={<ConnectionFormPage />}
        />
        <Route
          path="/resources/connections/:id/resources"
          element={<ConnectionResourcesPage />}
        />
        <Route
          path="/resources/connections/:id/resources/:subId"
          element={<ResourceDetailsPage />}
        />
        {/* Agents: the unit users pick to start a conversation */}
        <Route path="/agents" element={<AgentsSettings />} />
        <Route path="/agents/new" element={<AgentEditPage />} />
        <Route path="/agents/:id" element={<AgentEditPage />} />
        <Route path="/general" element={<GeneralSettings />} />
        <Route path="/llm-providers" element={<LlmProvidersSettings />} />
        <Route path="/users" element={<UsersSettings />} />
        <Route path="/workspaces" element={<WorkspacesSettings />} />
        <Route path="/workspaces/:id" element={<WorkspaceEditPage />} />
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
        <Route
          path="/mcp-servers/new/openapi"
          element={<McpServersOpenApiPage />}
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
