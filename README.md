# ACME Bank Agent Governance Demo

Shows the progression from ungoverned to governed agent tool access using
WSO2 Agent Manager as a gateway in front of both the LLM and the MCP
server.

## Agents

- **Customer Support Agent** (`agents/customer_support/`) - general
  queries, account info, loan status.
- **Account Assistant Agent** (`agents/account_assistant/`) - open
  accounts, transfer money, check balances.

Each agent's LLM connection and MCP connection are both two-mode,
switched purely by which env vars are set — no code change, no separate
build per mode. See each agent's own README
([Customer Support](agents/customer_support/README.md),
[Account Assistant](agents/account_assistant/README.md)) for its env vars
and Agent Manager deploy steps.

- **Direct / ungoverned mode**: `OPENAI_API_KEY` for the LLM,
  `MCP_SERVER_URL` for MCP — calls go straight to OpenAI and to the
  Accounts MCP server. No access control: Customer Support Agent can
  still call `open_account` / `transfer_money` if steered to.
- **Governed mode**: `LLM_GATEWAY_BASE_URL`/`LLM_GATEWAY_API_KEY` route
  LLM calls through Agent Manager's LLM gateway. `MCP_GATEWAY_URL` routes
  MCP calls through Agent Manager's **MCP gateway**, in one of two
  schemes: a shared `MCP_GATEWAY_API_KEY` (no per-agent identity), or
  per-agent `AMP_AGENTID_*` client-credentials so Agent Manager can
  enforce per-agent tool policy. Customer Support Agent's out-of-scope
  calls are expected to be denied only once AgentID policy is configured
  on the Agent Manager side.

Each agent is a FastAPI service implementing Agent Manager's chat
contract: `POST /chat` with body `{message, session_id, context}`,
responding `{"response": "..."}`; plus `GET /health`. Conversation
history is kept server-side per `session_id`.

## Prerequisites

