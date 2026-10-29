import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Chip,
  Stack,
  Input,
  Button,
  Select,
  Option,
} from "@mui/joy";
import { Search, Add, Hub } from "@mui/icons-material";
import { api } from "../../../api/client";

// Sub-resource types that represent a source-code repository.
// Keep in sync with backend/routes/api.js (conversation creation).
const REPOSITORY_TYPES = ["bitbucket-repository", "github-repository"];

const providerMeta = {
  bitbucket: {
    label: "Bitbucket",
    color: "#2684FF",
    bgTint: "rgba(38, 132, 255, 0.08)",
  },
  github: {
    label: "GitHub",
    color: "#24292f",
    bgTint: "rgba(36, 41, 47, 0.08)",
  },
};

function providerFromType(type) {
  return type?.split("-")[0] || "";
}

function RepositoryCard({ repo, agentCount, onClick }) {
  const { t } = useTranslation("Administration");
  const provider = providerFromType(repo.type);
  const meta = providerMeta[provider] || {
    label: provider,
    color: "#6b7280",
    bgTint: "rgba(107, 114, 128, 0.08)",
  };

  return (
    <Card
      variant="outlined"
      sx={{
        cursor: "pointer",
        p: 0,
        overflow: "hidden",
        transition: "all 0.2s ease",
        borderColor: "var(--border-color)",
        bgcolor: "var(--bg-primary)",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 4px 12px var(--shadow-color)",
          borderColor: "var(--text-tertiary)",
        },
      }}
      onClick={onClick}
    >
      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "stretch" }}>
        <Box
          sx={{
            width: 8,
            minWidth: 8,
            bgcolor: meta.color,
          }}
        />
        <Box sx={{ flex: 1, p: 2, minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 0.5 }}
          >
            <Typography
              level="title-md"
              sx={{
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {repo.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Chip
                size="sm"
                variant="soft"
                sx={{ bgcolor: meta.bgTint, color: "var(--text-primary)" }}
              >
                {meta.label}
              </Chip>
              <Chip
                size="sm"
                variant="soft"
                color={agentCount > 0 ? "success" : "neutral"}
              >
                {agentCount > 0
                  ? t("repositoriesList.agentCount", { count: agentCount })
                  : t("repositoriesList.noAgents")}
              </Chip>
            </Stack>
          </Stack>
          <Typography
            level="body-sm"
            sx={{
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {repo.data?.fullName || repo.description || " "}
          </Typography>
          <Typography
            level="body-xs"
            sx={{ color: "var(--text-tertiary)", mt: 0.5 }}
          >
            {t("repositoriesList.connections")}: {repo.resourceName}
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}

function RepositoriesListPage() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState([]);
  const [agentCounts, setAgentCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRepositories();
  }, []);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      // No type filter: fetch every imported sub-resource and keep repositories only.
      const [data, agents] = await Promise.all([
        api.getAllAdminSubResources(),
        api.getAdminAgents().catch(() => []),
      ]);
      setRepositories(
        (data || []).filter((sr) => REPOSITORY_TYPES.includes(sr.type)),
      );
      // Number of agents using each repository
      const counts = {};
      for (const agent of agents || []) {
        if (agent.repository) {
          const key = String(agent.repository);
          counts[key] = (counts[key] || 0) + 1;
        }
      }
      setAgentCounts(counts);
    } catch (error) {
      console.error("Error loading repositories:", error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = repositories.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !q ||
      r.name.toLowerCase().includes(q) ||
      (r.data?.fullName || "").toLowerCase().includes(q) ||
      (r.resourceName || "").toLowerCase().includes(q);
    const matchesProvider =
      providerFilter === "all" || providerFromType(r.type) === providerFilter;
    return matchesQuery && matchesProvider;
  });

  const goToConnections = () => navigate("/administration/resources/connections");

  return (
    <Box
      sx={{
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        bgcolor: "var(--bg-primary)",
        color: "var(--text-primary)",
        overflow: "auto",
      }}
    >
      {/* Header */}
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 4 }}>
        <Typography level="h3" sx={{ mb: 1 }}>
          {t("repositoriesList.title")}
        </Typography>
        <Typography level="body-md" sx={{ color: "var(--text-secondary)" }}>
          {t("repositoriesList.description")}
        </Typography>
      </Box>

      {/* Search & actions */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems="center"
        sx={{ maxWidth: 960, mx: "auto", mb: 3 }}
      >
        <Input
          placeholder={t("repositoriesList.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          startDecorator={<Search sx={{ color: "var(--text-secondary)" }} />}
          size="sm"
          sx={{
            flex: 1,
            bgcolor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
          }}
        />
        <Select
          size="sm"
          value={providerFilter}
          onChange={(_, value) => setProviderFilter(value || "all")}
          sx={{ minWidth: 160, bgcolor: "var(--bg-secondary)" }}
        >
          <Option value="all">{t("repositoriesList.allProviders")}</Option>
          <Option value="bitbucket">Bitbucket</Option>
          <Option value="github">GitHub</Option>
        </Select>
        <Button
          data-testid="repositories-connections-btn"
          size="sm"
          variant="outlined"
          startDecorator={<Hub fontSize="small" />}
          onClick={goToConnections}
          sx={{ flexShrink: 0 }}
        >
          {t("repositoriesList.connections")}
        </Button>
        <Button
          data-testid="repositories-import-btn"
          size="sm"
          variant="solid"
          startDecorator={<Add fontSize="small" />}
          onClick={goToConnections}
          sx={{
            flexShrink: 0,
            bgcolor: "#fff",
            color: "#000",
            "&:hover": { bgcolor: "#e5e5e5" },
          }}
        >
          {t("repositoriesList.import")}
        </Button>
      </Stack>

      {/* Repository list */}
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {loading ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
              {t("repositoriesList.loading")}
            </Typography>
          </Box>
        ) : filtered.length === 0 ? (
          <Card
            variant="outlined"
            sx={{
              textAlign: "center",
              py: 8,
              borderColor: "var(--border-color)",
              bgcolor: "var(--bg-primary)",
            }}
          >
            {repositories.length > 0 ? (
              <>
                <Typography level="h4" sx={{ mb: 1 }}>
                  {t("repositoriesList.noResults", { query: searchQuery })}
                </Typography>
                <Typography level="body-md" sx={{ color: "var(--text-secondary)" }}>
                  {t("repositoriesList.tryDifferentSearch")}
                </Typography>
              </>
            ) : (
              <>
                <Typography level="h4" sx={{ mb: 1 }}>
                  {t("repositoriesList.noRepositoriesYet")}
                </Typography>
                <Typography
                  level="body-md"
                  sx={{ color: "var(--text-secondary)", mb: 3 }}
                >
                  {t("repositoriesList.connectFirst")}
                </Typography>
                <Button
                  variant="solid"
                  startDecorator={<Add />}
                  onClick={goToConnections}
                  sx={{
                    bgcolor: "#fff",
                    color: "#000",
                    "&:hover": { bgcolor: "#e5e5e5" },
                  }}
                >
                  {t("repositoriesList.importFromConnection")}
                </Button>
              </>
            )}
          </Card>
        ) : (
          <Stack spacing={2}>
            {filtered.map((repo) => (
              <RepositoryCard
                key={repo._id}
                repo={repo}
                agentCount={agentCounts[String(repo._id)] || 0}
                onClick={() =>
                  navigate(
                    `/administration/resources/connections/${repo.resourceId}/subresources/${repo._id}`,
                  )
                }
              />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default RepositoriesListPage;
