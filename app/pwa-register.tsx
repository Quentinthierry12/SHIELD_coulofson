"use client";
import { useEffect } from "react";

// Enregistre le service worker côté client (installation PWA + repli hors-ligne).
export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* échec silencieux : l'appli fonctionne sans SW */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
