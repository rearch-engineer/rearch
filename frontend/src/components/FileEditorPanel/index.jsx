import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import Editor from "@monaco-editor/react";
import { useColorScheme } from "@mui/joy/styles";
import Button from "@mui/joy/Button";
import IconButton from "@mui/joy/IconButton";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import CircularProgress from "@mui/joy/CircularProgress";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { api } from "../../api/client";
import { useWorkspaces } from "../../contexts/WorkspacesContext";
import { useConversations } from "../../contexts/ConversationsContext";
import { usePanels } from "../../contexts/PanelContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";
import "./FileEditorPanel.css";

const LANGUAGE_BY_EXT = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
  json: "json", jsonc: "json", md: "markdown", mdx: "markdown",
  html: "html", htm: "html", xml: "xml", svg: "xml",
  css: "css", scss: "scss", less: "less",
  yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", env: "ini",
  sh: "shell", bash: "shell", zsh: "shell",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp",
  php: "php", sql: "sql", swift: "swift", graphql: "graphql", gql: "graphql",
};
const LANGUAGE_BY_NAME = { dockerfile: "dockerfile", makefile: "makefile" };

function detectLanguage(filePath) {
  const name = filePath.split("/").pop().toLowerCase();
  if (LANGUAGE_BY_NAME[name]) return LANGUAGE_BY_NAME[name];
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return LANGUAGE_BY_EXT[ext] || "plaintext";
}

const EDITOR_OPTIONS = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  tabSize: 2,
  renderWhitespace: "selection",
  wordWrap: "off",
};

/**
 * Monaco editor tab for one repository file inside the conversation container.
 * Panel ID: "file:<path>". Saves with the toolbar button or Ctrl/Cmd+S.
 */
const FileEditorPanel = ({ conversationId, panelId, filePath }) => {
  const { t } = useTranslation("FileEditorPanel");
  const { mode, systemMode } = useColorScheme();
  const monacoTheme = (mode === "system" ? systemMode : mode) === "dark" ? "vs-dark" : "vs";
  const { activeWorkspace } = useWorkspaces();
  const { conversations } = useConversations();
  const { registerPanelActions, unregisterPanelActions, setPanelDirty } = usePanels();
  const confirm = useConfirm();
  const toast = useToast();
  const workspaceId = activeWorkspace?._id;
  const isRunning = conversations.find((c) => c._id === conversationId)?.environment?.status === "running";
  const fileName = filePath.split("/").pop();

  // status: loading | ready | binary | tooLarge | notFound | notRunning | error
  const [state, setState] = useState({ status: "loading" });
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const dirty = state.status === "ready" && content !== savedContent;
  const editorRef = useRef(null);

  const load = useCallback(async () => {
    if (!workspaceId || !conversationId) return;
    setState({ status: "loading" });
    try {
      const res = await api.readFile(workspaceId, conversationId, filePath);
      if (res.binary) {
        setState({ status: "binary" });
        return;
      }
      setContent(res.content);
      setSavedContent(res.content);
      setState({ status: "ready" });
    } catch (err) {
      const httpStatus = err.response?.status;
      const message = err.response?.data?.error || err.message;
      const status =
        httpStatus === 413 ? "tooLarge"
          : httpStatus === 404 ? "notFound"
            : httpStatus === 503 ? "notRunning"
              : "error";
      setState({ status, message });
    }
  }, [workspaceId, conversationId, filePath]);

  useEffect(() => { load(); }, [load]);

  // Retry automatically once the container comes back up
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  useEffect(() => {
    if (isRunning && statusRef.current === "notRunning") load();
  }, [isRunning, load]);

  // Expose unsaved state to the tab bar
  useEffect(() => { setPanelDirty(panelId, dirty); }, [panelId, dirty, setPanelDirty]);
  useEffect(() => () => setPanelDirty(panelId, false), [panelId, setPanelDirty]);

  const save = useCallback(async () => {
    if (state.status !== "ready" || saving) return;
    // Read straight from the editor model: a keyboard shortcut can fire before
    // React has re-rendered with the latest onChange value.
    const toSave = editorRef.current ? editorRef.current.getValue() : content;
    if (toSave === savedContent) return;
    setSaving(true);
    try {
      await api.writeFile(workspaceId, conversationId, filePath, toSave);
      setContent(toSave);
      setSavedContent(toSave);
      setSavedOnce(true);
      if (window.__sessionSidebarRefresh) window.__sessionSidebarRefresh();
    } catch (err) {
      toast.error(`${t("saveError")}: ${err.response?.data?.error || err.message}`);
    } finally {
      setSaving(false);
    }
  }, [state.status, saving, content, savedContent, workspaceId, conversationId, filePath, toast, t]);

  const saveRef = useRef(save);
  saveRef.current = save;

  const handleMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
  }, []);

  const reload = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: t("reloadTitle"),
        message: t("reloadMessage", { file: fileName }),
        confirmText: t("reloadConfirm"),
        confirmColor: "warning",
      });
      if (!ok) return;
    }
    load();
  }, [dirty, confirm, t, fileName, load]);

  const beforeClose = useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: t("discardTitle"),
      message: t("discardMessage", { file: fileName }),
      confirmText: t("discardConfirm"),
      confirmColor: "danger",
    });
  }, [dirty, confirm, t, fileName]);

  useEffect(() => {
    registerPanelActions(panelId, { reload, beforeClose });
    return () => unregisterPanelActions(panelId);
  }, [panelId, reload, beforeClose, registerPanelActions, unregisterPanelActions]);

  const statusText = saving ? t("saving") : dirty ? t("unsaved") : savedOnce ? t("saved") : "";
  const showMessage = ["binary", "tooLarge", "notFound", "notRunning", "error"].includes(state.status);
  const canRetry = ["notFound", "notRunning", "error"].includes(state.status);

  return (
    <div className="file-editor-panel">
      <div className="file-editor-toolbar">
        <span className="file-editor-path" title={filePath}>{filePath}</span>
        <span className={`file-editor-status${dirty ? " dirty" : ""}`}>{statusText}</span>
        <Tooltip title={t("reload")}>
          <IconButton size="sm" variant="plain" onClick={reload} disabled={state.status === "loading" || saving} sx={{ "--IconButton-size": "28px" }}>
            <RefreshOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Button
          size="sm"
          variant="solid"
          startDecorator={<SaveOutlined sx={{ fontSize: 16 }} />}
          onClick={save}
          disabled={!dirty || saving}
          loading={saving}
          sx={{ minHeight: 28, fontSize: "0.78rem" }}
        >
          {t("save")}
        </Button>
      </div>
      <div className="file-editor-body">
        {state.status === "loading" && (
          <div className="file-editor-message"><CircularProgress size="sm" /></div>
        )}
        {state.status === "ready" && (
          <Editor
            height="100%"
            path={`${conversationId}/${filePath}`}
            language={detectLanguage(filePath)}
            value={content}
            theme={monacoTheme}
            onChange={(value) => setContent(value ?? "")}
            onMount={handleMount}
            options={EDITOR_OPTIONS}
            loading={<CircularProgress size="sm" />}
          />
        )}
        {showMessage && (
          <div className="file-editor-message">
            <Typography level="body-sm">{t(state.status === "error" ? "loadError" : state.status)}</Typography>
            {state.status === "error" && state.message && (
              <Typography level="body-xs" sx={{ color: "text.tertiary" }}>{state.message}</Typography>
            )}
            {canRetry && (
              <Button size="sm" variant="outlined" onClick={load}>{t("retry")}</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileEditorPanel;
