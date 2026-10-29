import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Typography,
  Button,
  Stack,
  IconButton,
  Tooltip,
  Input,
  FormLabel,
  CircularProgress,
} from "@mui/joy";
import { Add, Delete as DeleteIcon } from "@mui/icons-material";
import { useToast } from "../../../contexts/ToastContext";
import {
  AVAILABLE_ICONS,
  SERVICE_PRESETS,
  ServiceIcon,
  getDuplicatePortIndices,
} from "./serviceIcons";

/**
 * Editor for the list of container services (label, icon, internal port) an
 * agent exposes. Controlled component: `services` in, `onChange(services)` out.
 */
export default function AgentServicesEditor({ services, onChange, loading = false }) {
  const { t } = useTranslation("Administration");
  const toast = useToast();
  const [iconPickerOpenIndex, setIconPickerOpenIndex] = useState(null);
  const iconPickerRef = useRef(null);

  useEffect(() => {
    if (iconPickerOpenIndex === null) return;
    const handleClickOutside = (e) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target)) {
        setIconPickerOpenIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [iconPickerOpenIndex]);

  const update = (index, patch) =>
    onChange(services.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const addPreset = (preset) => {
    if (
      preset.internalPort !== "" &&
      services.some((s) => s.internalPort === preset.internalPort)
    ) {
      toast.error(t("agents.portAlreadyInUse", { port: preset.internalPort }));
      return;
    }
    onChange([
      ...services,
      { label: preset.label, icon: preset.icon, internalPort: preset.internalPort },
    ]);
  };

  const duplicatePortIndices = getDuplicatePortIndices(services);

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <FormLabel sx={{ mb: 0 }}>{t("agents.containerServices")}</FormLabel>
        {loading && <CircularProgress size="sm" />}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap" }}>
        {SERVICE_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant="soft"
            color="primary"
            startDecorator={<Add />}
            onClick={() => addPreset(preset)}
            disabled={loading}
          >
            {preset.label}
          </Button>
        ))}
      </Stack>
      {services.length === 0 ? (
        <Typography level="body-sm" sx={{ color: "var(--text-secondary)" }}>
          {t("agents.noServicesConfigured")}
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          {services.map((service, index) => {
            const isDuplicate = duplicatePortIndices.has(index);
            const pickerOpen = iconPickerOpenIndex === index;
            return (
              <Box
                key={index}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "auto 140px 90px auto",
                  gap: 1,
                  alignItems: "center",
                }}
              >
                <Box sx={{ position: "relative" }} ref={pickerOpen ? iconPickerRef : null}>
                  <Tooltip title={t("agents.chooseIcon")} placement="top">
                    <IconButton
                      size="sm"
                      variant="soft"
                      color="primary"
                      onClick={() => setIconPickerOpenIndex(pickerOpen ? null : index)}
                      sx={{ width: 34, height: 34 }}
                    >
                      <ServiceIcon iconId={service.icon} />
                    </IconButton>
                  </Tooltip>
                  {pickerOpen && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        zIndex: 1400,
                        bgcolor: "var(--bg-secondary)",
                        border: "1px solid var(--joy-palette-neutral-outlinedBorder)",
                        borderRadius: "10px",
                        boxShadow: "var(--joy-shadow-md)",
                        p: 1,
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 0.5,
                        width: 192,
                      }}
                    >
                      {AVAILABLE_ICONS.map(({ id, label: iconLabel, Component }) => (
                        <Tooltip key={id} title={iconLabel} placement="top">
                          <IconButton
                            size="sm"
                            variant={service.icon === id ? "solid" : "plain"}
                            color={service.icon === id ? "primary" : "neutral"}
                            onClick={() => {
                              update(index, { icon: id });
                              setIconPickerOpenIndex(null);
                            }}
                            sx={{ flexDirection: "column", gap: 0.25, height: 44, borderRadius: "8px" }}
                          >
                            <Component sx={{ fontSize: 18 }} />
                            <Typography level="body-xs" sx={{ fontSize: "0.6rem", lineHeight: 1 }}>
                              {iconLabel}
                            </Typography>
                          </IconButton>
                        </Tooltip>
                      ))}
                    </Box>
                  )}
                </Box>

                <Input
                  size="sm"
                  value={service.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  placeholder="Label"
                  sx={{ bgcolor: "var(--bg-primary)" }}
                />

                <Input
                  size="sm"
                  type="number"
                  value={service.internalPort}
                  onChange={(e) =>
                    update(index, {
                      internalPort: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                  placeholder="Port"
                  color={isDuplicate ? "danger" : undefined}
                  error={isDuplicate}
                  sx={{ bgcolor: "var(--bg-primary)", fontFamily: "monospace" }}
                  endDecorator={
                    isDuplicate ? (
                      <Typography level="body-xs" color="danger" sx={{ whiteSpace: "nowrap" }}>
                        dupe
                      </Typography>
                    ) : null
                  }
                />

                <IconButton
                  size="sm"
                  variant="plain"
                  color="danger"
                  onClick={() => onChange(services.filter((_, i) => i !== index))}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
