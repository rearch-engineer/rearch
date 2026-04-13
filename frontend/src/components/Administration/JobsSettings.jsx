import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  Typography,
  Chip,
  Divider,
  CircularProgress,
} from "@mui/joy";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { useSocket } from "../../contexts/SocketContext";
import { useJobs } from "../../contexts/JobsContext";
import { api } from "../../api/client";

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active: {
    label: "statusActive",
    color: "primary",
    icon: <PlayArrowIcon fontSize="small" />,
  },
  waiting: {
    label: "statusWaiting",
    color: "warning",
    icon: <HourglassEmptyIcon fontSize="small" />,
  },
  completed: {
    label: "statusCompleted",
    color: "success",
    icon: <CheckCircleIcon fontSize="small" />,
  },
  failed: {
    label: "statusFailed",
    color: "danger",
    icon: <ErrorIcon fontSize="small" />,
  },
};

function StatusChip({ status }) {
  const { t } = useTranslation("Administration");
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    color: "neutral",
    icon: null,
  };
  return (
    <Chip size="sm" variant="soft" color={cfg.color} startDecorator={cfg.icon}>
      {t(`jobs.${cfg.label}`)}
    </Chip>
  );
}

function formatTime(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return `${mins}m ${remainingSecs}s`;
}

/**
 * Displays a live-updating duration for active jobs,
 * or a static duration for completed/failed jobs.
 */
function LiveDuration({ start, end }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Only tick if the job is still running (no end time)
    if (!start || end) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [start, end]);

  if (!start) return <Typography level="body-sm">-</Typography>;

  const elapsed = (end || now) - start;
  return <Typography level="body-sm">{formatDuration(elapsed)}</Typography>;
}

// ─── Job List (left panel) ───────────────────────────────────────────────────

