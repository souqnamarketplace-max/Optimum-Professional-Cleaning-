import React from "react";

// Replaces window.confirm/alert with something that matches the app's
// dark green visual style instead of the browser's plain native dialog.
export default function ConfirmModal({
  open,
  title,
  message,
  detail,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,14,26,0.7)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "#131d35", border: "1px solid rgba(45,206,137,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        {message && <p className="text-slate-300 text-sm mb-3 whitespace-pre-line">{message}</p>}
        {detail && (
          <div
            className="rounded-lg p-3 text-sm text-slate-400 mb-4"
            style={{ background: "#0f1729" }}
          >
            {detail}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm text-slate-300"
              style={{ background: "#0f1729" }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{
              background: destructive
                ? "#f5365c"
                : "linear-gradient(135deg, #2dce89, #11cdef)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
