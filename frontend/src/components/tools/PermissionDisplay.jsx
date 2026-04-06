import React, { useState, useCallback } from "react";
import {
  Card,
  Typography,
  Chip,
  Box,
  Button,
  Input,
  Divider,
  Sheet,
} from "@mui/joy";
import SecurityIcon from "@mui/icons-material/Security";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import BlockIcon from "@mui/icons-material/Block";

/**
 * PermissionDisplay renders an inline permission request from the OpenCode agent.
 *
 * Props:
 * - permissionData: { requestId, permission, patterns, metadata, always, tool, status?, reply? }
 *     permission: string (e.g., "file.write", "bash.execute")
 *     patterns: Array<string> (file/command patterns the permission applies to)
 *     metadata: Record<string, unknown> (additional context)
 *     always: Array<string> (pre-defined "always allow" pattern options from OpenCode)
 *     status: "pending" | "granted" | "rejected" (for historical rendering)
 *     reply: "once" | "always" | "reject" (for historical rendering)
 * - onReply: (requestId, reply: "once"|"always"|"reject", message?: string) => void
 * - disabled: boolean (true while submitting)
 * - readOnly: boolean (true for historical permissions that were already responded to)
 */
const PermissionDisplay = ({
  permissionData,
  onReply,
  disabled = false,
  readOnly = false,
}) => {
  const {
    requestId,
    permission,
    patterns,
    metadata,
    always,
    status,
    reply: historicalReply,
  } = permissionData;

  const [submitting, setSubmitting] = useState(false);
  const [rejectMessage, setRejectMessage] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isGranted = status === "granted";
  const isRejected = status === "rejected";
  const isResolved = isGranted || isRejected;

  const handleReply = useCallback(
    async (replyType, message) => {
      setSubmitting(true);
      try {
        await onReply(requestId, replyType, message);
      } catch (err) {
        console.error("Failed to reply to permission request:", err);
        setSubmitting(false);
      }
    },
    [requestId, onReply],
  );

  const handleAllowOnce = () => handleReply("once");
  const handleAlwaysAllow = () => handleReply("always");
  const handleReject = () => {
    if (showRejectInput) {
      handleReply("reject", rejectMessage.trim() || undefined);
    } else {
      setShowRejectInput(true);
    }
  };
  const handleRejectDirect = () => handleReply("reject");

  // Format permission name for display (e.g., "file.write" -> "File Write")
  const formatPermission = (perm) => {
    if (!perm) return "Unknown Permission";
    return perm
      .split(/[._-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Determine the status chip
  const getStatusChip = () => {
    if (isGranted) {
      const label =
        historicalReply === "always" ? "Always Allowed" : "Allowed Once";
      return (
        <Chip size="sm" color="success" variant="soft">
          {label}
        </Chip>
      );
    }
    if (isRejected)
      return (
        <Chip size="sm" color="danger" variant="soft">
          Rejected
        </Chip>
      );
    return (
      <Chip size="sm" color="warning" variant="soft">
        Awaiting Approval
      </Chip>
    );
  };

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        my: 1,
        borderColor: isResolved
          ? "neutral.outlinedBorder"
          : "warning.outlinedBorder",
        borderWidth: isResolved ? 1 : 2,
        bgcolor: isResolved ? "transparent" : "background.surface",
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <SecurityIcon
          sx={{
            fontSize: 20,
            color: isResolved ? "neutral.500" : "warning.500",
          }}
        />
        <Typography level="title-sm" fontWeight="lg">
          Permission Required
        </Typography>
        {getStatusChip()}
      </Box>

      {/* Permission type */}
      <Box sx={{ mb: 1 }}>
        <Typography level="body-sm" fontWeight="lg">
          {formatPermission(permission)}
        </Typography>
      </Box>

      {/* Patterns */}
      {patterns && patterns.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            level="body-xs"
            sx={{ color: "text.tertiary", mb: 0.5 }}
          >
            Affected patterns:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {patterns.map((pattern, idx) => (
              <Chip key={idx} size="sm" variant="outlined" color="neutral">
                <Typography
                  level="body-xs"
                  sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                >
                  {pattern}
                </Typography>
              </Chip>
            ))}
          </Box>
        </Box>
      )}

      {/* Metadata context */}
      {metadata && Object.keys(metadata).length > 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 1, borderRadius: "sm", mb: 1.5 }}
        >
          <Typography
            level="body-xs"
            sx={{ color: "text.tertiary", mb: 0.5 }}
          >
            Context:
          </Typography>
          {Object.entries(metadata).map(([key, value]) => (
            <Typography key={key} level="body-xs" sx={{ fontFamily: "monospace" }}>
              {key}: {typeof value === "string" ? value : JSON.stringify(value)}
            </Typography>
          ))}
        </Sheet>
      )}

      {/* Rejected state */}
      {isRejected && (
        <Typography
          level="body-xs"
          sx={{ color: "text.tertiary", fontStyle: "italic" }}
        >
          This permission request was rejected.
        </Typography>
      )}

      {/* Granted (historical) state */}
      {isGranted && (
        <Typography
          level="body-xs"
          sx={{ color: "text.tertiary", fontStyle: "italic" }}
        >
          This permission was{" "}
          {historicalReply === "always" ? "always allowed" : "allowed once"}.
        </Typography>
      )}

      {/* Pending: action buttons */}
      {!isResolved && (
        <Box>
          {/* Reject message input (shown when user clicks Reject) */}
          {showRejectInput && (
            <Box sx={{ mb: 1.5 }}>
              <Input
                size="sm"
                placeholder="Reason for rejection (optional)..."
                value={rejectMessage}
                onChange={(e) => setRejectMessage(e.target.value)}
                disabled={disabled || submitting}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleReject();
                  }
                  if (e.key === "Escape") {
                    setShowRejectInput(false);
                    setRejectMessage("");
                  }
                }}
                sx={{ mb: 0.5 }}
              />
              <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                Press Enter to confirm rejection, Escape to cancel
              </Typography>
            </Box>
          )}

          <Divider sx={{ my: 1.5 }} />
          <Box
            sx={{ display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}
          >
            {!showRejectInput ? (
              <Button
                size="sm"
                variant="plain"
                color="danger"
                onClick={handleRejectDirect}
                disabled={disabled || submitting}
                startDecorator={<BlockIcon />}
              >
                Reject
              </Button>
            ) : (
              <Button
                size="sm"
                variant="plain"
                color="neutral"
                onClick={() => {
                  setShowRejectInput(false);
                  setRejectMessage("");
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}

            {showRejectInput && (
              <Button
                size="sm"
                variant="soft"
                color="danger"
                onClick={handleReject}
                loading={submitting}
                startDecorator={<BlockIcon />}
              >
                Confirm Reject
              </Button>
            )}

            {!showRejectInput && (
              <>
                <Button
                  size="sm"
                  variant="soft"
                  color="primary"
                  onClick={handleAllowOnce}
                  disabled={disabled || submitting}
                  loading={submitting}
                  startDecorator={<CheckIcon />}
                >
                  Allow Once
                </Button>
                <Button
                  size="sm"
                  variant="solid"
                  color="success"
                  onClick={handleAlwaysAllow}
                  disabled={disabled || submitting}
                  loading={submitting}
                  startDecorator={<CheckCircleOutlineIcon />}
                >
                  Always Allow
                </Button>
              </>
            )}
          </Box>
        </Box>
      )}
    </Card>
  );
};

export default PermissionDisplay;
