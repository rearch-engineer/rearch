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
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SaveIcon from "@mui/icons-material/Save";

import { api } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";

const UNIT_DEFS = [
  { value: "minutes", labelKey: "containerCleanup.unitMinutes", toMinutes: (v) => v,           fromMinutes: (m) => m,             min: 1,  max: 1440  },
  { value: "hours",   labelKey: "containerCleanup.unitHours",   toMinutes: (v) => v * 60,      fromMinutes: (m) => m / 60,        min: 1,  max: 168   },
  { value: "days",    labelKey: "containerCleanup.unitDays",    toMinutes: (v) => v * 60 * 24, fromMinutes: (m) => m / 60 / 24,   min: 1,  max: 7     },
];

/**
 * Given a value in minutes, pick the best-fitting display unit.
 */
function minutesToDisplay(totalMinutes) {
  if (totalMinutes >= 1440 && totalMinutes % 1440 === 0) return { amount: totalMinutes / 1440, unit: "days" };
  if (totalMinutes >= 60 && totalMinutes % 60 === 0)     return { amount: totalMinutes / 60,   unit: "hours" };
  return { amount: totalMinutes, unit: "minutes" };
}

function toMinutes(amount, unit) {
  const u = UNIT_DEFS.find((o) => o.value === unit);
  return u ? u.toMinutes(amount) : amount;
}

// ─── Reusable duration input ──────────────────────────────────────────────────

