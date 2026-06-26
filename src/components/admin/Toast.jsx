import React, { useEffect } from "react";

// Replaces alert() for non-blocking success/error feedback — auto-dismisses
// so the person isn't forced to click "OK" on every action.
export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.type === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div
      className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 rounded-xl p-4 shadow-lg"
      style={{
        background: "#131d35",
        border: `1px solid ${isError ? "rgba(245,54,92,0.4)" : "rgba(45,206,137,0.4)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm" style={{ color: isError ? "#f5365c" : "#2dce89" }}>
          {toast.message}
        </p>
        <button
          onClick={onDismiss}
          className="text-slate-500 hover:text-slate-300 text-sm shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
