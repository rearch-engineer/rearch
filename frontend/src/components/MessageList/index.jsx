import { useTranslation } from "react-i18next";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import Sheet from "@mui/joy/Sheet";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import ChatSkeleton from "../ChatSkeleton";
import ToolCallDisplay from "../tools/ToolCallDisplay";
import QuestionDisplay from "../tools/QuestionDisplay";
import PermissionDisplay from "../tools/PermissionDisplay";
import MentionRenderer from "../MentionRenderer";
import MarkdownRenderer from "../MarkdownRenderer";
import { api } from "../../api/client";
import useAuthSrc, { openAuthFile } from "../../hooks/useAuthSrc";
import "./MessageList.css";

const isImageType = (contentType) =>
  contentType && contentType.startsWith("image/");

const formatFileSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Image that loads via fetch + JWT Authorization header → blob URL.
 * Clicking opens the authenticated file in a new tab.
 */
const AuthImage = ({ fileUrl, filename }) => {
  const { t } = useTranslation("MessageList");
  const blobSrc = useAuthSrc(fileUrl);

  return (
    <Sheet
      variant="outlined"
      sx={{
        borderRadius: "sm",
        overflow: "hidden",
        maxWidth: 300,
        cursor: "pointer",
        "&:hover": { opacity: 0.9 },
      }}
      onClick={() => openAuthFile(fileUrl, filename)}
    >
      {blobSrc ? (
        <Box
          component="img"
          src={blobSrc}
          alt={filename}
          sx={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 240,
            objectFit: "contain",
          }}
        />
      ) : (
        <Box
          sx={{
            width: "100%",
            height: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            {t("loading")}
          </Typography>
        </Box>
      )}
      <Box sx={{ px: 1, py: 0.5 }}>
        <Typography level="body-xs" noWrap>
          {filename}
        </Typography>
      </Box>
    </Sheet>
  );
};

const FileAttachments = ({ files }) => {
  if (!files || files.length === 0) return null;

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        mt: 1,
      }}
    >
      {files.map((file, idx) => {
        const fileUrl = api.getFileUrl(file.fileId);

        if (isImageType(file.contentType)) {
          return (
            <AuthImage key={idx} fileUrl={fileUrl} filename={file.filename} />
          );
        }

        // Non-image file
        return (
          <Sheet
            key={idx}
            variant="outlined"
            sx={{
              borderRadius: "sm",
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 1,
              cursor: "pointer",
              maxWidth: 240,
              "&:hover": { backgroundColor: "neutral.softHoverBg" },
            }}
            onClick={() => openAuthFile(fileUrl, file.filename)}
          >
            <InsertDriveFileOutlined
              sx={{ fontSize: 20, color: "neutral.500", flexShrink: 0 }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography level="body-xs" noWrap fontWeight="md">
                {file.filename}
              </Typography>
              {file.size && (
                <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                  {formatFileSize(file.size)}
                </Typography>
              )}
            </Box>
          </Sheet>
        );
      })}
    </Box>
  );
};

/**
 * Detect whether a message is in OpenCode native format ({ info, parts })
 * vs the legacy/streaming format ({ role, content, ... }).
 */
const isNativeMessage = (message) =>
  message.info != null && Array.isArray(message.parts);

/**
 * Get the role from either native or legacy message format.
 */
const getRole = (message) =>
  isNativeMessage(message) ? message.info.role : message.role;

/**
 * Get a unique key for a message.
 */
const getMessageKey = (message, index) => {
  if (isNativeMessage(message)) return message.info.id;
  return message._id || `streaming-${index}`;
};

/**
 * Check if a message contains only tool parts (no text content).
 */