function JobList({ jobs, selectedJobKey, onSelect, loading }) {
  const { t } = useTranslation("Administration");
  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <CircularProgress size="sm" />
      </Box>
    );
  }

  if (jobs.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography level="body-sm" sx={{ color: "var(--text-tertiary)" }}>
          No jobs found
        </Typography>
      </Box>
    );
  }

  return (
    <List sx={{ "--ListItem-paddingY": "0.5rem" }}>
      {jobs.map((job) => {
        const key = `${job.queue}:${job.id}`;
        return (
          <ListItem key={key}>
            <ListItemButton
              selected={selectedJobKey === key}
              onClick={() => onSelect(job)}
              sx={{ borderRadius: "sm", alignItems: "flex-start", gap: 1 }}
            >
              <ListItemContent>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 0.5,
                  }}
                >
                  <Typography level="title-sm" noWrap>
                    {job.name}
                  </Typography>
                  <StatusChip status={job.status || job.state} />
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Chip size="sm" variant="outlined" color="neutral">
                    {job.queue}
                  </Chip>
                  <Typography level="body-xs" sx={{ color: "var(--text-tertiary)" }}>
                    {formatTime(job.timestamp)}
                  </Typography>
                </Box>
              </ListItemContent>
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}

// ─── Job Details (right panel) ───────────────────────────────────────────────

function JobDetails({ job, logs, logsLoading }) {
  const { t } = useTranslation("Administration");
  const logsEndRef = useRef(null);

  // Auto-scroll to the bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (!job) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <Typography level="body-md" sx={{ color: "var(--text-tertiary)" }}>
          Select a job to view details
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: "100%", overflow: "auto" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography level="h4">{job.name}</Typography>
        <StatusChip status={job.state || job.status} />
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Metadata */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "140px 1fr",
          gap: 1,
          mb: 3,
        }}
      >
        <Typography level="body-sm" fontWeight="bold">
          Job ID
        </Typography>
        <Typography level="body-sm">{job.id}</Typography>

        <Typography level="body-sm" fontWeight="bold">
          Queue
        </Typography>
        <Typography level="body-sm">{job.queue}</Typography>

        <Typography level="body-sm" fontWeight="bold">
          Created
        </Typography>
        <Typography level="body-sm">{formatTime(job.timestamp)}</Typography>

        <Typography level="body-sm" fontWeight="bold">
          Started
        </Typography>
        <Typography level="body-sm">{formatTime(job.processedOn)}</Typography>

        <Typography level="body-sm" fontWeight="bold">
          Finished
        </Typography>
        <Typography level="body-sm">{formatTime(job.finishedOn)}</Typography>

        <Typography level="body-sm" fontWeight="bold">
          Duration
        </Typography>
        <LiveDuration start={job.processedOn} end={job.finishedOn} />

        <Typography level="body-sm" fontWeight="bold">
          Attempts
        </Typography>
        <Typography level="body-sm">{job.attemptsMade ?? "-"}</Typography>
      </Box>

      {/* Failed reason */}
      {job.failedReason && (
        <>
          <Typography level="title-sm" sx={{ mb: 1, color: "danger.500" }}>
            Error
          </Typography>
          <Box
            sx={{
              p: 2,
              borderRadius: "sm",
              mb: 3,
              overflow: "auto",
              maxHeight: 200,
              bgcolor: "var(--joy-palette-danger-softBg, rgba(194,0,0,0.08))",
              border: "1px solid",
              borderColor: "var(--joy-palette-danger-outlinedBorder, #f09898)",
            }}
          >
            <Typography
              level="body-sm"
              fontFamily="monospace"
              whiteSpace="pre-wrap"
            >
              {job.failedReason}
            </Typography>
            {job.stacktrace && job.stacktrace.length > 0 && (
              <Typography
                level="body-xs"
                fontFamily="monospace"
                whiteSpace="pre-wrap"
                sx={{ mt: 1, color: "text.tertiary" }}
              >
                {job.stacktrace.join("\n")}
              </Typography>
            )}
          </Box>
        </>
      )}

      {/* Job data */}
      <Typography level="title-sm" sx={{ mb: 1 }}>
        Job Data
      </Typography>
      <Box
        sx={{
          p: 2,
          borderRadius: "sm",
          mb: 3,
          overflow: "auto",
          maxHeight: 200,
          bgcolor: "var(--bg-secondary)",
          border: "1px solid",
          borderColor: "var(--border-color)",
        }}
      >
        <Typography
          level="body-xs"
          fontFamily="monospace"
          whiteSpace="pre-wrap"
        >
          {JSON.stringify(job.data, null, 2)}
        </Typography>
      </Box>

      {/* Logs */}
      <Typography level="title-sm" sx={{ mb: 1 }}>
        {logs.length > 0 ? t("jobs.logsCount", { count: logs.length }) : t("jobs.logs")}
      </Typography>
      <Box
        sx={{
          p: 2,
          borderRadius: "sm",
          maxHeight: 350,
          overflow: "auto",
          bgcolor: "var(--bg-secondary)",
          border: "1px solid",
          borderColor: "var(--border-color)",
        }}
      >
        {logsLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size="sm" />
          </Box>
        ) : logs.length === 0 ? (
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            No logs available
          </Typography>
        ) : (
          logs.map((log, idx) => (
            <Typography
              key={idx}
              level="body-xs"
              fontFamily="monospace"
              sx={{
                py: 0.25,
                borderBottom: "1px solid",
                borderColor: "divider",
                "&:last-child": { borderBottom: "none" },
              }}
            >
              {log}
            </Typography>
          ))
        )}
        <div ref={logsEndRef} />
      </Box>

      {/* Return value */}
      {job.returnvalue && (
        <>
          <Typography level="title-sm" sx={{ mb: 1, mt: 3 }}>
            Return Value
          </Typography>
          <Box
            sx={{
              p: 2,
              borderRadius: "sm",
              overflow: "auto",
              maxHeight: 200,
              bgcolor: "var(--joy-palette-success-softBg, rgba(0,150,0,0.08))",
              border: "1px solid",
              borderColor: "var(--joy-palette-success-outlinedBorder, #81c995)",
            }}
          >
            <Typography
              level="body-xs"
              fontFamily="monospace"
              whiteSpace="pre-wrap"
            >
              {JSON.stringify(job.returnvalue, null, 2)}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

// ─── Main JobsSettings ──────────────────────────────────────────────────────

export default function JobsSettings() {
  const { t } = useTranslation("Administration");
  const { socket } = useSocket();
  const { refreshCounts } = useJobs();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDetail, setJobDetail] = useState(null);
  const [jobLogs, setJobLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch job list
  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.getJobs();
      setJobs(data.jobs);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Listen for real-time job events to refresh the list
  useEffect(() => {
    if (!socket) return;

    const refresh = () => {
      fetchJobs();
      refreshCounts();
    };

    socket.on("job.active", refresh);
    socket.on("job.completed", refresh);
    socket.on("job.failed", refresh);

    return () => {
      socket.off("job.active", refresh);
      socket.off("job.completed", refresh);
      socket.off("job.failed", refresh);
    };
  }, [socket, fetchJobs, refreshCounts]);

  // Fetch job details when a job is selected
  const handleSelectJob = useCallback(async (job) => {
    const key = `${job.queue}:${job.id}`;
    setSelectedJob(key);
    setLogsLoading(true);
    setJobLogs([]);
    try {
      const detail = await api.getJob(job.queue, job.id);
      setJobDetail(detail);
      setJobLogs(detail.logs || []);
    } catch (err) {
      console.error("Failed to fetch job detail:", err);
      setJobDetail(null);
      setJobLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Listen for live log events for the currently selected job
  useEffect(() => {
    if (!socket || !selectedJob) return;

    const handleLog = (payload) => {
      console.log(payload);
      const key = `${payload.queue}:${payload.jobId}`;
      if (key === selectedJob) {
        setJobLogs((prev) => [...prev, payload.message]);
      }
    };

    // On job.active, just update the detail status (logs are streaming live)
    const handleActive = (payload) => {
      const key = `${payload.job?.queue}:${payload.job?.id}`;
      if (key === selectedJob && payload.job) {
        setJobDetail((prev) =>
          prev
            ? { ...prev, ...payload.job, state: undefined, status: "active" }
            : prev,
        );
      }
    };

    // On terminal states (completed/failed), re-fetch to get the authoritative final state and logs
    const handleTerminal = (payload) => {
      const key = `${payload.job?.queue}:${payload.job?.id}`;
      if (key === selectedJob && payload.job) {
        setJobDetail((prev) =>
          prev ? { ...prev, ...payload.job, state: undefined } : prev,
        );
        const [queue, id] = selectedJob.split(":");
        api
          .getJob(queue, id)
          .then((detail) => {
            setJobDetail(detail);
            setJobLogs(detail.logs || []);
          })
          .catch(() => {});
      }
    };

    socket.on("job.log", handleLog);
    socket.on("job.active", handleActive);
    socket.on("job.completed", handleTerminal);
    socket.on("job.failed", handleTerminal);

    return () => {
      socket.off("job.log", handleLog);
      socket.off("job.active", handleActive);
      socket.off("job.completed", handleTerminal);
      socket.off("job.failed", handleTerminal);
    };
  }, [socket, selectedJob]);

  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Left panel - Job List */}
      <Box
        sx={{
          width: 380,
          minWidth: 320,
          height: "100%",
          borderRight: "1px solid",
          borderColor: "var(--border-color)",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          bgcolor: "var(--bg-primary)",
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: "1px solid",
            borderColor: "var(--border-color)",
          }}
        >
          <Typography
            level="body-xs"
            sx={{ color: "var(--text-tertiary)", mt: 0.5 }}
          >
            {jobs.length === 1 ? t("jobs.jobCount", { count: jobs.length }) : t("jobs.jobCount_plural", { count: jobs.length })}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto" }}>
          <JobList
            jobs={jobs}
            selectedJobKey={selectedJob}
            onSelect={handleSelectJob}
            loading={loading}
          />
        </Box>
      </Box>

      {/* Right panel - Job Details */}
      <Box sx={{ flex: 1, height: "100%", overflow: "hidden", bgcolor: "var(--bg-primary)" }}>
        <JobDetails job={jobDetail} logs={jobLogs} logsLoading={logsLoading} />
      </Box>
    </Box>
  );
}
