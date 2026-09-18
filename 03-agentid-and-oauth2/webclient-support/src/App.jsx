import { useRef, useState } from "react";
import { useAuthContext } from "@asgardeo/auth-react";
import ChatPane from "./components/ChatPane.jsx";
import PromptChips from "./components/PromptChips.jsx";
import HealthField from "./components/HealthField.jsx";
import SignInGate from "./components/SignInGate.jsx";
import UserBadge from "./components/UserBadge.jsx";
import { useHealth } from "./hooks/useHealth.js";
import { streamChat } from "./lib/streamChat.js";
import { agentBaseUrl, isAsgardeoConfigured } from "./authConfig.js";

function randomSessionId(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

let nextMessageId = 1;

function SupportConsole() {
  const { getAccessToken, state } = useAuthContext();
  const authed = isAsgardeoConfigured && state.isAuthenticated;
  const [url, setUrl] = useState(agentBaseUrl);
  const health = useHealth(() => url);
  const sessionRef = useRef(randomSessionId("web-support"));

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  function appendMessage(role, text) {
    const id = nextMessageId++;
    setMessages((prev) => [...prev, { id, role, text }]);
    return id;
  }

  function updateMessage(id, patch) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function send(text) {
    if (!text || sending) return;
    setInput("");
    appendMessage("user", text);
    setSending(true);

    const trimmedUrl = url.trim().replace(/\/+$/, "");
    const id = appendMessage("agent", "");
    updateMessage(id, { streaming: true });

    let accessToken;
    if (authed) {
      try {
        accessToken = await getAccessToken();
      } catch {
        accessToken = undefined;
      }
    }

    const { text: finalText, outcome } = await streamChat(
      trimmedUrl,
      sessionRef.current,
      text,
      (partial) => updateMessage(id, { text: partial }),
      accessToken
    );

    updateMessage(id, { text: finalText, outcome, streaming: false });
    setSending(false);
  }

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <span className="mark">AB</span>
          <div>
            <h1>ACME Bank &mdash; Customer Support</h1>
          </div>
          <span className="tag">{authed ? "signed-in agent access, token-authorized" : "unauthenticated agent access"}</span>
        </div>
        <UserBadge />
      </header>

      <section className="config" aria-label="Agent endpoint">
        <HealthField
          label="Agent URL"
          url={url}
          onUrlChange={setUrl}
          onUrlBlur={health.check}
          status={health.status}
          inputAriaLabel="Customer Support agent base URL"
        />
        <p className="hint">
          {authed ? (
            <>
              Customer Support Agent &mdash; every request carries your signed-in Asgardeo access token. Defaults to{" "}
              <code>:8000</code>.
            </>
          ) : (
            <>
              Customer Support Agent, running without sign-in &mdash; requests carry no access token. Defaults to{" "}
              <code>:8000</code>.
            </>
          )}
        </p>
      </section>

      <section className="view active">
        <div className="panes single">
          <ChatPane
            avatarLabel="S1"
            avatarVariant="s1"
            name="Customer Support Agent"
            sub={authed ? "Authenticated · token-authorized" : "No sign-in configured"}
            badgeLabel={authed ? "signed in" : "unauthenticated"}
            badgeVariant={authed ? "governed" : "ungoverned"}
            messages={messages}
            emptyGlyph=">_"
            emptyText="Ask about an account, a balance, or a loan status."
            composer={
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input.trim());
                }}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. What's the balance on account acc-1001?"
                  autoComplete="off"
                />
                <button type="submit" disabled={sending}>
                  Send
                </button>
              </form>
            }
          />
        </div>
        <PromptChips onPick={send} disabled={sending} riskyTitle="Sample prompt" />
      </section>

      <footer>
        SSE streamed from the agent&rsquo;s <code>/chat</code> endpoint
        {authed ? <> &middot; Authorization: Bearer token attached per request</> : null}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SignInGate>
      <SupportConsole />
    </SignInGate>
  );
}
