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
} from "@mui/joy";
import { Search, Add, AutoAwesome, FolderOutlined } from "@mui/icons-material";
import { api } from "../../../api/client";
import { TEMPLATE_OPTIONS } from "./serviceIcons";

function templateLabel(value) {
  return TEMPLATE_OPTIONS.find((o) => o.value === value)?.label || value;
}

function AgentCard({ agent, onClick }) {
  const { t } = useTranslation("Administration");
  return (
    <Card
      data-testid={`agent-admin-card-${agent.name}`}
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
            width: 64,
            minWidth: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: agent.enabled
              ? "rgba(16, 163, 127, 0.10)"
              : "rgba(107, 114, 128, 0.08)",
          }}
        >
          <AutoAwesome
            sx={{
              fontSize: 26,
              color: agent.enabled ? "#10a37f" : "var(--text-tertiary)",
            }}
          />
        </Box>
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
              {agent.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Chip size="sm" variant="soft" color="neutral">
                {agent.template
                  ? templateLabel(agent.template)
                  : t("agents.templateCustomShort")}
              </Chip>
              <Chip
                size="sm"
                variant="soft"
                color={agent.enabled ? "success" : "neutral"}
              >
                {agent.enabled ? t("agents.enabled") : t("agents.disabled")}
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
            {agent.description || " "}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
            <FolderOutlined sx={{ fontSize: 14, color: "var(--text-tertiary)" }} />
            <Typography level="body-xs" sx={{ color: "var(--text-tertiary)" }}>
              {agent.repositoryName
                ? `${agent.repositoryName}${agent.connectionName ? ` · ${agent.connectionName}` : ""}`
                : t("agents.noRepository")}
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Card>
  );
}

function AgentsSettings() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setAgents(await api.getAdminAgents());
      } catch (error) {
        console.error("Error loading agents:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = agents.filter((a) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      a.name.toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q) ||
      (a.repositoryName || "").toLowerCase().includes(q)
    );
  });

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
      <Box sx={{ maxWidth: 960, mx: "auto", mb: 4 }}>
        <Typography level="h3" sx={{ mb: 1 }}>
          {t("agents.title")}
        </Typography>
        <Typography level="body-md" sx={{ color: "var(--text-secondary)" }}>
          {t("agents.description")}
        </Typography>
      </Box>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems="center"
        sx={{ maxWidth: 960, mx: "auto", mb: 3 }}
      >
        <Input
          placeholder={t("agents.searchPlaceholder")}
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
        <Button
          data-testid="new-agent-btn"
          size="sm"
          variant="solid"
          startDecorator={<Add fontSize="small" />}
          onClick={() => navigate("/administration/agents/new")}
          sx={{
            flexShrink: 0,
            bgcolor: "#fff",
            color: "#000",
            "&:hover": { bgcolor: "#e5e5e5" },
          }}
        >
          {t("agents.newAgent")}
        </Button>
      </Stack>

      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {loading ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography level="body-lg" sx={{ color: "var(--text-secondary)" }}>
              {t("agents.loading")}
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
            {agents.length > 0 ? (
              <>
                <Typography level="h4" sx={{ mb: 1 }}>
                  {t("agents.noResults", { query: searchQuery })}
                </Typography>
                <Typography level="body-md" sx={{ color: "var(--text-secondary)" }}>
                  {t("agents.tryDifferentSearch")}
                </Typography>
              </>
            ) : (
              <>
                <Typography level="h4" sx={{ mb: 1 }}>
                  {t("agents.noAgentsYet")}
                </Typography>
                <Typography
                  level="body-md"
                  sx={{ color: "var(--text-secondary)", mb: 3 }}
                >
                  {t("agents.createFirst")}
                </Typography>
                <Button
                  variant="solid"
                  startDecorator={<Add />}
                  onClick={() => navigate("/administration/agents/new")}
                  sx={{
                    bgcolor: "#fff",
                    color: "#000",
                    "&:hover": { bgcolor: "#e5e5e5" },
                  }}
                >
                  {t("agents.newAgent")}
                </Button>
              </>
            )}
          </Card>
        ) : (
          <Stack spacing={2}>
            {filtered.map((agent) => (
              <AgentCard
                key={agent._id}
                agent={agent}
                onClick={() => navigate(`/administration/agents/${agent._id}`)}
              />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default AgentsSettings;
