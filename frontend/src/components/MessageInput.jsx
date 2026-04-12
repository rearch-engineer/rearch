import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { MentionsInput, Mention } from "react-mentions";
import { useResources } from "../contexts/ResourcesContext";
import { useAuth } from "../contexts/AuthContext";
import Box from "@mui/joy/Box";
import IconButton from "@mui/joy/IconButton";
import Select from "@mui/joy/Select";
import Option from "@mui/joy/Option";
import Button from "@mui/joy/Button";
import ButtonGroup from "@mui/joy/ButtonGroup";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import Sheet from "@mui/joy/Sheet";
import Typography from "@mui/joy/Typography";
import CircularProgress from "@mui/joy/CircularProgress";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import CloseRounded from "@mui/icons-material/CloseRounded";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import MicOutlined from "@mui/icons-material/MicOutlined";
import { api } from "../api/client";
import "./MessageInput.css";

const MessageInput = forwardRef(
  (
    {
      onSendMessage,
      disabled,
      providers,
      agents,
      selectedModel,
      onModelChange,
      selectedAgent,
      onAgentChange,
    },
    ref,
  ) => {
    const [input, setInput] = useState("");
    const [attachedFiles, setAttachedFiles] = useState([]); // { file, preview, uploading, uploaded, fileId, filename, contentType, size }
    const [isListening, setIsListening] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);
    const recognitionRef = useRef(null);
    const speechBaseTextRef = useRef("");
    const mentionsRef = useRef(null);
    const fileInputRef = useRef(null);
    const inputRef = useRef(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      },
    }));
    const { resources } = useResources();
    const { user } = useAuth();

    // Rotating placeholder prompts with typewriter effect
    const placeholderHints = useMemo(
      () => [
        "add dark mode support",
        "write tests for all components",
        "why is this API so slow?",
        "convert the project to TypeScript",
        "find unused dependencies",
        "add proper error handling",
        "make this responsive",
        "optimize a database query",
        "add input validation",
        "explain a regular expression",
        "split a monolith file into smaller functions",
        "add loading states to the screens",
        "update outdated dependencies",
        "generate a README for this project",
      ],
      [],
    );

    const prefix = "Ask ReArch to ";
    const [placeholder, setPlaceholder] = useState(prefix);

    useEffect(() => {
      let idx = Math.floor(Math.random() * placeholderHints.length);
      let charPos = 0;
      let phase = "typing"; // 'typing' | 'pausing' | 'deleting'
      let timer;

      const tick = () => {
        const currentHint = placeholderHints[idx];

        if (phase === "typing") {
          charPos++;
          setPlaceholder(prefix + currentHint.slice(0, charPos));
          if (charPos >= currentHint.length) {
            phase = "pausing";
            timer = setTimeout(tick, 2000);
          } else {
            timer = setTimeout(tick, 50 + Math.random() * 40);
          }
        } else if (phase === "pausing") {
          phase = "deleting";
          timer = setTimeout(tick, 30);
        } else if (phase === "deleting") {
          charPos--;
          setPlaceholder(prefix + currentHint.slice(0, charPos));
          if (charPos <= 0) {
            phase = "typing";
            idx = (idx + 1) % placeholderHints.length;
            timer = setTimeout(tick, 400);
          } else {
            timer = setTimeout(tick, 25 + Math.random() * 15);
          }
        }
      };

      timer = setTimeout(tick, 600);
      return () => clearTimeout(timer);
    }, [placeholderHints]);

    // Check for browser speech recognition support
    const SpeechRecognition =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    // Clean up recognition on unmount
    useEffect(() => {
      return () => {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
          recognitionRef.current = null;
        }
      };
    }, []);

    const toggleListening = useCallback(() => {
      if (!SpeechRecognition) return;

      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        user?.profile?.preferences?.voice_language ||
        navigator.language ||
        "en-US";

      recognition.onstart = () => {
        // Capture the current input text as the base for this speech session
        setInput((prev) => {
          speechBaseTextRef.current = prev;
          return prev;
        });
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // When a segment is finalized, append it to the base text
        if (finalTranscript) {
          const base = speechBaseTextRef.current;
          const separator = base && !base.endsWith(" ") ? " " : "";
          speechBaseTextRef.current = base + separator + finalTranscript;
        }

        // Always update the input with base text + any interim (partial) words
        const base = speechBaseTextRef.current;
        if (interimTranscript) {
          const separator = base && !base.endsWith(" ") ? " " : "";
          setInput(base + separator + interimTranscript);
        } else {
          setInput(base);
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        // Ensure input reflects the final base text (no leftover interim)
        setInput(speechBaseTextRef.current);
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    }, [SpeechRecognition, isListening, user]);

    // Build flat list of models grouped by provider for the dropdown
    const modelOptions = useMemo(() => {
      if (!providers?.all) return [];

      const connectedProviders = providers.connected || [];
      const options = [];

      for (const provider of providers.all) {
        if (
          connectedProviders.length > 0 &&
          !connectedProviders.includes(provider.id)
        ) {
          continue;
        }

        const models = provider.models || {};
        for (const [modelId, model] of Object.entries(models)) {
          if (model.tool_call === false && model.toolcall === false) continue;

          options.push({
            providerID: provider.id,
            providerName: provider.name,
            modelID: modelId,
            modelName: model.name || modelId,
            family: model.family,
          });
        }
      }

      return options;
    }, [providers]);

    const modelSelectValue = selectedModel
      ? `${selectedModel.providerID}::${selectedModel.modelID}`
      : "";

    const handleModelSelect = (e, value) => {
      if (!value) {
        onModelChange(null);
        return;
      }
      const [providerID, modelID] = value.split("::");
      onModelChange({ providerID, modelID });
    };

    const isImage = (contentType) =>
      contentType && contentType.startsWith("image/");

    const processFiles = useCallback(async (fileList) => {
      const selectedFiles = Array.from(fileList);
      if (selectedFiles.length === 0) return;

      // Create preview entries for each file
      const newEntries = selectedFiles.map((file) => {
        const preview = isImage(file.type) ? URL.createObjectURL(file) : null;
        return {
          file,
          preview,
          uploading: true,
          uploaded: false,
          fileId: null,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        };
      });

      setAttachedFiles((prev) => [...prev, ...newEntries]);

      // Upload files to backend
      try {
        const uploadResults = await api.uploadFiles(selectedFiles);

        setAttachedFiles((prev) => {
          const updated = [...prev];
          // Match uploaded results to the entries we just added
          for (let i = 0; i < uploadResults.length; i++) {
            const result = uploadResults[i];
            // Find the matching entry by filename (from the end, to handle duplicates)
            for (let j = updated.length - 1; j >= 0; j--) {
              if (
                updated[j].filename === result.filename &&
                updated[j].uploading &&
                !updated[j].uploaded
              ) {
                updated[j] = {
                  ...updated[j],
                  uploading: false,
                  uploaded: true,
                  fileId: result.fileId,
                };
                break;
              }
            }
          }
          return updated;
        });
      } catch (err) {
        console.error("Error uploading files:", err);
        // Remove failed uploads
        setAttachedFiles((prev) =>
          prev.filter((f) => !(f.uploading && !f.uploaded)),
        );
      }
    }, []);

    const handleFileSelect = useCallback(
      async (e) => {
        await processFiles(e.target.files);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
      [processFiles],
    );

    const handleRemoveFile = useCallback((index) => {
      setAttachedFiles((prev) => {
        const removed = prev[index];
        if (removed?.preview) {
          URL.revokeObjectURL(removed.preview);
        }
        return prev.filter((_, i) => i !== index);
      });
    }, []);

    const handleDragEnter = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    }, []);

    const handleDragLeave = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current === 0) {
        setIsDragOver(false);
      }
    }, []);

    const handleDragOver = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    }, []);

    const handleDrop = useCallback(
      async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDragOver(false);
        if (disabled) return;
        const { files } = e.dataTransfer;
        if (files && files.length > 0) {
          await processFiles(files);
        }
      },
      [disabled, processFiles],
    );

    const handleSubmit = (e) => {
      e.preventDefault();
      const hasContent = input.trim();
      const hasFiles = attachedFiles.some((f) => f.uploaded);
      const allUploaded = attachedFiles.every(
        (f) => f.uploaded || !f.uploading,
      );

      if ((hasContent || hasFiles) && !disabled && allUploaded) {
        const fileRefs = attachedFiles
          .filter((f) => f.uploaded && f.fileId)
          .map((f) => ({
            fileId: f.fileId,
            filename: f.filename,
            contentType: f.contentType,
            size: f.size,
          }));

        onSendMessage(input, fileRefs);
        setInput("");
        // Clean up previews
        attachedFiles.forEach((f) => {
          if (f.preview) URL.revokeObjectURL(f.preview);
        });
        setAttachedFiles([]);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    // Transform resources to react-mentions format
    const resourceSuggestions = resources.map((resource) => ({
      id: resource._id,
      display: resource.name,
    }));

    const hasContent = input.trim();
    const hasUploadedFiles = attachedFiles.some((f) => f.uploaded);
    const isUploading = attachedFiles.some((f) => f.uploading);
    const canSend =
      (hasContent || hasUploadedFiles) && !disabled && !isUploading;

    return (
      <Box
        sx={{ px: 2.5, pb: 2.5, pt: 1.5, backgroundColor: "var(--bg-primary)" }}
      >
        <Sheet
          variant="outlined"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          sx={{
            borderRadius: "lg",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "var(--bg-input)",
            borderColor: isDragOver ? "primary.400" : "var(--border-color)",
            outline: isDragOver ? "2px dashed" : "none",
            outlineColor: isDragOver ? "primary.400" : "transparent",
            transition: "border-color 0.15s ease, outline 0.15s ease",
            position: "relative",
          }}
        >
          {/* Text input area */}
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <div ref={mentionsRef} className="mentions-container">
              <MentionsInput
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="message-input-mentions"
                disabled={disabled}
                style={mentionsInputStyle}
                suggestionsPortalHost={document.body}
                inputRef={inputRef}
              >
                <Mention
                  trigger="@"
                  data={resourceSuggestions}
                  style={mentionStyle}
                  displayTransform={(id, display) => `@${display}`}
                />
              </MentionsInput>
            </div>
          </Box>

          {/* File thumbnails area */}
          {attachedFiles.length > 0 && (
            <Box
              sx={{
                px: 2,
                py: 1,
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              {attachedFiles.map((fileEntry, index) => (
                <Box
                  key={index}
                  sx={{
                    position: "relative",
                    borderRadius: "sm",
                    overflow: "hidden",
                    border: "1px solid",
                    borderColor: "neutral.outlinedBorder",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    pr: 1,
                    maxWidth: 200,
                    backgroundColor: "background.surface",
                  }}
                >
                  {/* Thumbnail or file icon */}
                  {fileEntry.preview ? (
                    <Box
                      component="img"
                      src={fileEntry.preview}
                      alt={fileEntry.filename}
                      sx={{
                        width: 48,
                        height: 48,
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "neutral.softBg",
                        flexShrink: 0,
                      }}
                    >
                      <InsertDriveFileOutlined
                        sx={{ fontSize: 24, color: "neutral.500" }}
                      />
                    </Box>
                  )}

                  {/* Filename */}
                  <Typography
                    level="body-xs"
                    noWrap
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {fileEntry.filename}
                  </Typography>

                  {/* Loading or remove button */}
                  {fileEntry.uploading ? (
                    <CircularProgress
                      size="sm"
                      sx={{ "--CircularProgress-size": "18px" }}
                    />
                  ) : (
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="neutral"
                      onClick={() => handleRemoveFile(index)}
                      sx={{
                        "--IconButton-size": "22px",
                        minWidth: 22,
                        minHeight: 22,
                      }}
                    >
                      <CloseRounded sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {/* Drag-and-drop overlay */}
          {isDragOver && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  "rgba(var(--joy-palette-primary-mainChannel) / 0.08)",
                zIndex: 10,
                pointerEvents: "none",
                borderRadius: "lg",
              }}
            >
              <Typography
                level="body-sm"
                sx={{ color: "primary.500", fontWeight: "md" }}
              >
                Drop files to attach
              </Typography>
            </Box>
          )}

          {/* Bottom toolbar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1,
              pb: 1,
              pt: 0.5,
              gap: 0.5,
            }}
          >
            {/* Left side: selectors */}
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: 1 }}
            >
              {/* Agent toggle */}
              {agents && agents.length > 0 && (
                <ButtonGroup
                  size="sm"
                  variant="plain"
                  sx={{ "--ButtonGroup-separatorSize": "0px" }}
                >
                  {agents.map((agent) => (
                    <Button
                      key={agent.name}
                      variant={selectedAgent === agent.name ? "soft" : "plain"}
                      color={
                        selectedAgent === agent.name ? "primary" : "neutral"
                      }
                      onClick={() => onAgentChange(agent.name)}
                      disabled={disabled}
                      sx={{
                        fontSize: "12px",
                        px: 1.5,
                        py: 0.25,
                        minHeight: "28px",
                        textTransform: "capitalize",
                      }}
                    >
                      {agent.name}
                    </Button>
                  ))}
                </ButtonGroup>
              )}

              {/* Model selector */}
              <Select
                size="sm"
                variant="plain"
                placeholder="Model"
                value={modelSelectValue || null}
                onChange={handleModelSelect}
                disabled={disabled || modelOptions.length === 0}
                sx={{
                  minWidth: 140,
                  maxWidth: 240,
                  fontSize: "12px",
                  "--Select-minHeight": "28px",
                }}
                slotProps={{
                  listbox: {
                    sx: { maxHeight: 300, fontSize: "12px" },
                  },
                }}
              >
                {modelOptions.map((opt) => (
                  <Option
                    key={`${opt.providerID}::${opt.modelID}`}
                    value={`${opt.providerID}::${opt.modelID}`}
                    label={opt.modelName}
                  >
                    <ListItemDecorator
                      sx={{
                        fontSize: "10px",
                        color: "text.tertiary",
                        minWidth: 0,
                        mr: 1,
                      }}
                    >
                      {opt.providerName}
                    </ListItemDecorator>
                    {opt.modelName}
                  </Option>
                ))}
              </Select>
            </Box>

            {/* Right side: file upload + send */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.java,.go,.rs,.html,.css"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />

              {/* File attach button */}
              <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  "--IconButton-size": "32px",
                }}
              >
                <ImageOutlined sx={{ fontSize: 20 }} />
              </IconButton>

              {/* Voice input button */}
              {SpeechRecognition && (
                <IconButton
                  size="sm"
                  variant={isListening ? "soft" : "plain"}
                  color={isListening ? "primary" : "neutral"}
                  disabled={disabled}
                  onClick={toggleListening}
                  sx={{
                    "--IconButton-size": "32px",
                    transition: "all 0.2s ease",
                    ...(isListening && {
                      animation: "mic-pulse 1.5s ease-in-out infinite",
                      boxShadow: "0 0 8px 2px rgba(25, 118, 210, 0.5)",
                    }),
                  }}
                  title={isListening ? "Stop listening" : "Voice input"}
                >
                  <MicOutlined sx={{ fontSize: 20 }} />
                </IconButton>
              )}

              {/* Send button */}
              <IconButton
                size="sm"
                variant={canSend ? "solid" : "soft"}
                color={canSend ? "neutral" : "neutral"}
                disabled={!canSend}
                onClick={handleSubmit}
                sx={{
                  "--IconButton-size": "32px",
                  borderRadius: "50%",
                  ...(canSend && {
                    backgroundColor: "common.white",
                    color: "neutral.800",
                    "&:hover": {
                      backgroundColor: "neutral.300",
                    },
                  }),
                }}
              >
                {isUploading ? (
                  <CircularProgress
                    size="sm"
                    sx={{ "--CircularProgress-size": "18px" }}
                  />
                ) : (
                  <ArrowUpward sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Box>
          </Box>
        </Sheet>
      </Box>
    );
  },
);

// Inline styles for react-mentions
const mentionsInputStyle = {
  control: {
    fontSize: 16,
    fontWeight: "normal",
  },
  "&multiLine": {
    control: {
      fontFamily: "inherit",
      minHeight: 24,
    },
    highlighter: {
      padding: 0,
      border: "none",
    },
    input: {
      padding: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      color: "var(--text-primary)",
      fontFamily: "inherit",
      fontSize: 16,
      lineHeight: 1.5,
    },
  },
  suggestions: {
    list: {
      backgroundColor: "var(--bg-input)",
      border: "1px solid var(--border-color)",
      borderRadius: 8,
      boxShadow: "0 8px 24px var(--shadow-color-heavy)",
      padding: 8,
      fontSize: 14,
      maxHeight: 250,
      overflow: "auto",
      position: "fixed",
      bottom: "auto",
      top: "auto",
      transform: "translateY(-100%)",
      marginTop: "-8px",
    },
    item: {
      padding: "10px 14px",
      borderRadius: 6,
      cursor: "pointer",
      margin: "2px 0",
      "&focused": {
        backgroundColor: "var(--accent-color)",
        color: "white",
      },
    },
  },
};

const mentionStyle = {
  backgroundColor: "var(--accent-color)",
  color: "white",
  borderRadius: 4,
};

export default MessageInput;
