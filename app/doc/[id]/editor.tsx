"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window { DocsAPI?: any }
}

export default function Editor({ dsUrl, config, title, redacted, hideNav, docId }: { dsUrl: string; config: any; title: string; redacted?: boolean; hideNav?: boolean; docId?: number }) {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = `${dsUrl}/web-apps/apps/api/documents/api.js`;
    script.onload = () => {
      // Mention events are attached client-side (they carry callbacks, so they can't ride in
      // the signed config). Both are fire-and-forget — a failure here must never wedge the editor.
      const withEvents = {
        ...config,
        events: {
          // Feeds the "@" autocomplete: the agents that can be mentioned in a comment.
          onRequestUsers: (event: any) => {
            if (!docId) return;
            const c = event?.data?.c;
            // Only the mention context needs the agent list; other contexts get an empty set.
            if (c && c !== "mention") { editorRef.current?.setUsers?.({ c, users: [] }); return; }
            fetch(`/api/documents/${docId}/users`)
              .then((r) => (r.ok ? r.json() : []))
              .then((users) => editorRef.current?.setUsers?.({ c, users }))
              .catch(() => {});
          },
          // Fired when someone is @mentioned in a comment — the portal pings them (push + DM).
          // The payload shape varies across Document Server versions, so read it defensively.
          onRequestSendNotify: (event: any) => {
            if (!docId) return;
            const d = event?.data || {};
            const emails = Array.isArray(d.emails) ? d.emails
              : Array.isArray(d?.data?.emails) ? d.data.emails : [];
            const comment = d.message ?? d.comment ?? d?.data?.message ?? "";
            if (!emails.length) return;
            fetch(`/api/documents/${docId}/mention`, {
              method: "POST",
              body: JSON.stringify({ emails, comment }),
            }).catch(() => {});
          },
        },
      };
      editorRef.current = new window.DocsAPI.DocEditor("shield-editor", withEvents);
    };
    document.body.appendChild(script);
    return () => {
      editorRef.current?.destroyEditor?.();
      script.remove();
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <div className="topbar" style={{ padding: "8px 16px" }}>
        <div className="logo">
          {!hideNav && <a href="/dashboard"><button className="ghost small">← Archives</button></a>}
          <span className="badge">{title}</span>
          {redacted && <span className="classif high">REDACTED VIEW — read-only, classified sections hidden</span>}
        </div>
        {!redacted && (
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            Classify a paragraph: type [[CLR:n]] in it (n = clearance level)
          </span>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div id="shield-editor" />
      </div>
    </div>
  );
}
