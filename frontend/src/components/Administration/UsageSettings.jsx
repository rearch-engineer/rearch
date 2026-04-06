import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box,
  Sheet,
  Typography,
  Button,
  ButtonGroup,
  Select,
  Option,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  Input,
  Table,
  Chip,
  Link,
} from "@mui/joy";
import UserAvatar from "../UserAvatar";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import MergeIcon from "@mui/icons-material/MergeType";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { api } from "../../api/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateString(date) {
  // Returns YYYY-MM-DD in local time
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateString(d);
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sublabel }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 160 }}>
      <CardContent sx={{ alignItems: "center", textAlign: "center", gap: 0.5 }}>
        <Box sx={{ color: "primary.500", mb: 0.5 }}>{icon}</Box>
        <Typography level="h3" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
        <Typography level="body-sm" sx={{ color: "text.secondary" }}>
          {label}
        </Typography>
        {sublabel && (
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            {sublabel}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CostTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Sheet
      variant="outlined"
      sx={{ p: 1.5, borderRadius: "sm", boxShadow: "sm" }}
    >
      <Typography level="body-sm" fontWeight="bold">
        {formatDateShort(label)}
      </Typography>
      {payload.map((entry, i) => (
        <Typography key={i} level="body-xs" sx={{ color: entry.color }}>
          {entry.name}: {entry.name.toLowerCase().includes("cost") ? `$${entry.value.toFixed(4)}` : entry.value}
        </Typography>
      ))}
    </Sheet>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UsageSettings() {
  // ── State ────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(daysAgoStr(7));
  const [dateTo, setDateTo] = useState(toDateString(new Date()));
  const [activeRange, setActiveRange] = useState(7); // tracks which quick button is "active", null if custom
  const [filterUserId, setFilterUserId] = useState("");
  const [filterSubResource, setFilterSubResource] = useState("");
  const [filters, setFilters] = useState({ users: [], subResources: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);

  // ── Quick range handler ──────────────────────────────────────────────
  const handleQuickRange = useCallback((days) => {
    setDateFrom(daysAgoStr(days));
    setDateTo(toDateString(new Date()));
    setActiveRange(days);
  }, []);

  // ── Custom date change handlers ─────────────────────────────────────
  const handleFromChange = useCallback((e) => {
    setDateFrom(e.target.value);
    setActiveRange(null);
  }, []);
  const handleToChange = useCallback((e) => {
    setDateTo(e.target.value);
    setActiveRange(null);
  }, []);

  // ── Derived ISO strings for the API ──────────────────────────────────
  const fromISO = useMemo(() => new Date(dateFrom + "T00:00:00").toISOString(), [dateFrom]);
  const toISO = useMemo(() => new Date(dateTo + "T23:59:59").toISOString(), [dateTo]);

  // ── Fetch filters (once) ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await api.getUsageFilters();
        if (!cancelled) setFilters(f);
      } catch (err) {
        console.error("Failed to fetch usage filters:", err);
      } finally {
        if (!cancelled) setFiltersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch usage data ────────────────────────────────────────────────
  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const params = { from: fromISO, to: toISO };
      if (filterUserId) params.userId = filterUserId;
      if (filterSubResource) params.subResource = filterSubResource;
      const result = await api.getUsage(params);
      setData(result);
    } catch (err) {
      console.error("Failed to fetch usage data:", err);
    } finally {
      setLoading(false);
    }
  }, [fromISO, toISO, filterUserId, filterSubResource]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // ── Group sub-resources by parent resource for the dropdown ──────────
  const groupedSubResources = useMemo(() => {
    const groups = {};
    for (const sr of filters.subResources) {
      const groupKey = sr.resourceName || "Other";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(sr);
    }
    return groups;
  }, [filters.subResources]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: 3, height: "100%", overflow: "auto" }}>
      {/* Header + Controls */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          mb: 3,
        }}
      >
        <Typography level="h4">Usage</Typography>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          {/* Quick date range buttons */}
          <ButtonGroup size="sm" variant="outlined">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.days}
                variant={activeRange === opt.days ? "solid" : "outlined"}
                onClick={() => handleQuickRange(opt.days)}
              >
                {opt.label}
              </Button>
            ))}
          </ButtonGroup>

          {/* Custom date range inputs */}
          <Input
            type="date"
            size="sm"
            value={dateFrom}
            onChange={handleFromChange}
            slotProps={{ input: { max: dateTo } }}
            sx={{ width: 150 }}
          />
          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>to</Typography>
          <Input
            type="date"
            size="sm"
            value={dateTo}
            onChange={handleToChange}
            slotProps={{ input: { min: dateFrom } }}
            sx={{ width: 150 }}
          />

          {/* User filter */}
          <Select
            size="sm"
            placeholder="All users"
            value={filterUserId}
            onChange={(_, val) => setFilterUserId(val || "")}
            sx={{ minWidth: 160 }}
            slotProps={{ listbox: { sx: { maxHeight: 280 } } }}
          >
            <Option value="">All users</Option>
            {filters.users.map((u) => (
              <Option key={u._id} value={u._id}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <UserAvatar
                    avatarFileId={u.avatarFileId}
                    fallbackName={u.displayName}
                    size="sm"
                    sx={{ width: 20, height: 20, fontSize: "0.65rem" }}
                  />
                  {u.displayName}
                </Box>
              </Option>
            ))}
          </Select>

          {/* Repo filter */}
          <Select
            size="sm"
            placeholder="All repositories"
            value={filterSubResource}
            onChange={(_, val) => setFilterSubResource(val || "")}
            sx={{ minWidth: 200 }}
            slotProps={{ listbox: { sx: { maxHeight: 280 } } }}
          >
            <Option value="">All repositories</Option>
            {Object.entries(groupedSubResources).map(([group, items]) => (
              <React.Fragment key={group}>
                <Option disabled value={`__group_${group}`} sx={{ fontWeight: "bold", fontSize: "xs", opacity: 0.7 }}>
                  {group}
                </Option>
                {items.map((sr) => (
                  <Option key={sr._id} value={sr._id}>
                    {sr.name}
                  </Option>
                ))}
              </React.Fragment>
            ))}
          </Select>
        </Box>
      </Box>

      {/* Loading state */}
      {(loading || filtersLoading) && !data && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Content */}
      {data && (
        <>
          {/* KPI Summary Cards */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
            <KpiCard
              icon={<AttachMoneyIcon />}
              label="Total Cost"
              value={`$${data.summary.totalCost.toFixed(4)}`}
              sublabel={data.summary.currency}
            />
            <KpiCard
              icon={<ChatBubbleOutlineIcon />}
              label="Conversations"
              value={data.summary.totalConversations}
            />
            <KpiCard
              icon={<TrendingUpIcon />}
              label="Avg Cost / Conversation"
              value={`$${data.summary.avgCostPerConversation.toFixed(4)}`}
            />
            <KpiCard
              icon={<RadioButtonCheckedIcon />}
              label="Active Conversations"
              value={data.summary.activeConversations}
              sublabel="Last message < 24h ago"
            />
            <KpiCard
              icon={<MergeIcon />}
              label="Pull Requests"
              value={data.summary.totalPullRequests}
            />
            <KpiCard
              icon={<CallSplitIcon />}
              label="Conversations with PRs"
              value={data.summary.conversationsWithPRs}
              sublabel={data.summary.totalConversations > 0
                ? `${Math.round((data.summary.conversationsWithPRs / data.summary.totalConversations) * 100)}% of total`
                : undefined}
            />
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Cost Over Time */}
          <Typography level="title-md" sx={{ mb: 2 }}>
            Cost Over Time
          </Typography>
          <Sheet
            variant="outlined"
            sx={{ p: 2, borderRadius: "sm", mb: 4, height: 300 }}
          >
            {data.costOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.costOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    fontSize={12}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    fontSize={12}
                    width={70}
                  />
                  <Tooltip content={<CostTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="Cost (USD)"
                    stroke="#1976d2"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                  No data for selected period
                </Typography>
              </Box>
            )}
          </Sheet>

          {/* Conversations Over Time */}
          <Typography level="title-md" sx={{ mb: 2 }}>
            Conversations Over Time
          </Typography>
          <Sheet
            variant="outlined"
            sx={{ p: 2, borderRadius: "sm", mb: 4, height: 300 }}
          >
            {data.conversationsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.conversationsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    fontSize={12}
                  />
                  <YAxis allowDecimals={false} fontSize={12} width={40} />
                  <Tooltip content={<CostTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="count"
                    name="Conversations"
                    fill="#42a5f5"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                  No data for selected period
                </Typography>
              </Box>
            )}
          </Sheet>

          {/* Pull Requests Over Time */}
          <Typography level="title-md" sx={{ mb: 2 }}>
            Pull Requests Over Time
          </Typography>
          <Sheet
            variant="outlined"
            sx={{ p: 2, borderRadius: "sm", mb: 4, height: 300 }}
          >
            {data.pullRequestsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.pullRequestsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateShort}
                    fontSize={12}
                  />
                  <YAxis allowDecimals={false} fontSize={12} width={40} />
                  <Tooltip content={<CostTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="count"
                    name="Pull Requests"
                    fill="#ab47bc"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                  No data for selected period
                </Typography>
              </Box>
            )}
          </Sheet>

          {/* Bottom row: Cost per User + Cost per Resource */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 3,
            }}
          >
            {/* Cost per User */}
            <Box>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Cost per User
              </Typography>
              <Sheet
                variant="outlined"
                sx={{ p: 2, borderRadius: "sm", height: 300 }}
              >
                {data.costPerUser.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.costPerUser}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `$${v}`}
                        fontSize={12}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        fontSize={12}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) => [`$${value.toFixed(4)}`, "Cost"]}
                      />
                      <Bar
                        dataKey="cost"
                        name="Cost (USD)"
                        fill="#66bb6a"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                    <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                      No data
                    </Typography>
                  </Box>
                )}
              </Sheet>
            </Box>

            {/* Cost per Resource/Repo */}
            <Box>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Cost per Repository
              </Typography>
              <Sheet
                variant="outlined"
                sx={{ p: 2, borderRadius: "sm", height: 300 }}
              >
                {data.costPerResource.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.costPerResource}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `$${v}`}
                        fontSize={12}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        fontSize={12}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) => [`$${value.toFixed(4)}`, "Cost"]}
                      />
                      <Bar
                        dataKey="cost"
                        name="Cost (USD)"
                        fill="#ffa726"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                    <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                      No data
                    </Typography>
                  </Box>
                )}
              </Sheet>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Conversations & Pull Requests Tables */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 3,
            }}
          >
            {/* Conversations Table */}
            <Box>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Conversations ({data.conversationsList?.length || 0})
              </Typography>
              <Sheet
                variant="outlined"
                sx={{ borderRadius: "sm", overflow: "auto", maxHeight: 480 }}
              >
                <Table
                  size="sm"
                  stickyHeader
                  sx={{
                    "& thead th": {
                      bgcolor: "background.surface",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                    },
                    "& tbody td": { fontSize: "0.8rem" },
                  }}
                >
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>User</th>
                      <th>Repository</th>
                      <th style={{ textAlign: "right" }}>Cost</th>
                      <th style={{ textAlign: "right" }}>PRs</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!data.conversationsList || data.conversationsList.length === 0) ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>
                          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                            No conversations for selected period
                          </Typography>
                        </td>
                      </tr>
                    ) : (
                      data.conversationsList.map((conv) => (
                        <tr key={conv._id}>
                          <td>
                            <Typography level="body-xs" noWrap sx={{ maxWidth: 200 }} title={conv.title}>
                              {conv.title}
                            </Typography>
                          </td>
                          <td>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                              <UserAvatar
                                avatarFileId={conv.userAvatarFileId}
                                fallbackName={conv.user}
                                size="sm"
                                sx={{ width: 20, height: 20, fontSize: "0.6rem", flexShrink: 0 }}
                              />
                              <Typography level="body-xs" noWrap>
                                {conv.user}
                              </Typography>
                            </Box>
                          </td>
                          <td>
                            <Typography level="body-xs" noWrap sx={{ maxWidth: 160 }} title={conv.repository}>
                              {conv.repository}
                            </Typography>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Typography level="body-xs">
                              ${conv.cost.toFixed(4)}
                            </Typography>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {conv.pullRequestsCount > 0 ? (
                              <Chip size="sm" variant="soft" color="primary">
                                {conv.pullRequestsCount}
                              </Chip>
                            ) : (
                              <Typography level="body-xs" sx={{ color: "text.tertiary" }}>0</Typography>
                            )}
                          </td>
                          <td>
                            <Typography level="body-xs" noWrap sx={{ color: "text.secondary" }}>
                              {formatDateTime(conv.createdAt)}
                            </Typography>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Sheet>
            </Box>

            {/* Pull Requests Table */}
            <Box>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Pull Requests ({data.pullRequestsList?.length || 0})
              </Typography>
              <Sheet
                variant="outlined"
                sx={{ borderRadius: "sm", overflow: "auto", maxHeight: 480 }}
              >
                <Table
                  size="sm"
                  stickyHeader
                  sx={{
                    "& thead th": {
                      bgcolor: "background.surface",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                    },
                    "& tbody td": { fontSize: "0.8rem" },
                  }}
                >
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Branch</th>
                      <th>Conversation</th>
                      <th>Created By</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!data.pullRequestsList || data.pullRequestsList.length === 0) ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>
                          <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                            No pull requests for selected period
                          </Typography>
                        </td>
                      </tr>
                    ) : (
                      data.pullRequestsList.map((pr) => (
                        <tr key={pr._id}>
                          <td>
                            <Link
                              href={pr.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              level="body-xs"
                              noWrap
                              sx={{ maxWidth: 200, display: "block" }}
                              title={pr.title}
                            >
                              {pr.title}
                            </Link>
                          </td>
                          <td>
                            <Typography level="body-xs" noWrap sx={{ maxWidth: 140, fontFamily: "monospace" }} title={pr.sourceBranch}>
                              {pr.sourceBranch}
                            </Typography>
                          </td>
                          <td>
                            <Typography level="body-xs" noWrap sx={{ maxWidth: 160 }} title={pr.conversationTitle}>
                              {pr.conversationTitle}
                            </Typography>
                          </td>
                          <td>
                            <Typography level="body-xs" noWrap>
                              {pr.createdBy}
                            </Typography>
                          </td>
                          <td>
                            <Typography level="body-xs" noWrap sx={{ color: "text.secondary" }}>
                              {formatDateTime(pr.createdAt)}
                            </Typography>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Sheet>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
