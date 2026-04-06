import React, { useState, useEffect, useCallback, useRef } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import { useColorScheme } from "@mui/joy/styles";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useConversations } from "../contexts/ConversationsContext";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import ModalClose from "@mui/joy/ModalClose";
import Typography from "@mui/joy/Typography";
import Button from "@mui/joy/Button";
import Input from "@mui/joy/Input";
import Textarea from "@mui/joy/Textarea";
import Alert from "@mui/joy/Alert";
import CircularProgress from "@mui/joy/CircularProgress";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import Autocomplete from "@mui/joy/Autocomplete";
import AutocompleteOption from "@mui/joy/AutocompleteOption";
import Avatar from "@mui/joy/Avatar";
import Link from "@mui/joy/Link";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlined from "@mui/icons-material/ErrorOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";

// Steps in the flow
const STEP = {
  LOADING: "loading",
  REVIEW: "review",
  PUSHING: "pushing",
  CREATING_PR: "creating_pr",
  SUCCESS: "success",
  ERROR: "error",
};

/**
 * Slugify a string for use in git branch names.
 * Lowercases, replaces non-alphanumeric runs with hyphens, trims hyphens, truncates.
 */
function slugify(text, maxLen = 60) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, maxLen);
}

/**
 * Generate a default branch name from conversation title, user name, and current date/time.
 */
function generateBranchName(conversationTitle, userName) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const convSlug = slugify(conversationTitle || "changes");
  const userSlug = slugify(userName || "user");
  return `rearch/${convSlug}-${userSlug}-${dateStr}`;
}

// Update the diff editor models imperatively to avoid the disposal race condition.
// We create brand-new models and set them on the existing editor instance,
// then dispose the old models — all synchronously before Monaco can complain.
function updateDiffEditorModels(
  diffEditorRef,
  monacoRef,
  original,
  modified,
  language,
) {
  const diffEditor = diffEditorRef.current;
  const monaco = monacoRef.current;
  if (!diffEditor || !monaco) return;

  // Guard: if the editor has already been disposed (e.g. during unmount), bail out.
  try {
    diffEditor.getModel();
  } catch (_) {
    return;
  }

  const oldModel = diffEditor.getModel();

  const newOriginalModel = monaco.editor.createModel(
    original ?? "",
    language ?? "plaintext",
  );
  const newModifiedModel = monaco.editor.createModel(
    modified ?? "",
    language ?? "plaintext",
  );

  diffEditor.setModel({
    original: newOriginalModel,
    modified: newModifiedModel,
  });

  // Dispose old models after the new ones are set
  if (oldModel) {
    try {
      oldModel.original?.dispose();
    } catch (_) {}
    try {
      oldModel.modified?.dispose();
    } catch (_) {}
  }
}

