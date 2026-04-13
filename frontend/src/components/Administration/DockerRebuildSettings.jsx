import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  Divider,
} from "@mui/joy";
import BuildIcon from "@mui/icons-material/Build";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";

const UNIT_DEFS = [
  { value: "minutes", labelKey: "dockerRebuild.unitMinutes", toHours: (v) => v / 60, fromHours: (h) => Math.round(h * 60), min: 1, max: 43200 },
  { value: "hours", labelKey: "dockerRebuild.unitHours", toHours: (v) => v, fromHours: (h) => h, min: 1, max: 720 },
  { value: "days", labelKey: "dockerRebuild.unitDays", toHours: (v) => v * 24, fromHours: (h) => h / 24, min: 1, max: 30 },
  { value: "weeks", labelKey: "dockerRebuild.unitWeeks", toHours: (v) => v * 168, fromHours: (h) => h / 168, min: 1, max: 4 },
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
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const confirm = useConfirm();
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
      toast.error(t("dockerRebuild.failedToLoadSettings", { message: err.message }));
    } finally {
      setLoading(false);
      setCheckingRearch(false);
    }
  };

  const getIntervalHours = (amount, unit) => {
    const unitDef = UNIT_DEFS.find((u) => u.value === unit);
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
    const unitDef = UNIT_DEFS.find((u) => u.value === intervalUnit);
    const val = Number(intervalAmount);
    if (!Number.isInteger(val) || val < unitDef.min || val > unitDef.max) {
      toast.error(t("dockerRebuild.enterValueBetween", { min: unitDef.min, max: unitDef.max, unit: intervalUnit }));
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
    const newUnitDef = UNIT_DEFS.find((u) => u.value === newUnit);
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
      toast.success(t("dockerRebuild.settingsSaved"));
    } catch (err) {
      toast.error(t("dockerRebuild.failedToSaveSettings", { message: err.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerRebuildAll = async () => {
    const confirmed = await confirm({
      title: t("dockerRebuild.rebuildAllConfirmTitle"),
      message: t("dockerRebuild.rebuildAllConfirmMessage"),
      confirmText: t("dockerRebuild.continue"),
      confirmColor: "warning",
    });
    if (!confirmed) return;

    try {
      setTriggering(true);
      const result = await api.triggerDockerRebuildAll();
      setLastTriggeredAt(new Date().toISOString());
      toast.success(t("dockerRebuild.rebuildTriggered", { count: result.jobCount }));
    } catch (err) {
      toast.error(t("dockerRebuild.failedToTriggerRebuild", { message: err.message }));
    } finally {
      setTriggering(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return t("dockerRebuild.never");
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
          {t("dockerRebuild.title")}
        </Typography>
        <Alert
          variant="soft"
          color="neutral"
          startDecorator={<InfoOutlinedIcon />}
        >
          <Box>
            <Typography level="title-sm">
              {t("dockerRebuild.noRearchEnabled")}
            </Typography>
            <Typography level="body-sm">
              {t("dockerRebuild.noRearchEnabledDescription")}
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
        {t("dockerRebuild.title")}
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
            <Typography level="title-md">{t("dockerRebuild.scheduledRebuilds")}</Typography>
          </Stack>

          <Typography
            level="body-sm"
            sx={{ color: "var(--text-secondary)", mb: 2 }}
          >
            {t("dockerRebuild.scheduledRebuildsDescription")}
          </Typography>

          <Stack spacing={2.5}>
            {/* Master toggle */}
            <FormControl
              orientation="horizontal"
              sx={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <Box>
                <FormLabel sx={{ mb: 0 }}>{t("dockerRebuild.enableScheduledRebuilds")}</FormLabel>
              </Box>
              <Switch
                checked={enabled}
                onChange={handleToggleEnabled}
                color={enabled ? "success" : "neutral"}
                disabled={saving}
              />
            </FormControl>

            {enabled && (
              <>
                <Divider />

                <FormControl>
                  <FormLabel>{t("dockerRebuild.rebuildEvery")}</FormLabel>
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
                          min: UNIT_DEFS.find((u) => u.value === intervalUnit)?.min ?? 1,
                          max: UNIT_DEFS.find((u) => u.value === intervalUnit)?.max ?? 720,
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
                      {UNIT_DEFS.map((u) => (
                        <Option key={u.value} value={u.value}>
                          {t(u.labelKey)}
                        </Option>
                      ))}
                    </Select>
                  </Stack>
                </FormControl>

                <Divider />

                <Box>
                  <Typography
                    level="body-sm"
                    fontWeight="bold"
                    sx={{ color: "var(--text-secondary)", mb: 0.5 }}
                  >
                    {t("dockerRebuild.lastTriggered")}
                  </Typography>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={lastTriggeredAt ? "primary" : "neutral"}
                  >
                    {formatDate(lastTriggeredAt)}
                  </Chip>
                </Box>
              </>
            )}
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
            <Typography level="title-md">{t("dockerRebuild.manualRebuild")}</Typography>
          </Stack>

          <Typography
            level="body-sm"
            sx={{ color: "var(--text-secondary)", mb: 2 }}
          >
            {t("dockerRebuild.manualRebuildDescription")}
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
            {t("dockerRebuild.rebuildAllDockerImages")}
          </Button>
        </CardContent>
      </Card>
    </Box>
    </Box>
  );
}
