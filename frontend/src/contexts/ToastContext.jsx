import React, { createContext, useContext, useState, useCallback } from 'react';
import Snackbar from '@mui/joy/Snackbar';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoIcon from '@mui/icons-material/Info';

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircleIcon />,
  danger: <ErrorOutlineIcon />,
  warning: <WarningAmberIcon />,
  neutral: <InfoIcon />,
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ open: false, message: '', color: 'neutral' });

  const showToast = useCallback((message, color = 'neutral') => {
    setToast({ open: true, message, color });
  }, []);

  const handleClose = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  const contextValue = React.useMemo(() => ({
    success: (message) => showToast(message, 'success'),
    error: (message) => showToast(message, 'danger'),
    warning: (message) => showToast(message, 'warning'),
    info: (message) => showToast(message, 'neutral'),
  }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <Snackbar
        open={toast.open}
        onClose={handleClose}
        autoHideDuration={5000}
        color={toast.color}
        variant="solid"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        startDecorator={ICONS[toast.color]}
      >
        {toast.message}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
