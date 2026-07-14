"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribe, getState, closeModal } from "@/lib/ui-store";

export default function UiHost() {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const [value, setValue] = useState("");
  const modal = state.modal;

  // Reset the prompt field each time a new prompt opens.
  useEffect(() => {
    if (modal?.kind === "prompt") setValue(modal.defaultValue);
  }, [modal]);

  return (
    <>
      <div className="toast-host">
        {state.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {modal && (
        <div className="overlay" onClick={() => closeModal(modal.kind === "prompt" ? null : false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2>{modal.title}</h2>
            {modal.message && <p className="muted" style={{ marginBottom: 14 }}>{modal.message}</p>}
            {modal.kind === "prompt" && (
              <form onSubmit={(e) => { e.preventDefault(); closeModal(value); }}>
                <input
                  autoFocus
                  type={modal.password ? "password" : "text"}
                  placeholder={modal.placeholder}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </form>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className={modal.kind === "confirm" && modal.danger ? "danger" : ""}
                style={{ flex: 1 }}
                onClick={() => closeModal(modal.kind === "prompt" ? value : true)}
              >
                {modal.kind === "confirm" ? modal.confirmLabel : "OK"}
              </button>
              <button className="ghost" style={{ flex: 1 }} onClick={() => closeModal(modal.kind === "prompt" ? null : false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
