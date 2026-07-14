"use client";
// Tiny imperative UI layer: toasts + confirm/prompt dialogs, themed in-app instead of
// the browser's native alert/prompt/confirm. Pub/sub, no external state lib.

export type Toast = { id: number; msg: string; type: "info" | "success" | "error" };
export type Modal =
  | { kind: "confirm"; title: string; message?: string; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: "prompt"; title: string; message?: string; placeholder: string; defaultValue: string; password: boolean; resolve: (v: string | null) => void };

type State = { toasts: Toast[]; modal: Modal | null };

let state: State = { toasts: [], modal: null };
const listeners = new Set<() => void>();
let nextId = 1;

function emit() { state = { ...state }; listeners.forEach((l) => l()); }

export function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
export function getState() { return state; }

export function toast(msg: string, type: Toast["type"] = "info") {
  const id = nextId++;
  state.toasts = [...state.toasts, { id, msg, type }];
  emit();
  setTimeout(() => {
    state.toasts = state.toasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    state.modal = { kind: "confirm", title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel || "Confirm", danger: !!opts.danger, resolve };
    emit();
  });
}

export function promptDialog(opts: { title: string; message?: string; placeholder?: string; defaultValue?: string; password?: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    state.modal = { kind: "prompt", title: opts.title, message: opts.message, placeholder: opts.placeholder || "", defaultValue: opts.defaultValue || "", password: !!opts.password, resolve };
    emit();
  });
}

export function closeModal(value: boolean | string | null) {
  const m = state.modal;
  state.modal = null;
  emit();
  if (m) (m.resolve as any)(value);
}