const CommitPushModal = ({ open, onClose, conversationId }) => {
  const { mode, systemMode } = useColorScheme();
  const { user } = useAuth();
  const { conversations } = useConversations();
  const monacoTheme =
    (mode === "system" ? systemMode : mode) === "dark" ? "vs-dark" : "vs";

  const [editorReady, setEditorReady] = useState(false);
  const [step, setStep] = useState(STEP.LOADING);
  const [hasChanges, setHasChanges] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileDiff, setFileDiff] = useState(null);
  const [loadingFileDiff, setLoadingFileDiff] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [error, setError] = useState(null);
  const [prUrl, setPrUrl] = useState(null);
  const [prTitle, setPrTitle] = useState(null);

  // Simple / advanced mode toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reviewer state
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedReviewer, setSelectedReviewer] = useState(null);
  // Stable refs to the Monaco diff editor instance and monaco itself
  const diffEditorRef = useRef(null);
  const monacoRef = useRef(null);
  // Track whether there's a pending model update waiting for the editor to mount
  const pendingDiffRef = useRef(null);

  // When the diff editor mounts, store refs, apply any pending update, and reveal
  const handleEditorDidMount = useCallback((editor, monaco) => {
    diffEditorRef.current = editor;
    monacoRef.current = monaco;
    if (pendingDiffRef.current) {
      const { original, modified, language } = pendingDiffRef.current;
      pendingDiffRef.current = null;
      updateDiffEditorModels(
        diffEditorRef,
        monacoRef,
        original,
        modified,
        language,
      );
    }
    setEditorReady(true);
  }, []);

  // Whenever fileDiff changes, update the editor models imperatively
  useEffect(() => {
    if (!fileDiff || fileDiff.error || fileDiff.isBinary) return;
    const { original, modified, language } = fileDiff;
    if (diffEditorRef.current && monacoRef.current) {
      updateDiffEditorModels(
        diffEditorRef,
        monacoRef,
        original,
        modified,
        language,
      );
    } else {
      // Editor not mounted yet — store for when it mounts
      pendingDiffRef.current = { original, modified, language };
    }
  }, [fileDiff]);

  const loadFileDiff = useCallback(
    async (filename) => {
      if (!filename || !conversationId) return;
      setLoadingFileDiff(true);
      setFileDiff(null);
      try {
        const data = await api.getGitFileDiff(conversationId, filename);
        setFileDiff(data);
      } catch (err) {
        console.error("Error loading file diff:", err);
        setFileDiff({ error: err.response?.data?.error || err.message });
      } finally {
        setLoadingFileDiff(false);
      }
    },
    [conversationId],
  );

  const handleSelectFile = useCallback(
    (filename) => {
      setSelectedFile(filename);
      loadFileDiff(filename);
    },
    [loadFileDiff],
  );

  // Load data when modal opens
  const loadData = useCallback(async () => {
    if (!conversationId || !open) return;

    setStep(STEP.LOADING);
    setError(null);
    setHasChanges(false);
    setFiles([]);
    setSelectedFile(null);
    setFileDiff(null);
    pendingDiffRef.current = null;
    setCommitMessage("");
    setPrUrl(null);
    setPrTitle(null);
    setShowAdvanced(false);
    setSelectedReviewer(null);

    // Generate default branch name
    const convTitle =
      conversations.find((c) => c._id === conversationId)?.title || "";
    const userName =
      user?.profile?.display_name || user?.username || user?.email || "";
    setBranchName(generateBranchName(convTitle, userName));

    // Fetch workspace members in background (for reviewer dropdown)
    setLoadingMembers(true);
    api
      .getBitbucketMembers(conversationId)
      .then((data) => setMembers(data.members || []))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMembers(false));

    try {
      const [diffData, filesData] = await Promise.all([
        api.getGitDiff(conversationId),
        api.getGitFiles(conversationId),
      ]);

      const fileList = filesData.files || [];
      setHasChanges(diffData.hasChanges);
      setFiles(fileList);
      setStep(STEP.REVIEW);

      // Auto-select the first file and load its diff
      if (fileList.length > 0) {
        setSelectedFile(fileList[0].filename);
        loadFileDiff(fileList[0].filename);
      }

      // Auto-generate commit message in the background
      if (diffData.hasChanges && diffData.diff) {
        setIsGeneratingMessage(true);
        try {
          // const msgData = await api.generateCommitMessage(conversationId, diffData.diff);
          setCommitMessage("chore: update files");
        } catch (err) {
          console.error("Failed to generate commit message:", err);
          setCommitMessage("chore: update files");
        } finally {
          setIsGeneratingMessage(false);
        }
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err.response?.data?.error || err.message);
      setStep(STEP.ERROR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, open, conversations, user]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  // When the modal closes, dispose models we own and clear refs.
  // Because we pass keepCurrentOriginalModel / keepCurrentModifiedModel to the
  // DiffEditor, it will NOT dispose models itself on unmount — so we handle it
  // here in a single, deterministic place to avoid the race condition.
  useEffect(() => {
    if (!open) {
      pendingDiffRef.current = null;
      if (diffEditorRef.current) {
        try {
          const model = diffEditorRef.current.getModel();
          if (model) {
            try {
              model.original?.dispose();
            } catch (_) {}
            try {
              model.modified?.dispose();
            } catch (_) {}
          }
        } catch (_) {
          // Editor may already be disposed by React unmount — that's fine
        }
      }
      diffEditorRef.current = null;
      monacoRef.current = null;
      setEditorReady(false);
    }
  }, [open]);

  const handleCommitPush = async () => {
    if (!branchName.trim() || !commitMessage.trim()) return;

    setStep(STEP.PUSHING);
    setError(null);

    try {
      await api.commitAndPush(conversationId, {
        branchName: branchName.trim(),
        commitMessage: commitMessage.trim(),
      });

      setStep(STEP.CREATING_PR);
      try {
        const pr = await api.createPullRequest(conversationId, {
          title: commitMessage.trim().split("\n")[0],
          description: `## Changes\n\nCommitted from ReArch conversation.\n\n### Commit message\n${commitMessage.trim()}`,
          sourceBranch: branchName.trim(),
          reviewers: selectedReviewer ? [selectedReviewer.uuid] : [],
        });
        setPrUrl(pr.url);
        setPrTitle(pr.title);
      } catch (prErr) {
        console.error("PR creation failed:", prErr);
        setPrUrl(null);
        setPrTitle(null);
      }

      setStep(STEP.SUCCESS);
    } catch (err) {
      console.error("Error in commit/push:", err);
      setError(err.response?.data?.error || err.message);
      const details = err.response?.data?.details;
      if (details) {
        setError((prev) => `${prev}\n\nDetails: ${details}`);
      }
      setStep(STEP.ERROR);
    }
  };

  const handleClose = () => {
    if (step === STEP.PUSHING || step === STEP.CREATING_PR) return;
    onClose();
  };

  const isBlocking = step === STEP.PUSHING || step === STEP.CREATING_PR;
  const showEditor = step === STEP.REVIEW && hasChanges && showAdvanced;

  // ─── Shared form fields (used in both simple and advanced mode) ───────────

  const formFields = (
    <>
      {/* Branch name */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level="title-sm" sx={{ mb: 0.5 }}>
          Branch
        </Typography>
        <Input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder="rearch/my-changes"
          sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}
        />
      </Box>

      {/* Commit message */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level="title-sm" sx={{ mb: 0.5 }}>
          Commit message
          {isGeneratingMessage && (
            <CircularProgress size="sm" sx={{ ml: 1 }} />
          )}
        </Typography>
        <Textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          minRows={1}
          maxRows={3}
          placeholder={
            isGeneratingMessage
              ? "Generating commit message..."
              : "Enter commit message"
          }
          disabled={isGeneratingMessage}
          sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}
        />
      </Box>

      {/* Reviewer dropdown */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography level="title-sm" sx={{ mb: 0.5 }}>
          Reviewer (optional)
        </Typography>
        <Autocomplete
          placeholder={
            loadingMembers
              ? "Loading members..."
              : "Search for a reviewer"
          }
          loading={loadingMembers}
          options={members}
          value={selectedReviewer}
          onChange={(_event, newValue) => setSelectedReviewer(newValue)}
          getOptionLabel={(option) =>
            option.displayName || option.nickname || ""
          }
          filterOptions={(options, { inputValue }) => {
            if (!inputValue) return options;
            const term = inputValue.toLowerCase();
            return options.filter(
              (m) =>
                (m.displayName && m.displayName.toLowerCase().includes(term)) ||
                (m.nickname && m.nickname.toLowerCase().includes(term)),
            );
          }}
          isOptionEqualToValue={(option, value) => option.uuid === value?.uuid}
          noOptionsText="No matching members found"
          renderOption={(props, option) => (
            <AutocompleteOption {...props} key={option.uuid}>
              <Avatar
                src={option.avatarUrl}
                alt={option.displayName}
                size="sm"
                sx={{ mr: 1, width: 24, height: 24 }}
              />
              <Typography level="body-sm">
                {option.displayName || option.nickname}
              </Typography>
            </AutocompleteOption>
          )}
          slotProps={{
            input: { sx: { fontSize: "0.85rem" } },
          }}
          sx={{ minWidth: 200 }}
        />
      </Box>
    </>
  );

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog
        sx={{
          width: showAdvanced ? "min(95vw, 1200px)" : "min(95vw, 520px)",
          height: showAdvanced ? "min(90vh, 820px)" : "auto",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          p: 0,
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 3,
            py: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <Typography level="h4" sx={{ flex: 1 }}>
            Conclude Changes
          </Typography>
          <ModalClose
            disabled={isBlocking}
            sx={{ position: "static", ml: 2 }}
          />
        </Box>

        {/* Loading state */}
        {step === STEP.LOADING && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              flex: 1,
              justifyContent: "center",
              p: 3,
            }}
          >
            <CircularProgress size="md" />
            <Typography level="body-md">Loading changes...</Typography>
          </Box>
        )}

        {/* Review state — no changes */}
        {step === STEP.REVIEW && !hasChanges && (
          <Box sx={{ p: 3 }}>
            <Alert color="neutral" variant="soft">
              No changes detected in the container. Make some changes first via
              the chat.
            </Alert>
          </Box>
        )}

        {/* ─── SIMPLE MODE (default) ─────────────────────────────────── */}
        {step === STEP.REVIEW && hasChanges && !showAdvanced && (
          <Box
            sx={{
              px: 3,
              pt: 1.5,
              pb: 3,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {/* Changed files summary */}
            <Alert color="neutral" variant="soft">
              {files.length} file{files.length !== 1 ? "s" : ""} changed
            </Alert>

            {formFields}

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mt: 1,
              }}
            >
              <Link
                component="button"
                level="body-sm"
                startDecorator={<VisibilityOutlined sx={{ fontSize: 16 }} />}
                onClick={() => setShowAdvanced(true)}
                sx={{ fontWeight: 500 }}
              >
                Show file details
              </Link>
              <Button
                onClick={handleCommitPush}
                disabled={
                  !branchName.trim() ||
                  !commitMessage.trim() ||
                  isGeneratingMessage
                }
                color="success"
                size="md"
              >
                Send for review
              </Button>
            </Box>
          </Box>
        )}

        {/* ─── ADVANCED MODE (file list + diff editor) ───────────────── */}
        {/*
          The diff editor is kept mounted whenever the modal is open in REVIEW mode
          with changes and advanced view. We never unmount it while switching files —
          instead we update its models imperatively via updateDiffEditorModels().
          This prevents the "TextModel got disposed before DiffEditorWidget model
          got reset" error.
        */}
        <Box
          sx={{
            display: showEditor ? "flex" : "none",
            flex: 1,
            overflow: "hidden",
            flexDirection: "column",
          }}
        >
          {/* Toggle back to simple view */}
          <Box
            sx={{
              px: 3,
              py: 1,
              borderBottom: "1px solid",
              borderColor: "divider",
              flexShrink: 0,
            }}
          >
            <Link
              component="button"
              level="body-sm"
              startDecorator={<VisibilityOffOutlined sx={{ fontSize: 16 }} />}
              onClick={() => setShowAdvanced(false)}
              sx={{ fontWeight: 500 }}
            >
              Hide file details
            </Link>
          </Box>

          <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Left sidebar: file list */}
            <Box
              sx={{
                width: 240,
                flexShrink: 0,
                borderRight: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <Typography
                level="body-xs"
                sx={{
                  px: 2,
                  py: 1.5,
                  fontWeight: 700,
                  color: "text.tertiary",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  flexShrink: 0,
                }}
              >
                Changed files ({files.length})
              </Typography>
              <Box sx={{ overflowY: "auto", flex: 1 }}>
                {files.map((file, i) => {
                  const shortName = file.filename.split("/").pop();
                  const dirPath = file.filename.includes("/")
                    ? file.filename.substring(0, file.filename.lastIndexOf("/"))
                    : "";
                  const isSelected = selectedFile === file.filename;
                  return (
                    <Tooltip
                      key={i}
                      title={file.filename}
                      placement="right"
                      enterDelay={600}
                    >
                      <Box
                        onClick={() => handleSelectFile(file.filename)}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          px: 2,
                          py: 1,
                          cursor: "pointer",
                          backgroundColor: isSelected
                            ? "primary.softBg"
                            : "transparent",
                          borderLeft: isSelected
                            ? "3px solid"
                            : "3px solid transparent",
                          borderColor: isSelected
                            ? "primary.500"
                            : "transparent",
                          "&:hover": {
                            backgroundColor: isSelected
                              ? "primary.softBg"
                              : "neutral.softBg",
                          },
                          transition: "background-color 0.1s",
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                          }}
                        >
                          <InsertDriveFileOutlined
                            sx={{
                              fontSize: 14,
                              color: "text.tertiary",
                              flexShrink: 0,
                            }}
                          />
                          <Typography
                            level="body-xs"
                            sx={{
                              fontWeight: isSelected ? 600 : 400,
                              fontFamily: "monospace",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: isSelected
                                ? "primary.700"
                                : "text.primary",
                            }}
                          >
                            {shortName}
                          </Typography>
                          {file.isNew && (
                            <Typography
                              level="body-xs"
                              sx={{
                                ml: "auto",
                                color: "success.600",
                                fontWeight: 700,
                                fontSize: "0.65rem",
                                flexShrink: 0,
                              }}
                            >
                              NEW
                            </Typography>
                          )}
                        </Box>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            ml: 2.5,
                          }}
                        >
                          {dirPath && (
                            <Typography
                              level="body-xs"
                              sx={{
                                color: "text.tertiary",
                                fontFamily: "monospace",
                                fontSize: "0.65rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                              }}
                            >
                              {dirPath}
                            </Typography>
                          )}
                          <Box
                            sx={{
                              display: "flex",
                              gap: 0.5,
                              ml: "auto",
                              flexShrink: 0,
                            }}
                          >
                            {file.added > 0 && (
                              <Typography
                                level="body-xs"
                                sx={{
                                  color: "success.600",
                                  fontFamily: "monospace",
                                  fontSize: "0.7rem",
                                }}
                              >
                                +{file.added}
                              </Typography>
                            )}
                            {file.deleted > 0 && (
                              <Typography
                                level="body-xs"
                                sx={{
                                  color: "danger.500",
                                  fontFamily: "monospace",
                                  fontSize: "0.7rem",
                                }}
                              >
                                -{file.deleted}
                              </Typography>
                            )}
                            {file.added === 0 && file.deleted === 0 && (
                              <Typography
                                level="body-xs"
                                sx={{
                                  color: "text.tertiary",
                                  fontFamily: "monospace",
                                  fontSize: "0.7rem",
                                }}
                              >
                                ~
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>

            {/* Main area: diff viewer */}
            <Box
              sx={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* File path breadcrumb */}
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  flexShrink: 0,
                  backgroundColor: "background.level1",
                  minHeight: 33,
                }}
              >
                <Typography
                  level="body-xs"
                  sx={{ fontFamily: "monospace", color: "text.secondary" }}
                >
                  {selectedFile || ""}
                </Typography>
              </Box>

              {/* Diff area — single persistent DiffEditor, never unmounted */}
              <Box
                sx={{
                  flex: 1,
                  overflow: "hidden",
                  position: "relative",
                  backgroundColor:
                    monacoTheme === "vs-dark" ? "#1e1e1e" : "#fffffe",
                }}
              >
                {/* Loading overlay while fetching a file diff */}
                {loadingFileDiff && (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        monacoTheme === "vs-dark"
                          ? "rgba(30,30,30,0.75)"
                          : "rgba(255,255,255,0.75)",
                      zIndex: 10,
                    }}
                  >
                    <CircularProgress size="md" />
                  </Box>
                )}

                {/* Error or binary notices rendered on top of the (empty) editor */}
                {fileDiff?.error && (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 5,
                      p: 3,
                    }}
                  >
                    <Alert
                      color="danger"
                      variant="soft"
                      startDecorator={<ErrorOutlined />}
                    >
                      Failed to load diff: {fileDiff.error}
                    </Alert>
                  </Box>
                )}

                {fileDiff?.isBinary && (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 5,
                    }}
                  >
                    <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                      Binary file — diff not available
                    </Typography>
                  </Box>
                )}

                {!selectedFile && !loadingFileDiff && (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 5,
                    }}
                  >
                    <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
                      Select a file to view the diff
                    </Typography>
                  </Box>
                )}

                {/*
                  Single persistent DiffEditor — NEVER remounted.
                  Content is updated imperatively via updateDiffEditorModels().
                */}
                <Box
                  sx={{
                    height: "100%",
                    visibility: editorReady ? "visible" : "hidden",
                  }}
                >
                  <DiffEditor
                    height="100%"
                    language="plaintext"
                    original=""
                    modified=""
                    theme={monacoTheme}
                    onMount={handleEditorDidMount}
                    keepCurrentOriginalModel
                    keepCurrentModifiedModel
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 12,
                      lineNumbers: "on",
                      wordWrap: "off",
                      renderOverviewRuler: false,
                      scrollbar: { vertical: "auto", horizontal: "auto" },
                    }}
                  />
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Bottom bar: branch + message + reviewer + action */}
          <Box
            sx={{
              borderTop: "1px solid",
              borderColor: "divider",
              px: 3,
              py: 2,
              flexShrink: 0,
              display: "flex",
              gap: 2,
              alignItems: "flex-end",
            }}
          >
            {formFields}

            {/* Action button */}
            <Button
              onClick={handleCommitPush}
              disabled={
                !branchName.trim() ||
                !commitMessage.trim() ||
                isGeneratingMessage
              }
              color="success"
              size="md"
              sx={{ flexShrink: 0, height: 40 }}
            >
              Send for review
            </Button>
          </Box>
        </Box>

        {/* Pushing state */}
        {step === STEP.PUSHING && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              flex: 1,
              justifyContent: "center",
              p: 3,
            }}
          >
            <CircularProgress size="md" />
            <Typography level="body-md">
              Committing and pushing to <strong>{branchName}</strong>...
            </Typography>
          </Box>
        )}

        {/* Creating PR state */}
        {step === STEP.CREATING_PR && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              flex: 1,
              justifyContent: "center",
              p: 3,
            }}
          >
            <CircularProgress size="md" />
            <Typography level="body-md">Creating pull request...</Typography>
          </Box>
        )}

        {/* Success state */}
        {step === STEP.SUCCESS && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              p: 3,
              flex: 1,
            }}
          >
            <Alert
              color="success"
              variant="soft"
              startDecorator={<CheckCircleOutlined />}
            >
              Changes pushed successfully to branch{" "}
              <strong>{branchName}</strong>
            </Alert>
            {prUrl ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography level="body-md">Pull request created:</Typography>
                <Button
                  component="a"
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  color="primary"
                  endDecorator={<OpenInNewOutlined />}
                  sx={{ justifyContent: "flex-start" }}
                >
                  {prTitle || "Open Pull Request"}
                </Button>
              </Box>
            ) : (
              <Alert color="warning" variant="soft">
                Push succeeded but pull request creation failed. You can create
                it manually in Bitbucket.
              </Alert>
            )}
            <Button
              onClick={handleClose}
              variant="soft"
              color="neutral"
              sx={{ mt: 1, alignSelf: "flex-start" }}
            >
              Close
            </Button>
          </Box>
        )}

        {/* Error state */}
        {step === STEP.ERROR && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              p: 3,
              flex: 1,
            }}
          >
            <Alert
              color="danger"
              variant="soft"
              startDecorator={<ErrorOutlined />}
            >
              {error || "An unexpected error occurred"}
            </Alert>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button onClick={loadData} variant="soft" color="primary">
                Retry
              </Button>
              <Button onClick={handleClose} variant="soft" color="neutral">
                Close
              </Button>
            </Box>
          </Box>
        )}
      </ModalDialog>
    </Modal>
  );
};

export default CommitPushModal;