function DurationInput({ label, description, amount, unit, saving, onChange, t }) {
  const unitDef = UNIT_DEFS.find((u) => u.value === unit);

  const handleAmountChange = (e) => {
    onChange({ amount: e.target.value === "" ? "" : Number(e.target.value), unit });
  };

  const handleAmountCommit = () => {
    const val = Number(amount);
    if (!Number.isFinite(val) || val < unitDef.min || val > unitDef.max) return;
    onChange({ amount: val, unit, commit: true });
  };

  const handleUnitChange = (_, newUnit) => {
    if (!newUnit) return;
    const currentMinutes = toMinutes(amount || unitDef.min, unit);
    const newDef = UNIT_DEFS.find((u) => u.value === newUnit);
    let newAmount = Math.round(newDef.fromMinutes(currentMinutes));
    newAmount = Math.max(newDef.min, Math.min(newDef.max, newAmount));
    onChange({ amount: newAmount, unit: newUnit, commit: true });
  };

  return (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      {description && (
        <Typography level="body-xs" sx={{ color: "var(--text-secondary)", mb: 0.5 }}>
          {description}
        </Typography>
      )}
      <Stack direction="row" spacing={1} alignItems="center">
        <Input
          size="sm"
          type="number"
          value={amount}
          onChange={handleAmountChange}
          onKeyDown={(e) => e.key === "Enter" && handleAmountCommit()}
          onBlur={handleAmountCommit}
          disabled={saving}
          slotProps={{ input: { min: unitDef?.min ?? 1, max: unitDef?.max ?? 9999 } }}
          sx={{ width: 100, fontFamily: "monospace" }}
        />
        <Select
          size="sm"
          value={unit}
          onChange={handleUnitChange}
          disabled={saving}
          sx={{ minWidth: 120 }}
        >
          {UNIT_DEFS.map((u) => (
            <Option key={u.value} value={u.value}>{t(u.labelKey)}</Option>
          ))}
        </Select>
      </Stack>
    </FormControl>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContainerCleanupSettings() {
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [hasRearchEnabled, setHasRearchEnabled] = useState(false);

  const [enabled, setEnabled] = useState(false);

  // Stop timeout state
  const [stopAmount, setStopAmount] = useState(30);
  const [stopUnit, setStopUnit] = useState("minutes");

  // Remove timeout state
  const [removeAmount, setRemoveAmount] = useState(1);
  const [removeUnit, setRemoveUnit] = useState("days");

  const [lastTriggeredAt, setLastTriggeredAt] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [settings, subResources] = await Promise.all([
        api.getContainerCleanupSettings(),
        api.getAllSubResources(),
      ]);

      setEnabled(settings.enabled || false);

      const stopDisplay = minutesToDisplay(settings.idleStopMinutes || 30);
      setStopAmount(stopDisplay.amount);
      setStopUnit(stopDisplay.unit);

      const removeDisplay = minutesToDisplay(settings.idleRemoveMinutes || 1440);
      setRemoveAmount(removeDisplay.amount);
      setRemoveUnit(removeDisplay.unit);

      setLastTriggeredAt(settings.lastTriggeredAt || null);
      setHasRearchEnabled(subResources.some((sr) => sr.rearch?.enabled === true));
    } catch (err) {
      toast.error(t("containerCleanup.failedToLoadSettings", { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (overrides = {}) => {
    try {
      setSaving(true);
      const data = {
        enabled: overrides.enabled !== undefined ? overrides.enabled : enabled,
        idleStopMinutes: overrides.idleStopMinutes !== undefined
          ? overrides.idleStopMinutes
          : toMinutes(stopAmount, stopUnit),
        idleRemoveMinutes: overrides.idleRemoveMinutes !== undefined
          ? overrides.idleRemoveMinutes
          : toMinutes(removeAmount, removeUnit),
      };
      await api.updateContainerCleanupSettings(data);
      toast.success(t("containerCleanup.settingsSaved"));
    } catch (err) {
      toast.error(t("containerCleanup.failedToSaveSettings", { message: err.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (e) => {
    const newEnabled = e.target.checked;
    setEnabled(newEnabled);
    await handleSave({ enabled: newEnabled });
  };

  const handleStopChange = ({ amount, unit }) => {
    setStopAmount(amount);
    setStopUnit(unit);
    setIsDirty(true);
  };

  const handleRemoveChange = ({ amount, unit }) => {
    setRemoveAmount(amount);
    setRemoveUnit(unit);
    setIsDirty(true);
  };

  const handleSaveClick = async () => {
    const stopDef = UNIT_DEFS.find((u) => u.value === stopUnit);
    const removeDef = UNIT_DEFS.find((u) => u.value === removeUnit);
    const stopVal = Number(stopAmount);
    const removeVal = Number(removeAmount);

    if (!Number.isFinite(stopVal) || stopVal < stopDef.min || stopVal > stopDef.max) {
      toast.error(t("containerCleanup.stopThresholdError", { min: stopDef.min, max: stopDef.max, unit: t(stopDef.labelKey).toLowerCase() }));
      return;
    }
    if (!Number.isFinite(removeVal) || removeVal < removeDef.min || removeVal > removeDef.max) {
      toast.error(t("containerCleanup.removeThresholdError", { min: removeDef.min, max: removeDef.max, unit: t(removeDef.labelKey).toLowerCase() }));
      return;
    }

    await handleSave();
    setIsDirty(false);
  };

  const handleTriggerCleanup = async () => {
    const confirmed = await confirm({
      title: t("containerCleanup.triggerCleanupTitle"),
      message: t("containerCleanup.triggerCleanupMessage"),
      confirmText: t("containerCleanup.continue"),
      confirmColor: "warning",
    });
    if (!confirmed) return;

    try {
      setTriggering(true);
      const result = await api.triggerContainerCleanup();
      setLastTriggeredAt(new Date().toISOString());
      const parts = [];
      if (result.stoppedCount > 0) parts.push(`${result.stoppedCount} stopped`);
      if (result.removedCount > 0) parts.push(`${result.removedCount} removed`);
      toast.success(
        parts.length > 0
          ? t("containerCleanup.cleanupComplete", { details: parts.join(", ") })
          : t("containerCleanup.cleanupCompleteNoIdle")
      );
    } catch (err) {
      toast.error(t("containerCleanup.failedToTriggerCleanup", { message: err.message }));
    } finally {
      setTriggering(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return t("containerCleanup.never");
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!hasRearchEnabled) {
    return (
      <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, bgcolor: 'var(--bg-primary)', overflow: 'auto' }}>
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
        <Typography level="h3" sx={{ mb: 3 }}>{t("containerCleanup.title")}</Typography>
        <Alert variant="soft" color="neutral" startDecorator={<InfoOutlinedIcon />}>
          <Box>
            <Typography level="title-sm">{t("containerCleanup.noRearchEnabled")}</Typography>
            <Typography level="body-sm">
              {t("containerCleanup.noRearchEnabledDescription")}
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
      <Typography level="h3" sx={{ mb: 3 }}>{t("containerCleanup.title")}</Typography>

      {/* Enable toggle + thresholds */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <CleaningServicesIcon sx={{ color: "var(--text-secondary)" }} />
            <Typography level="title-md">{t("containerCleanup.scheduledCleanup")}</Typography>
          </Stack>

          <Typography
            level="body-sm"
            sx={{ color: "var(--text-secondary)", mb: 2 }}
          >
            {t("containerCleanup.scheduledCleanupDescription")}
          </Typography>

          <Stack spacing={2.5}>
            {/* Master toggle */}
            <FormControl
              orientation="horizontal"
              sx={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <Box>
                <FormLabel sx={{ mb: 0 }}>{t("containerCleanup.enableIdleContainerCleanup")}</FormLabel>
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

                {/* Stop threshold */}
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <StopCircleOutlinedIcon sx={{ mt: 0.5, color: "var(--joy-palette-warning-500, #ed6c02)" }} />
                  <Box sx={{ flex: 1 }}>
                    <DurationInput
                      label={t("containerCleanup.stopIdleContainersAfter")}
                      description={t("containerCleanup.stopIdleContainersDescription")}
                      amount={stopAmount}
                      unit={stopUnit}
                      saving={saving}
                      onChange={handleStopChange}
                      t={t}
                    />
                  </Box>
                </Stack>

                {/* Remove threshold */}
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <DeleteOutlineIcon sx={{ mt: 0.5, color: "var(--joy-palette-danger-500, #d32f2f)" }} />
                  <Box sx={{ flex: 1 }}>
                    <DurationInput
                      label={t("containerCleanup.removeStoppedContainersAfter")}
                      description={t("containerCleanup.removeStoppedContainersDescription")}
                      amount={removeAmount}
                      unit={removeUnit}
                      saving={saving}
                      onChange={handleRemoveChange}
                      t={t}
                    />
                  </Box>
                </Stack>

                {/* Save button */}
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="solid"
                    color="primary"
                    size="sm"
                    startDecorator={saving ? <CircularProgress size="sm" /> : <SaveIcon />}
                    disabled={!isDirty || saving}
                    loading={saving}
                    onClick={handleSaveClick}
                  >
                    {t("containerCleanup.save")}
                  </Button>
                </Box>

                <Divider />

                {/* Last run chip */}
                <Box>
                  <Typography level="body-sm" fontWeight="bold" sx={{ color: "var(--text-secondary)", mb: 0.5 }}>
                    {t("containerCleanup.lastCleanupRun")}
                  </Typography>
                  <Chip size="sm" variant="soft" color={lastTriggeredAt ? "primary" : "neutral"}>
                    {formatDate(lastTriggeredAt)}
                  </Chip>
                </Box>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Manual Cleanup Card */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <CleaningServicesIcon sx={{ color: "var(--text-secondary)" }} />
            <Typography level="title-md">{t("containerCleanup.manualCleanup")}</Typography>
          </Stack>

          <Typography level="body-sm" sx={{ color: "var(--text-secondary)", mb: 2 }}>
            {t("containerCleanup.manualCleanupDescription")}
          </Typography>

          <Button
            variant="solid"
            color="warning"
            startDecorator={triggering ? <CircularProgress size="sm" /> : <PlayArrowIcon />}
            loading={triggering}
            onClick={handleTriggerCleanup}
          >
            {t("containerCleanup.runCleanupNow")}
          </Button>
        </CardContent>
      </Card>
    </Box>
    </Box>
  );
}