- Python 3.11+
- A running WSO2 Agent Manager instance with:
  - an LLM gateway endpoint (OpenAI-compatible, `API-Key` header auth) —
    only needed for governed mode
  - an MCP gateway endpoint in front of the Accounts MCP server, secured
    with an `x-api-key` header by default (a different header name than
    the LLM gateway's `API-Key`) — only needed for gateway mode
  - per-agent AgentID client-credentials configured on that MCP gateway
    so each agent's identity gets its own tool policy — only needed for
    the AgentID-governed mode

## 1. Run the Accounts MCP server

```bash
cd mcp_server
pip install -r requirements.txt
python server.py
```

Runs on `http://localhost:8001/mcp` (streamable HTTP), in-memory data,
seeded with 2 sample customers, 3 accounts, and 2 loan applications.

## 2. Run the agents (direct mode)

Each agent defaults to `PORT=8000` (matching how Agent Manager deploys each
agent in its own container). Running only one agent locally at a time is the
normal case; if you need two up at once on one machine, override `PORT` for
the second.

```bash
cd agents/customer_support
pip install -r requirements.txt
cp .env.example .env   # fill in OPENAI_API_KEY and MCP_SERVER_URL
python main.py                                    # http://localhost:8000

# or, in another terminal:
cd agents/account_assistant
pip install -r requirements.txt
cp .env.example .env   # fill in OPENAI_API_KEY and MCP_SERVER_URL
PORT=8002 python main.py                          # http://localhost:8002
```

Requires the MCP server from step 1 running locally. Talk to an agent with:

```bash
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What accounts does customer cust-1 have?", "session_id": "demo-1"}'
```

Reuse the same `session_id` across calls to keep conversation history.

## 3. Switch an agent to governed mode

In `.env`, set `LLM_GATEWAY_BASE_URL`/`LLM_GATEWAY_API_KEY` to route the
LLM through Agent Manager. Restart the agent — no code change.

For MCP, there are two governed modes, moved through in order across
Modules 02–03:

- **Gateway mode (API Key)** — set `MCP_GATEWAY_URL` plus
  `MCP_GATEWAY_API_KEY` to a shared API key, matching the MCP server's
  default security scheme in Agent Manager. Calls route through Agent
  Manager's MCP gateway as an `x-api-key` header (note: a different
  header name than the LLM gateway's `API-Key`), but every agent
  authenticates with the same key — no per-agent tool policy yet. See
  `_build_mcp_client()` in each agent's `agent.py`.
- **Gateway mode (AgentID)** — each agent needs its **own** AgentID
  client-credentials (that's the identity Agent Manager keys tool policy
  on) — don't share one agent's `.env` with the other. Set
  `MCP_GATEWAY_URL` plus `AMP_AGENTID_CLIENT_ID` /
  `AMP_AGENTID_CLIENT_SECRET` / `AMP_AGENTID_TOKEN_ENDPOINT` /
  `AMP_AGENTID_SCOPES`, and leave `MCP_GATEWAY_API_KEY` unset (see each
  agent's `.env.example` for the exact fields). At startup the agent
  mints its own OAuth2 access token via client-credentials grant, scoped
  to `MCP_GATEWAY_URL` (RFC 8707 `resource` parameter), and uses that
  token as a Bearer header on every MCP call — see
  `_mint_agentid_token()` in each agent's `agent.py`. The Accounts MCP
  server from step 1 must be registered behind the MCP gateway in Agent
  Manager, with tool-access policy configured per AgentID client.

Call the agent the same way as in direct mode.

The above is the manual, local-run version of these env vars. When an
agent is deployed to Agent Manager and bound to a provider/MCP server in
the console, Agent Manager injects the matching env vars into the
running agent itself (`LLM_GATEWAY_*`, and either `MCP_GATEWAY_API_KEY`
or `AMP_AGENTID_CLIENT_*` depending on the MCP server's security scheme)
— no manual `.env` edit needed there.

See [Module 01](01-llm-governance/README.md), [Module 02](02-mcp-tool-governance/README.md),
and [Module 03](03-agentid-and-oauth2/README.md) for the full walkthrough of
configuring each governance layer in Agent Manager.

## Demo script

See `demo_script.md` for sample prompts to use live, showing the
before/after contrast at the tool-access-control step.

## Notes / things to verify against your Agent Manager instance

- The LLM gateway is wired as an OpenAI-compatible client with `base_url`
  set up to the context path, `api_key="unused"` as a sentinel, and
  `default_headers={"API-Key": <token>, "Authorization": ""}` - the
  `Authorization` header must be explicitly blanked because the openai SDK
  sets it by default from `api_key` and does not stop just because
  `API-Key` is also present. This is the pattern verified against a real
  working Agent Manager sample agent - confirm it still matches your
  instance.
- The MCP gateway supports two auth modes in this demo: a shared static
  API key sent as an `x-api-key` header (`MCP_GATEWAY_API_KEY`, Module
  02 — note this is a different header name than the LLM gateway's
  `API-Key`), or per-agent AgentID OAuth2 client-credentials (Module 03)
  — each agent
  POSTs to `AMP_AGENTID_TOKEN_ENDPOINT` with its own
  `client_id`/`client_secret`, requesting a token scoped to
  `MCP_GATEWAY_URL` via the `resource` parameter (RFC 8707), then sends
  that token as `Authorization: Bearer <token>` on MCP calls. AgentID
  connectivity verified working against a real MCP gateway route for
  basic connectivity; the tool-access policy itself (denying Customer
  Support's `open_account`/`transfer_money`) was NOT yet enforced when
  last tested against `.../default/accounts/mcp` — confirm policy is
  configured on the Agent Manager side before demoing the denial.
- Governed-mode denial handling (Customer Support Agent only) catches
  generic exceptions from the MCP tool call and logs/returns a
  governance-style fallback message - once you test against the real
  gateway with policy enforced, tighten this to match its actual error
  shape/status code if it differs.
