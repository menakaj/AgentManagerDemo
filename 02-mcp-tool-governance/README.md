# Module 02 — MCP Tool Governance: connecting through Agent Manager

**Duration:** 15 min

Module 01 governed *what the model says and costs*. This module puts
Agent Manager in front of the *tool calls* too: instead of each agent
talking straight to the Accounts MCP server, calls are routed through
Agent Manager's **MCP gateway**, secured with a default **API Key**. No
AgentID, no per-tool scopes or roles yet — this module is only about
standing the gateway up and proving the same unmodified MCP server is
now reachable only through it. Per-agent, per-tool access control is
[Module 03](../03-agentid-and-oauth2/README.md).

This is where the demo moves each agent from **direct MCP mode**
(`MCP_GATEWAY_URL` unset, calls go straight to the MCP server) to
**gateway mode** (`MCP_GATEWAY_URL` + `MCP_GATEWAY_API_KEY` set — calls
routed through Agent Manager, authenticated with an `x-api-key` header —
a different header name than the LLM gateway's `API-Key`). Both modes
are the same
[`agents/customer_support`](../agents/customer_support) /
[`agents/account_assistant`](../agents/account_assistant) code — the
switch is entirely in which env vars are set, see `_build_mcp_client()`
in each agent's `agent.py`.

## Prerequisites

- Module 01 done: both agents registered in Agent Manager, LLM-governed.
- The Accounts MCP server running locally and exposed via a tunnel (e.g.
  `ngrok`), so Agent Manager's MCP gateway can reach it:

  ```bash
  cd mcp_server
  pip install -r requirements.txt
  python server.py
  # → http://localhost:8001/mcp

  ngrok http 8001
  # → note the https forwarding URL, e.g. https://abcd1234.ngrok.io
  ```

## Step 1 — Confirm the gap (direct MCP, no gateway)

With both agents running in direct mode (as in the repo README), call
either one with a prompt that reaches the MCP server:

```bash
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What accounts does customer cust-1 have?", "session_id": "gap-1"}'
```

This succeeds by talking straight to `MCP_SERVER_URL` — Agent Manager
isn't in the path at all yet.

## Step 2 — Register the MCP server at the org level

1. Go to **organization level** → **MCP Servers** → register a new
   server, pointing at the ngrok URL from the prerequisites
   (`https://<your-subdomain>.ngrok.io/mcp`).
2. Set the authentication type to **API Key** (the default scheme) and
   generate/copy the key. This one key is what every agent in this
   module authenticates the MCP gateway with — no per-agent identity
   yet. Note the header name this scheme validates — `x-api-key` — it's
   different from the LLM gateway's `API-Key` header.

## Step 3 — Bind each deployed agent to the MCP server

For each agent (Customer Support and Account Assistant), open its MCP
configuration in Agent Manager and select the MCP server registered in
step 2. Agent Manager injects `MCP_GATEWAY_URL` and `MCP_GATEWAY_API_KEY`
into the running agent itself — no manual `.env` edit, no redeploy of
code, same pattern as binding an LLM provider in Module 01. Both agents
end up with the same API key, since neither has its own identity yet.

Locally (outside Agent Manager), the equivalent is setting
`MCP_GATEWAY_URL` and `MCP_GATEWAY_API_KEY` by hand in each agent's
`.env` — see `_build_mcp_client()` in each agent's `agent.py`: when
`MCP_GATEWAY_API_KEY` is set, the agent sends it directly as an
`x-api-key` header rather than minting an AgentID token. Note this is a
different header name than the LLM gateway's `API-Key` — the MCP
server's default security scheme validates `x-api-key`.

## Step 4 — Confirm the connection, both agents unrestricted

If either agent is running as a Platform-Hosted Agent (step 3), swap the
`localhost` URLs below for its Agent Manager endpoint instead — open the
agent's page in the console and copy the URL shown on its environment's
**Endpoint** field.

```bash
# Customer Support Agent — now via the gateway
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Please open a new savings account for customer cust-2.", "session_id": "gate-1"}'

# Account Assistant Agent — same gateway, same key
curl -X POST http://localhost:8002/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is the status of the loan application for customer cust-2?", "session_id": "gate-2"}'
```

Both succeed. The point of this module is only that both agents now
reach the MCP server exclusively through Agent Manager, authenticated —
nothing here yet stops either agent from calling any tool. That gap
(Customer Support able to call `open_account` / `transfer_money`) is
closed in Module 03, once each agent gets its own AgentID identity.

## What changed and what didn't

| | Before this module | After |
|---|---|---|
| Agent code | Unmodified | Unmodified |
| MCP calls | Direct to the MCP server, unauthenticated | Through Agent Manager's MCP gateway, `x-api-key` header authenticated |
| Tool access | Any agent, any tool | Still any agent, any tool — access control comes in Module 03 |

## Going further

- `_build_mcp_client()` in each agent's `agent.py` — where the
  direct-vs-gateway mode switch lives.
- See the [repo README's "Notes / things to verify" section](../README.md#notes--things-to-verify-against-your-agent-manager-instance)
  for caveats on this connectivity path.

---

Previous: [Module 01 — LLM Governance](../01-llm-governance/README.md) ·
Next: [Module 03 — AgentID and OAuth2](../03-agentid-and-oauth2/README.md)