const isToolCallOnlyMessage = (message) => {
  if (!isNativeMessage(message)) {
    // Legacy/streaming format
    if (message.role !== "assistant") return false;
    if (!Array.isArray(message.content)) return false;
    return message.content.every(
      (item) => item.type === "tool-call" || item.type === "tool-result",
    );
  }

  // Native format
  if (message.info.role !== "assistant") return false;
  if (!message.parts || message.parts.length === 0) return false;
  // Only tool parts (plus step-start/step-finish/snapshot/patch/agent which are metadata)
  const contentParts = message.parts.filter(
    (p) =>
      p.type === "text" ||
      p.type === "tool" ||
      p.type === "file" ||
      p.type === "reasoning",
  );
  return (
    contentParts.length > 0 && contentParts.every((p) => p.type === "tool")
  );
};

const MessageList = ({
  messages,
  isLoadingMessages,
  onEditMessage,
  pendingQuestion,
  onQuestionSubmit,
  onQuestionReject,
  pendingPermission,
  onPermissionReply,
  containerRef,
  messagesEndRef,
  onScroll,
}) => {
  const { t } = useTranslation("MessageList");

  /**
   * Render parts for a native OpenCode message.
   */
  const renderNativeParts = (message) => {
    const role = message.info.role;
    const parts = message.parts || [];

    return parts.map((part, idx) => {
      switch (part.type) {
        case "text":
          if (!part.text) return null;
          if (role === "assistant") {
            return (
              <MarkdownRenderer key={part.id || idx} content={part.text} />
            );
          }
          if (role === "user") {
            return (
              <MentionRenderer key={part.id || idx} content={part.text} />
            );
          }
          return <div key={part.id || idx}>{part.text}</div>;

        case "tool":
          return <ToolCallDisplay key={part.id || idx} toolPart={part} />;

        case "file":
          // If it's an image with a data URI, render it inline
          if (isImageType(part.mime) && part.url) {
            return (
              <Sheet
                key={part.id || idx}
                variant="outlined"
                sx={{
                  borderRadius: "sm",
                  overflow: "hidden",
                  maxWidth: 300,
                  cursor: "pointer",
                  my: 0.5,
                  "&:hover": { opacity: 0.9 },
                }}
                onClick={() => window.open(part.url, "_blank")}
              >
                <Box
                  component="img"
                  src={part.url}
                  alt={part.filename || t("imageFallback")}
                  sx={{ display: "block", width: "100%", height: "auto" }}
                />
              </Sheet>
            );
          }
          // Render non-image file part as an attachment chip
          return (
            <Sheet
              key={part.id || idx}
              variant="outlined"
              sx={{
                borderRadius: "sm",
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 1,
                cursor: part.url ? "pointer" : "default",
                maxWidth: 240,
                my: 0.5,
                "&:hover": part.url
                  ? { backgroundColor: "neutral.softHoverBg" }
                  : {},
              }}
              onClick={() => part.url && window.open(part.url, "_blank")}
            >
              <InsertDriveFileOutlined
                sx={{ fontSize: 20, color: "neutral.500", flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography level="body-xs" noWrap fontWeight="md">
                  {part.filename || t("fileFallback")}
                </Typography>
                <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                  {part.mime}
                </Typography>
              </Box>
            </Sheet>
          );

        case "reasoning":
          if (!part.text) return null;
          return (
            <Box
              key={part.id || idx}
              sx={{
                pl: 1.5,
                borderLeft: "2px solid",
                borderColor: "neutral.outlinedBorder",
                my: 0.5,
                opacity: 0.7,
              }}
            >
              <Typography
                level="body-xs"
                sx={{
                  color: "text.tertiary",
                  fontStyle: "italic",
                  mb: 0.5,
                }}
              >
                {t("reasoning")}
              </Typography>
              <Typography
                level="body-sm"
                sx={{ color: "text.secondary", whiteSpace: "pre-wrap" }}
              >
                {part.text}
              </Typography>
            </Box>
          );

        // Metadata parts — skip rendering
        case "step-start":
        case "step-finish":
        case "snapshot":
        case "patch":
        case "agent":
        case "retry":
        case "compaction":
        case "subtask":
          return null;

        default:
          return null;
      }
    });
  };

  /**
   * Render content for a legacy/streaming message (old { role, content } format).
   * Streaming messages from ChatInterface still use this shape.
   */
  const renderLegacyContent = (message) => {
    // Handle string content (regular messages)
    if (typeof message.content === "string") {
      if (message.role === "assistant") {
        return <MarkdownRenderer content={message.content} />;
      } else if (message.role === "user") {
        return <MentionRenderer content={message.content} />;
      }
      return <div>{message.content}</div>;
    }

    // Handle array content (legacy tool calls, results, and questions)
    if (Array.isArray(message.content)) {
      return message.content.map((contentItem, idx) => {
        // Handle historical question messages (saved in DB)
        if (contentItem.type === "question") {
          if (
            pendingQuestion &&
            pendingQuestion.requestId === contentItem.requestId &&
            contentItem.status === "pending"
          ) {
            return null;
          }

          return (
            <QuestionDisplay
              key={idx}
              questionData={{
                requestId: contentItem.requestId,
                questions: contentItem.questions,
                status: contentItem.status,
                answers: contentItem.answers,
                tool: contentItem.tool,
              }}
              onSubmit={onQuestionSubmit}
              onReject={onQuestionReject}
              readOnly={contentItem.status !== "pending"}
            />
          );
        }

        if (contentItem.type === "tool-call") {
          return (
            <ToolCallDisplay
              key={idx}
              toolCall={contentItem}
              toolResult={null}
            />
          );
        }

        // Don't render tool-result separately
        if (contentItem.type === "tool-result") {
          return null;
        }

        return null;
      });
    }

    return null;
  };

  /**
   * Render message content, dispatching between native and legacy formats.
   */
  const renderMessageContent = (message) => {
    if (isNativeMessage(message)) {
      return renderNativeParts(message);
    }
    return renderLegacyContent(message);
  };

  return (
    <div className="message-list" ref={containerRef} onScroll={onScroll}>
      {/* Spacer pushes messages to the bottom when content is short.
          Must be a separate element (not justify-content: flex-end) so
          Chrome allows scrolling when content overflows the top. */}
      <div style={{ flex: 1 }} />
      {isLoadingMessages && messages.length === 0 && (
        <ChatSkeleton />
      )}
      {messages.map((message, index) => {
        const role = getRole(message);
        const key = getMessageKey(message, index);

        // Tool-call-only messages get a compact layout (no avatar, no border)
        if (isToolCallOnlyMessage(message)) {
          return (
            <div key={key} className="tool-call-row">
              {renderMessageContent(message)}
            </div>
          );
        }

        return (
          <div key={key} className={`message ${role}`}>
            <div className="message-content-wrapper">
              <>
                <div
                  className="message-content"
                  style={{
                    cursor: "default",
                  }}
                >
                  {renderMessageContent(message)}
                </div>
                {/* File attachments (legacy optimistic user messages) */}
                {message.files && message.files.length > 0 && (
                  <FileAttachments files={message.files} />
                )}

              </>
            </div>
          </div>
        );
      })}

      {/* Live pending question — rendered at the end of the message list */}
      {pendingQuestion && pendingQuestion.status === "pending" && (
        <div className="message assistant">
          <div className="message-content-wrapper">
            <div className="message-content" style={{ cursor: "default" }}>
              <QuestionDisplay
                questionData={pendingQuestion}
                onSubmit={onQuestionSubmit}
                onReject={onQuestionReject}
                readOnly={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Live pending permission — rendered at the end of the message list */}
      {pendingPermission && pendingPermission.status === "pending" && (
        <div className="message assistant">
          <div className="message-content-wrapper">
            <div className="message-content" style={{ cursor: "default" }}>
              <PermissionDisplay
                permissionData={pendingPermission}
                onReply={onPermissionReply}
                readOnly={false}
              />
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
