"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { DocsAPI?: any }
}

export default function Editor({ dsUrl, config, title, redacted, hideNav }: { dsUrl: string; config: any; title: string; redacted?: boolean; hideNav?: boolean }) {
  const editorRef = useRef<any>(null);
  const connectorRef = useRef<any>(null);
  const [canClassify, setCanClassify] = useState(false);
  const [level, setLevel] = useState(7);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = `${dsUrl}/web-apps/apps/api/documents/api.js`;
    script.onload = () => {
      editorRef.current = new window.DocsAPI.DocEditor("shield-editor", {
        ...config,
        events: {
          onDocumentReady: () => {
            // Automation connector lets us insert classification markers from here —
            // no server plugin needed. Only meaningful in editable (non-redacted) views.
            if (redacted) return;
            try {
              connectorRef.current = editorRef.current.createConnection?.();
              if (connectorRef.current) setCanClassify(true);
            } catch {}
          },
        },
      });
    };
    document.body.appendChild(script);
    return () => {
      editorRef.current?.destroyEditor?.();
      script.remove();
    };
  }, []);

  function classify() {
    // Paragraph-level convention: a [[CLR:n]] anywhere in the paragraph classifies it.
    connectorRef.current?.executeMethod?.("PasteText", [`[[CLR:${level}]] `]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="topbar" style={{ padding: "8px 16px" }}>
        <div className="logo">
          {!hideNav && <a href="/dashboard"><button className="ghost small">← Archives</button></a>}
          <span className="badge">{title}</span>
          {redacted && <span className="classif high">REDACTED VIEW — read-only, classified sections hidden</span>}
        </div>
        {canClassify && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: "0.8rem" }}>Place cursor in a paragraph, then:</span>
            <select value={level} onChange={(e) => setLevel(+e.target.value)} style={{ marginBottom: 0, width: 110 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Level {n}</option>)}
            </select>
            <button className="small" onClick={classify} title="Mark the current paragraph as classified">Classify</button>
          </div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div id="shield-editor" />
      </div>
    </div>
  );
}
