import React, { useState } from "react";
import { Box, Typography, Card, IconButton, Tooltip } from "@mui/joy";
import CodeIcon from "@mui/icons-material/Code";
import ArticleIcon from "@mui/icons-material/Article";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useTranslation } from "react-i18next";
import MarkdownRenderer from "../MarkdownRenderer";
import "./ToolCallDisplay.css";

// Map of tool names to the input key to show as a short summary
const TOOL_SUMMARY_KEYS = {
  browser_navigate: "url",
  read: "filePath",
  glob: "pattern",
  grep: "pattern",
  bash: "description",
  edit: "filePath",
  browser_screenshot: "url",
};

const getToolSummary = (toolName, input) => {
  if (!input) return null;
  const key = TOOL_SUMMARY_KEYS[toolName];
  if (key && input[key]) return input[key];
  return null;
};

/**
 * ToolCallDisplay renders a single tool invocation.
 *
 * Accepts either:
 *  - New format (OpenCode native): { toolPart } where toolPart is a ToolPart
 *    with { type: "tool", tool, callID, state: { status, input, output?, error? } }
 *  - Legacy format: { toolCall, toolResult } from the old MongoDB message format
 */
const ToolCallDisplay = ({ toolPart, toolCall, toolResult }) => {
  const [expanded, setExpanded] = useState(false);
  const [rawView, setRawView] = useState(false);
  const { t } = useTranslation("tools");

  // Normalise: support both new ToolPart format and legacy { toolCall, toolResult }
  let toolName, input, output, error, status;

  let metadata;

  if (toolPart) {
    // New OpenCode native format
    toolName = toolPart.tool;
    input = toolPart.state?.input;
    status = toolPart.state?.status; // "pending" | "running" | "completed" | "error"
    output = toolPart.state?.output;
    error = toolPart.state?.status === "error" ? toolPart.state?.error : null;
    metadata = toolPart.state?.metadata;
  } else if (toolCall) {
    // Legacy format
    toolName = toolCall.toolName;
    input = toolCall.input;
    output = toolResult?.output;
    error = toolResult?.output?.error;
    status = toolResult ? (error ? "error" : "completed") : "pending";
  } else {
    return null;
  }

  const summary = getToolSummary(toolName, input);

  const getStatusIcon = () => {
    if (status === "error")
      return (
        <ErrorOutlineIcon
          sx={{ fontSize: 16, color: "var(--joy-palette-danger-500, #d32f2f)" }}
        />
      );
    if (status === "completed")
      return (
        <CheckCircleOutlineIcon
          sx={{
            fontSize: 16,
            color: "var(--joy-palette-success-500, #2e7d32)",
          }}
        />
      );
    if (status === "running")
      return (
        <AutorenewIcon
          sx={{
            fontSize: 16,
            color: "var(--joy-palette-primary-500, #1976d2)",
            animation: "spin 1s linear infinite",
            "@keyframes spin": {
              "0%": { transform: "rotate(0deg)" },
              "100%": { transform: "rotate(360deg)" },
            },
          }}
        />
      );
    // pending
    return (
      <RadioButtonUncheckedIcon
        sx={{
          fontSize: 16,
          color: "var(--joy-palette-neutral-400, #9e9e9e)",
        }}
      />
    );
  };

  const hasOutput = status === "completed" && output;
  const hasError = status === "error" && error;
  const displayTitle = toolPart?.state?.title;

  // Truncated content rendering
  const truncatedContent = metadata?.truncated
    ? metadata?.truncatedContent
    : null;
  const isImageContent =
    truncatedContent && truncatedContent.trimStart().startsWith("data:image");
  // Detect markdown that contains only a single image: ![...](...)
  const SOLE_IMAGE_RE = /^\s*!\[[^\]]*\]\(([^)]+)\)\s*$/;
  const soleImageMatch =
    !isImageContent && truncatedContent && SOLE_IMAGE_RE.exec(truncatedContent);
  const soleImageSrc = soleImageMatch ? soleImageMatch[1] : null;

  return (
    <div className="tool-call-compact">
      <div
        className="tool-call-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {getStatusIcon()}
        <Typography
          level="body-xs"
          sx={{
            fontFamily: "monospace",
            color: "text.tertiary",
            userSelect: "none",
          }}
        >
          {toolName}
        </Typography>
        {(displayTitle || summary) && (
          <Typography
            level="body-xs"
            sx={{
              fontFamily: "monospace",
              color: "text.tertiary",
              opacity: 0.6,
              userSelect: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 400,
            }}
          >
            {displayTitle || summary}
          </Typography>
        )}
      </div>

      {expanded && (
        <div className="tool-call-details">
          {input && (
            <Box
              sx={{
                p: 1,
                bgcolor: "background.level1",
                borderRadius: "sm",
                fontFamily: "monospace",
                fontSize: "0.7rem",
                overflow: "auto",
                maxHeight: "180px",
              }}
            >
              <pre style={{ margin: 0 }}>{JSON.stringify(input, null, 2)}</pre>
            </Box>
          )}

          {hasOutput && (
            <Box>
              <Typography
                level="body-xs"
                fontWeight="lg"
                sx={{ mb: 0.5, color: "text.tertiary" }}
              >
                {t("output")}
              </Typography>
              <Box
                sx={{
                  p: 1,
                  bgcolor: "background.level1",
                  borderRadius: "sm",
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  overflow: "auto",
                  maxHeight: "180px",
                }}
              >
                <pre style={{ margin: 0 }}>
                  {typeof output === "string"
                    ? output
                    : JSON.stringify(output, null, 2)}
                </pre>
              </Box>
            </Box>
          )}

          {hasError && (
            <Box>
              <Typography
                level="body-xs"
                fontWeight="lg"
                sx={{ mb: 0.5, color: "danger.500" }}
              >
                {t("error")}
              </Typography>
              <Box
                sx={{
                  p: 1,
                  bgcolor: "danger.softBg",
                  borderRadius: "sm",
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  overflow: "auto",
                  maxHeight: "180px",
                }}
              >
                <pre style={{ margin: 0 }}>
                  {typeof error === "string"
                    ? error
                    : JSON.stringify(error, null, 2)}
                </pre>
              </Box>
            </Box>
          )}
        </div>
      )}

      {truncatedContent && (
        <Card
          variant="outlined"
          sx={{
            mt: 1,
            p: 0,
            borderRadius: "sm",
            overflow: "hidden",
          }}
        >
          {isImageContent || soleImageSrc ? (
            <Box sx={{ p: 1 }}>
              <img
                src={isImageContent ? truncatedContent.trim() : soleImageSrc}
                alt={t("toolOutputAlt", { toolName })}
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  display: "block",
                  borderRadius: 4,
                }}
              />
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  px: 1,
                  py: 0.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Tooltip
                  title={rawView ? t("renderAsMarkdown") : t("viewRawText")}
                  size="sm"
                >
                  <IconButton
                    size="sm"
                    variant="plain"
                    color="neutral"
                    onClick={() => setRawView((v) => !v)}
                  >
                    {rawView ? (
                      <ArticleIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <CodeIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>
              <Box
                sx={{
                  overflow: "auto",
                  maxHeight: "400px",
                  p: rawView ? 1 : 0,
                }}
              >
                {rawView ? (
                  <pre
                    style={{
                      margin: 0,
                      fontFamily: "monospace",
                      fontSize: "0.7rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {truncatedContent}
                  </pre>
                ) : (
                  <MarkdownRenderer
                    content={truncatedContent}
                    sanitize={false}
                  />
                )}
              </Box>
            </>
          )}
        </Card>
      )}
    </div>
  );
};

export default ToolCallDisplay;
