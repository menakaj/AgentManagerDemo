// Calls an agent's `/chat` endpoint (plain JSON request/response) and
// resolves with { text, outcome }. onToken is called once with the full
// reply, kept as a parameter so callers don't need to branch on streaming
// vs non-streaming agents. `accessToken`, when provided, is attached as a
// Bearer token so the agent can authorize the call against the signed-in
// Asgardeo user.
export async function streamChat(baseUrl, sessionId, message, onToken, accessToken) {
  let full = "";
  let outcome = null; // "allowed" | "denied" | null

  try {
    const headers = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = "Bearer " + accessToken;

    const res = await fetch(baseUrl + "/chat", {
      method: "POST",
      headers,
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
