import { useCallback, useEffect, useRef, useState } from "react";

// Polls one agent's /health endpoint on an interval and on demand (check()).
// `getUrl` is read fresh on every check so edits to the URL field take effect immediately.
export function useHealth(getUrl, { intervalMs = 8000 } = {}) {
  const [status, setStatus] = useState({ state: "checking", label: "checking…" });
  const getUrlRef = useRef(getUrl);
  getUrlRef.current = getUrl;

  const check = useCallback(async () => {
    const base = getUrlRef.current().trim().replace(/\/+$/, "");
    try {
      const res = await fetch(base + "/health", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      setStatus({
        state: "up",
        label: (data.agent || "agent") + (data.mcp_governed ? " / mcp governed" : " / mcp direct"),
      });
    } catch {
      setStatus({ state: "down", label: "unreachable" });
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);

  return { status, check };
}
