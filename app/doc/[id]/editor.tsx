"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window { DocsAPI?: any }
}

export default function Editor({ dsUrl, config, title }: { dsUrl: string; config: any; title: string }) {
  const editorRef = useRef<any>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = `${dsUrl}/web-apps/apps/api/documents/api.js`;
    script.onload = () => {
      editorRef.current = new window.DocsAPI.DocEditor("shield-editor", config);
    };
    document.body.appendChild(script);
    return () => {
      editorRef.current?.destroyEditor?.();
      script.remove();
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="topbar" style={{ padding: "8px 16px" }}>
        <div className="logo">
          <a href="/dashboard"><button className="ghost small">← Archives</button></a>
          <span className="badge">🦅 {title}</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div id="shield-editor" />
      </div>
    </div>
  );
}
