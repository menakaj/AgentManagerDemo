// Calls an agent's `/chat` endpoint (plain JSON request/response) and
// resolves with { text, outcome }. onToken is called once with the full
// reply, kept as a parameter so callers don't need to branch on streaming
// vs non-streaming agents.
export async function streamChat(baseUrl, sessionId, message, onToken) {
  let full = "";
  let outcome = null; // "allowed" | "denied" | null

  try {
    const res = await fetch(baseUrl + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId }),
    });
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const payload = await res.json();
    full = typeof payload.response === "string" ? payload.response : "";
    onToken(full);
  } catch (err) {
    full = full || "Could not reach this agent (" + err.message + "). Check the URL above and that it's running.";
    outcome = "denied";
  }

  if (outcome === null) {
    const lower = full.toLowerCase();
    outcome = /restrict|polic|not available|denied|blocked/.test(lower) ? "denied" : "allowed";
  }

  return { text: full || "(empty response)", outcome };
}
