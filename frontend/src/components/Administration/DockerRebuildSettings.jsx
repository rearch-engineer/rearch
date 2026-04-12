import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  Stack,
  Switch,
  Select,
  Option,
  Alert,
  CircularProgress,
  Chip,
  Input,
} from "@mui/joy";
import BuildIcon from "@mui/icons-material/Build";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";

const UNIT_OPTIONS = [
  { value: "minutes", label: "Minutes", toHours: (v) => v / 60, fromHours: (h) => Math.round(h * 60), min: 1, max: 43200 },
  { value: "hours", label: "Hours", toHours: (v) => v, fromHours: (h) => h, min: 1, max: 720 },
  { value: "days", label: "Days", toHours: (v) => v * 24, fromHours: (h) => h / 24, min: 1, max: 30 },
  { value: "weeks", label: "Weeks", toHours: (v) => v * 168, fromHours: (h) => h / 168, min: 1, max: 4 },
];

/**
 * Given a value in hours, pick the best-fitting unit and return { amount, unit }.
 */
function hoursToDisplay(totalHours) {
  if (totalHours >= 168 && totalHours % 168 === 0) return { amount: totalHours / 168, unit: "weeks" };
  if (totalHours >= 24 && totalHours % 24 === 0) return { amount: totalHours / 24, unit: "days" };
  if (Number.isInteger(totalHours) && totalHours >= 1) return { amount: totalHours, unit: "hours" };
  return { amount: Math.round(totalHours * 60), unit: "minutes" };
}

