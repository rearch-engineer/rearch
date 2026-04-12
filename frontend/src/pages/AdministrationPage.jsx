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
  Badge,
} from "@mui/joy";
import PersonIcon from "@mui/icons-material/Person";
import ArticleIcon from "@mui/icons-material/Article";
import PeopleIcon from "@mui/icons-material/People";
import WorkIcon from "@mui/icons-material/Work";
import SettingsIcon from "@mui/icons-material/Settings";
import BarChartIcon from "@mui/icons-material/BarChart";
import BuildIcon from "@mui/icons-material/Build";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import HubIcon from "@mui/icons-material/Hub";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import StorageIcon from "@mui/icons-material/Storage";
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
import { useJobs } from "../contexts/JobsContext";

export default function AdministrationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCount } = useJobs();

  const menuItems = [
    {
      label: "Resources",
      path: "/administration/resources",
      icon: <StorageIcon />,
    },
    {
      label: "General",
      path: "/administration/general",
      icon: <SettingsIcon />,
    },
    {
      label: "LLM Providers",
      path: "/administration/llm-providers",
      icon: <SmartToyIcon />,
    },
    {
      label: "Users",
      path: "/administration/users",
      icon: <PeopleIcon />,
    },
    {
      label: "Skills",
      path: "/administration/skills",
      icon: <ArticleIcon />,
    },
    {
      label: "Jobs",
      path: "/administration/jobs",
      icon: <WorkIcon />,
      badge: activeCount,
    },
    {
      label: "Docker Rebuild",
      path: "/administration/docker-rebuild",
      icon: <BuildIcon />,
    },
    {
      label: "Container Cleanup",
      path: "/administration/container-cleanup",
      icon: <CleaningServicesIcon />,
    },
    {
      label: "MCP Servers",
      path: "/administration/mcp-servers",
      icon: <HubIcon fontSize="small" />,
    },
    {
      label: "Suggested Prompts",
      path: "/administration/suggested-prompts",
      icon: <LightbulbIcon />,
    },
    {
      label: "Usage",
      path: "/administration/usage",
      icon: <BarChartIcon />,
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
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.path}>
              <ListItemButton
                selected={
                  location.pathname === item.path ||
                  location.pathname.startsWith(item.path + "/")
                }
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: "sm",
                }}
              >
                {item.badge > 0 ? (
                  <Badge badgeContent={item.badge} size="sm" color="primary">
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
                <ListItemContent sx={{ ml: 2 }}>
                  <Typography level="body-md">{item.label}</Typography>
                </ListItemContent>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
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
            element={<Navigate to="/administration/general" replace />}
          />
          <Route path="/resources" element={<ResourceListPage />} />
          <Route path="/resources/new" element={<ResourceTypeSelection />} />
          <Route path="/resources/new/bitbucket" element={<BitbucketResourceForm />} />
          <Route path="/resources/:id" element={<ResourceDetailsPage />} />
          <Route path="/resources/:id/edit" element={<ResourceFormPage />} />
          <Route path="/resources/:id/subresources" element={<SubResourcesListPage />} />
          <Route path="/resources/:id/subresources/:subId" element={<SubResourceDetailsPage />} />
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
          <Route path="/suggested-prompts" element={<SuggestedPromptsSettings />} />
          <Route path="/usage" element={<UsageSettings />} />
        </Routes>
      </Box>
    </Box>
  );
}
