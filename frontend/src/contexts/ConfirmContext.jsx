import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import {
  Modal,
  ModalDialog,
  Typography,
  Button,
  Stack,
  Divider,
} from "@mui/joy";


const ConfirmContext = createContext(null);

/**
 * Provides a `confirm()` function that returns a Promise<boolean>,
 * rendering a MUI Joy Modal instead of window.confirm().
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm("Delete this item?")) { ... }
 *
 * Or with options:
 *   await confirm({ title: "Delete", message: "Are you sure?", confirmText: "Delete", confirmColor: "danger" })
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: "Confirm",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    confirmColor: "danger",
  });
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    const opts =
      typeof options === "string" ? { message: options } : options || {};
    setState({
      open: true,
      title: opts.title || "Confirm",
      message: opts.message || "Are you sure?",
      confirmText: opts.confirmText || "Confirm",
      cancelText: opts.cancelText || "Cancel",
      confirmColor: opts.confirmColor || "danger",
    });
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleClose = useCallback((result) => {
    setState((prev) => ({ ...prev, open: false }));
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={state.open} onClose={() => handleClose(false)}>
        <ModalDialog
          variant="outlined"
          role="alertdialog"
          sx={{
            width: { xs: "85vw", sm: 340 },
            p: 2,
            bgcolor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
          }}
        >
          <Typography
            level="title-sm"
            sx={{ fontWeight: 600, color: "var(--text-primary)" }}
          >
            {state.title}
          </Typography>
          <Divider />
          <Typography
            level="body-sm"
            sx={{ color: "var(--text-secondary)", mt: 1 }}
          >
            {state.message}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            justifyContent="flex-end"
            sx={{ mt: 1.5 }}
          >
            <Button
              size="sm"
              variant="outlined"
              color="neutral"
              onClick={() => handleClose(false)}
              sx={{ borderColor: "var(--border-color)" }}
            >
              {state.cancelText}
            </Button>
            <Button
              size="sm"
              variant="solid"
              color={state.confirmColor}
              onClick={() => handleClose(true)}
            >
              {state.confirmText}
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}
