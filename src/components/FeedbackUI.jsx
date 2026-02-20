import React, { memo } from 'react';

const toastToneClass = (tone) => {
  if (tone === 'success') return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  if (tone === 'info') return 'bg-blue-50 border-blue-200 text-blue-800';
  return 'bg-red-50 border-red-200 text-red-800';
};

export const ToastStack = memo(function ToastStack({ toasts, onDismiss }) {
  if (!toasts?.length) return null;
  return (
    <div className="fixed right-4 top-4 z-[80] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`rounded-lg border px-3 py-2 shadow-sm flex items-start gap-2 ${toastToneClass(toast.tone)}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex-1 text-sm">{toast.message}</div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="text-xs opacity-70 hover:opacity-100"
            aria-label="Dismiss notification"
          >
            Close
          </button>
        </div>
      ))}
    </div>
  );
});

export const ConfirmDialog = memo(function ConfirmDialog({
  dialog,
  pending,
  onCancel,
  onConfirm,
}) {
  if (!dialog) return null;

  const confirmButtonClass = dialog.tone === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-[70] bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Confirm Action</h3>
        <p className="text-sm text-gray-600">{dialog.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`px-3 py-2 text-sm text-white rounded-lg disabled:opacity-60 ${confirmButtonClass}`}
          >
            {pending ? 'Working...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});
