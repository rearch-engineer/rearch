import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Input, Table, Button, Chip, Stack, FormControl,
} from "@mui/joy";
import SearchIcon from "@mui/icons-material/Search";
import { api } from "../../api/client";

export default function WorkspacesSettings() {
  const { t } = useTranslation("Administration");
  const navigate = useNavigate();

  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const loadWorkspaces = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await api.getAdminWorkspaces({ search: search.trim() || undefined, page, limit: 20 });
      setWorkspaces(data.workspaces || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      console.error("Error loading workspaces:", err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadWorkspaces(1);
  }, []);

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    loadWorkspaces(1);
  };

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
      <Box sx={{ maxWidth: 960, mx: "auto" }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography level="h3" sx={{ mb: 3 }}>
            {t("workspaces.title")}
          </Typography>
        </Box>

        {/* Search */}
        <Box sx={{ mb: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems="flex-end"
          >
            <FormControl sx={{ flex: 1 }}>
              <Input
                size="sm"
                placeholder={t("workspaces.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                startDecorator={<SearchIcon sx={{ color: "var(--text-secondary)" }} />}
                sx={{
                  bgcolor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              />
            </FormControl>
          </Stack>
        </Box>

        {/* Workspaces table */}
        <Box
          sx={{
            bgcolor: "var(--bg-primary)",
            overflow: "auto",
          }}
        >
          <Table
            sx={{
              "& thead th": {
                bgcolor: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.8rem",
                borderBottom: "1px solid var(--border-color)",
              },
              "& tbody tr": {
                borderBottom: "1px solid var(--border-color)",
                "&:last-child": { borderBottom: "none" },
              },
              "& tbody td": { color: "var(--text-primary)" },
            }}
          >
            <thead>
              <tr>
                <th>{t("workspaces.name")}</th>
                <th>{t("workspaces.owner")}</th>
                <th style={{ width: 80 }}>{t("workspaces.members")}</th>
                <th style={{ width: 80 }}>{t("workspaces.type")}</th>
                <th style={{ width: 140 }}>{t("workspaces.created")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      {t("users.loading")}
                    </Typography>
                  </td>
                </tr>
              ) : workspaces.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "2rem" }}
                  >
                    <Typography
                      level="body-sm"
                      sx={{ color: "var(--text-secondary)" }}
                    >
                      {t("workspaces.noResults")}
                    </Typography>
                  </td>
                </tr>
              ) : (
                workspaces.map((ws) => (
                  <tr
                    key={ws._id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/administration/workspaces/${ws._id}`)}
                  >
                    <td>
                      <Typography
                        level="body-sm"
                        sx={{ fontWeight: 600, color: "var(--text-primary)" }}
                      >
                        {ws.name}
                      </Typography>
                    </td>
                    <td>
                      <Typography
                        level="body-xs"
                        sx={{ color: "var(--text-secondary)" }}
                      >
                        {ws.owner?.profile?.display_name || ws.owner?.account?.email || "—"}
                      </Typography>
                    </td>
                    <td>
                      <Typography
                        level="body-xs"
                        sx={{ color: "var(--text-secondary)" }}
                      >
                        {ws.memberCount ?? "—"}
                      </Typography>
                    </td>
                    <td>
                      {ws.isPersonal ? (
                        <Chip size="sm" variant="soft" color="neutral">
                          {t("workspaces.personal")}
                        </Chip>
                      ) : (
                        <Chip size="sm" variant="soft" color="primary">
                          {t("workspaces.shared")}
                        </Chip>
                      )}
                    </td>
                    <td>
                      <Typography
                        level="body-xs"
                        sx={{ color: "var(--text-secondary)" }}
                      >
                        {formatDate(ws.createdAt)}
                      </Typography>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Box>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 2,
              mt: 3,
            }}
          >
            <Button
              size="sm"
              variant="outlined"
              disabled={pagination.page <= 1}
              onClick={() => loadWorkspaces(pagination.page - 1)}
              sx={{
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {t("workspaces.prev")}
            </Button>
            <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
              {pagination.page} / {pagination.pages}
            </Typography>
            <Button
              size="sm"
              variant="outlined"
              disabled={pagination.page >= pagination.pages}
              onClick={() => loadWorkspaces(pagination.page + 1)}
              sx={{
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {t("workspaces.next")}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
