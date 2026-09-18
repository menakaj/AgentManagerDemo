import { useRef, useState } from "react";
import ChatPane from "./components/ChatPane.jsx";
import PromptChips from "./components/PromptChips.jsx";
import HealthField from "./components/HealthField.jsx";
import { useHealth } from "./hooks/useHealth.js";
import { streamChat } from "./lib/streamChat.js";

function randomSessionId(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

let nextMessageId = 1;

const DEFAULT_URL_CS = import.meta.env.VITE_CUSTOMER_SUPPORT_URL || "http://localhost:8000";
const DEFAULT_URL_AA = import.meta.env.VITE_ACCOUNT_ASSISTANT_URL || "http://localhost:8002";

export default function App() {
  const [urlCs, setUrlCs] = useState(DEFAULT_URL_CS);
  const [urlAa, setUrlAa] = useState(DEFAULT_URL_AA);

  const healthCs = useHealth(() => urlCs);
  const healthAa = useHealth(() => urlAa);

  const sessionsRef = useRef({
    cs: randomSessionId("web-cmp-cs"),
    aa: randomSessionId("web-cmp-aa"),
  });

  const [messagesCs, setMessagesCs] = useState([]);
  const [messagesAa, setMessagesAa] = useState([]);
  const [inputCompare, setInputCompare] = useState("");
  const [sendingCompare, setSendingCompare] = useState(false);

  function appendMessage(setMessages, role, text) {
    const id = nextMessageId++;
    setMessages((prev) => [...prev, { id, role, text }]);
    return id;
  }

  function updateMessage(setMessages, id, patch) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function runAgentReply(baseUrl, sessionId, text, setMessages) {
    const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
    const id = appendMessage(setMessages, "agent", "");
    updateMessage(setMessages, id, { streaming: true });

    const { text: finalText, outcome } = await streamChat(trimmedUrl, sessionId, text, (partial) => {
      updateMessage(setMessages, id, { text: partial });
    });

    updateMessage(setMessages, id, { text: finalText, outcome, streaming: false });
  }

  async function sendCompare(text) {
    if (!text || sendingCompare) return;
    setInputCompare("");
    appendMessage(setMessagesCs, "user", text);
    appendMessage(setMessagesAa, "user", text);
    setSendingCompare(true);
    await Promise.all([
      runAgentReply(urlCs, sessionsRef.current.cs, text, setMessagesCs),
      runAgentReply(urlAa, sessionsRef.current.aa, text, setMessagesAa),
    ]);
    setSendingCompare(false);
  }

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <span className="mark">AB</span>
          <div>
            <h1>ACME Bank &mdash; Governance Console</h1>
          </div>
          <span className="tag">same prompt, two agent identities &mdash; direct mode vs. AgentID-governed MCP</span>
        </div>
      </header>

      <section className="config" aria-label="Agent endpoints">
        <HealthField
          label="Support URL"
          url={urlCs}
          onUrlChange={setUrlCs}
          onUrlBlur={healthCs.check}
          status={healthCs.status}
          inputAriaLabel="Customer Support agent base URL"
        />
        <HealthField
          label="Assistant URL"
          url={urlAa}
          onUrlChange={setUrlAa}
          onUrlBlur={healthAa.check}
          status={healthAa.status}
          inputAriaLabel="Account Assistant agent base URL"
        />
        <p className="hint">
          Before Module 03&rsquo;s AgentID policy is configured, both agents can call every tool on the shared
          Accounts MCP server. After it&rsquo;s configured, each agent authenticates with its own AgentID
          identity through Agent Manager&rsquo;s MCP gateway, and that identity is what the policy is keyed on.
          Each agent defaults to <code>:8000</code> &mdash; run them on different ports and update the fields
          above.
        </p>
      </section>

      <section className="view active">
        <div className="panes">
          <ChatPane
            avatarLabel="CS"
            avatarVariant="s1"
            name="Customer Support"
            sub="general queries, account info, loan status"
            badgeLabel="out of scope: accounts"
            badgeVariant="ungoverned"
            messages={messagesCs}
            emptyGlyph="≡"
            emptyText="Send the same message to both agents to compare what each identity is actually allowed to do."
          />
          <ChatPane
            avatarLabel="AA"
            avatarVariant="s2"
            name="Account Assistant"
            sub="open accounts, transfer money, check balances"
            badgeLabel="in scope: accounts"
            badgeVariant="governed"
            messages={messagesAa}
            emptyGlyph="≡"
            emptyText="Opening accounts and transfers are in this agent's scope — expect these to keep succeeding here."
          />
        </div>
        <form
          className="shared-composer"
          onSubmit={(e) => {
            e.preventDefault();
            sendCompare(inputCompare.trim());
          }}
        >
          <input
            type="text"
            value={inputCompare}
            onChange={(e) => setInputCompare(e.target.value)}
            placeholder="e.g. Please open a new savings account for customer cust-2"
            autoComplete="off"
          />
          <button type="submit" disabled={sendingCompare}>
            Send to both
          </button>
        </form>
        <PromptChips
          onPick={sendCompare}
          disabled={sendingCompare}
          riskyTitle="In scope for Account Assistant, out of scope for Customer Support — tests governance"
        />
      </section>

      <footer>
        Each panel calls its agent&rsquo;s own <code>/chat</code> endpoint &middot; session id persists per pane
        while this page stays open
      </footer>
    </div>
  );
}