export default function DockerRebuildSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [hasRearchEnabled, setHasRearchEnabled] = useState(false);
  const [checkingRearch, setCheckingRearch] = useState(true);

  const [enabled, setEnabled] = useState(false);
  const [intervalAmount, setIntervalAmount] = useState(24);
  const [intervalUnit, setIntervalUnit] = useState("hours");
  const [lastTriggeredAt, setLastTriggeredAt] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setCheckingRearch(true);

      const [settings, subResources] = await Promise.all([
        api.getDockerRebuildSettings(),
        api.getAllSubResources(),
      ]);

      setEnabled(settings.enabled || false);
      const display = hoursToDisplay(settings.intervalHours || 24);
      setIntervalAmount(display.amount);
      setIntervalUnit(display.unit);
      setLastTriggeredAt(settings.lastTriggeredAt || null);

      // Check if any subresource has rearch.enabled
      const anyRearchEnabled = subResources.some(
        (sr) => sr.rearch?.enabled === true
      );
      setHasRearchEnabled(anyRearchEnabled);
    } catch (err) {
      toast.error("Failed to load docker rebuild settings: " + err.message);
    } finally {
      setLoading(false);
      setCheckingRearch(false);
    }
  };

  const getIntervalHours = (amount, unit) => {
    const unitDef = UNIT_OPTIONS.find((u) => u.value === unit);
    return unitDef ? unitDef.toHours(amount) : amount;
  };

  const handleToggleEnabled = async (e) => {
    const newEnabled = e.target.checked;
    setEnabled(newEnabled);
    await handleSave({ enabled: newEnabled, intervalHours: getIntervalHours(intervalAmount, intervalUnit) });
  };

  const handleAmountChange = (e) => {
    const val = e.target.value;
    setIntervalAmount(val === "" ? "" : Number(val));
  };

  const handleAmountCommit = async () => {
    const unitDef = UNIT_OPTIONS.find((u) => u.value === intervalUnit);
    const val = Number(intervalAmount);
    if (!Number.isInteger(val) || val < unitDef.min || val > unitDef.max) {
      toast.error(`Enter a value between ${unitDef.min} and ${unitDef.max} ${intervalUnit}.`);
      return;
    }
    await handleSave({ intervalHours: getIntervalHours(val, intervalUnit) });
  };

  const handleAmountKeyDown = (e) => {
    if (e.key === "Enter") handleAmountCommit();
  };

  const handleUnitChange = async (_, newUnit) => {
    if (!newUnit) return;
    // Convert the current amount to hours, then back to the new unit
    const currentHours = getIntervalHours(intervalAmount || 1, intervalUnit);
    const newUnitDef = UNIT_OPTIONS.find((u) => u.value === newUnit);
    let newAmount = Math.round(newUnitDef.fromHours(currentHours));
    newAmount = Math.max(newUnitDef.min, Math.min(newUnitDef.max, newAmount));
    setIntervalUnit(newUnit);
    setIntervalAmount(newAmount);
    await handleSave({ intervalHours: newUnitDef.toHours(newAmount) });
  };

  const handleSave = async (overrides = {}) => {
    try {
      setSaving(true);
      const hours = overrides.intervalHours !== undefined
        ? overrides.intervalHours
        : getIntervalHours(intervalAmount, intervalUnit);
      const data = {
        enabled: overrides.enabled !== undefined ? overrides.enabled : enabled,
        intervalHours: hours,
      };
      await api.updateDockerRebuildSettings(data);
      toast.success("Docker rebuild settings saved.");
    } catch (err) {
      toast.error(
        "Failed to save docker rebuild settings: " + err.message
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerRebuildAll = async () => {
    const confirmed = window.confirm(
      "This will rebuild all Docker images for every subresource with ReArch enabled. Continue?"
    );
    if (!confirmed) return;

    try {
      setTriggering(true);
      const result = await api.triggerDockerRebuildAll();
      setLastTriggeredAt(new Date().toISOString());
      toast.success(
        `Rebuild triggered: ${result.jobCount} job(s) queued.`
      );
    } catch (err) {
      toast.error(
        "Failed to trigger rebuild: " + err.message
      );
    } finally {
      setTriggering(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          p: 4,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!hasRearchEnabled) {
    return (
      <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, bgcolor: 'var(--bg-primary)', overflow: 'auto' }}>
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        <Typography level="h3" sx={{ mb: 3 }}>
          Docker Image Rebuilds
        </Typography>
        <Alert
          variant="soft"
          color="neutral"
          startDecorator={<InfoOutlinedIcon />}
        >
          <Box>
            <Typography level="title-sm">
              No ReArch integrations enabled
            </Typography>
            <Typography level="body-sm">
              Docker image rebuild scheduling is only available when at least one
              subresource has the ReArch integration enabled. Enable ReArch on a
              repository's settings to use this feature.
            </Typography>
          </Box>
        </Alert>
      </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, bgcolor: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'auto' }}>
      <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      <Typography level="h3" sx={{ mb: 3 }}>
        Docker Image Rebuilds
      </Typography>

      {/* Scheduled Rebuilds Card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <ScheduleIcon sx={{ color: "var(--text-secondary)" }} />
            <Typography level="title-md">Scheduled Rebuilds</Typography>
          </Stack>

          <Typography
            level="body-sm"
            sx={{ color: "var(--text-secondary)", mb: 2 }}
          >
            Automatically rebuild all Docker images for subresources with ReArch
            enabled at a regular interval. This ensures images stay up-to-date
            with the latest code changes.
          </Typography>

          <Stack spacing={2}>
            <FormControl
              orientation="horizontal"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box>
                <FormLabel sx={{ mb: 0 }}>Enable scheduled rebuilds</FormLabel>
                <Typography
                  level="body-xs"
                  sx={{ color: "var(--text-secondary)" }}
                >
                  When enabled, all ReArch Docker images will be rebuilt on the
                  selected interval
                </Typography>
              </Box>
              <Switch
                checked={enabled}
                onChange={handleToggleEnabled}
                color={enabled ? "success" : "neutral"}
                disabled={saving}
              />
            </FormControl>

            {enabled && (
              <FormControl>
                <FormLabel>Rebuild every</FormLabel>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Input
                    size="sm"
                    type="number"
                    value={intervalAmount}
                    onChange={handleAmountChange}
                    onKeyDown={handleAmountKeyDown}
                    onBlur={handleAmountCommit}
                    disabled={saving}
                    slotProps={{
                      input: {
                        min: UNIT_OPTIONS.find((u) => u.value === intervalUnit)?.min ?? 1,
                        max: UNIT_OPTIONS.find((u) => u.value === intervalUnit)?.max ?? 720,
                      },
                    }}
                    sx={{ width: 100, fontFamily: "monospace" }}
                  />
                  <Select
                    size="sm"
                    value={intervalUnit}
                    onChange={handleUnitChange}
                    disabled={saving}
                    sx={{ minWidth: 120 }}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <Option key={u.value} value={u.value}>
                        {u.label}
                      </Option>
                    ))}
                  </Select>
                </Stack>
              </FormControl>
            )}

            <Box>
              <Typography
                level="body-sm"
                fontWeight="bold"
                sx={{ color: "var(--text-secondary)", mb: 0.5 }}
              >
                Last triggered
              </Typography>
              <Chip
                size="sm"
                variant="soft"
                color={lastTriggeredAt ? "primary" : "neutral"}
              >
                {formatDate(lastTriggeredAt)}
              </Chip>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Manual Rebuild Card */}
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <BuildIcon sx={{ color: "var(--text-secondary)" }} />
            <Typography level="title-md">Manual Rebuild</Typography>
          </Stack>

          <Typography
            level="body-sm"
            sx={{ color: "var(--text-secondary)", mb: 2 }}
          >
            Immediately trigger a rebuild of all Docker images for every
            subresource with ReArch enabled. Each subresource will be queued as
            a separate job that you can monitor in the Jobs section.
          </Typography>

          <Button
            variant="solid"
            color="warning"
            startDecorator={
              triggering ? <CircularProgress size="sm" /> : <PlayArrowIcon />
            }
            loading={triggering}
            onClick={handleTriggerRebuildAll}
          >
            Rebuild All Docker Images
          </Button>
        </CardContent>
      </Card>
    </Box>
    </Box>
  );
}
