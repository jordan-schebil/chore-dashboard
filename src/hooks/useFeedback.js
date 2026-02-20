import { useCallback, useState } from 'react';

const TOAST_DURATION_MS = 3500;

export function useFeedback() {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [confirmPending, setConfirmPending] = useState(false);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushToast = useCallback((message, tone = 'error') => {
    if (!message) return;
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const showError = useCallback((message) => {
    pushToast(message, 'error');
  }, [pushToast]);

  const requestConfirm = useCallback((message, onConfirm, options = {}) => {
    setConfirmDialog({
      message,
      onConfirm,
      confirmLabel: options.confirmLabel || 'Confirm',
      tone: options.tone || 'default',
    });
  }, []);

  const cancelConfirm = useCallback(() => {
    if (confirmPending) return;
    setConfirmDialog(null);
  }, [confirmPending]);

  const acceptConfirm = useCallback(async () => {
    if (!confirmDialog?.onConfirm || confirmPending) return;
    setConfirmPending(true);
    try {
      await confirmDialog.onConfirm();
    } catch (error) {
      console.warn('Confirmed action failed:', error);
      showError('Action failed');
    } finally {
      setConfirmPending(false);
      setConfirmDialog(null);
    }
  }, [confirmDialog, confirmPending, showError]);

  return {
    toasts,
    dismissToast,
    pushToast,
    showError,
    confirmDialog,
    confirmPending,
    requestConfirm,
    cancelConfirm,
    acceptConfirm,
  };
}
