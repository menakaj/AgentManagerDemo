# ACME Bank Agent Governance Demo

Shows the progression from ungoverned to governed agent tool access using
WSO2 Agent Manager as a gateway in front of both the LLM and the MCP
server.

## Session outline

Four modules, each adding a governance layer on top of the last —
**no agent code changes at any stage**, only Agent Manager configuration:

| Module | Duration | Governs | Key moment |
|---|---|---|---|
| [01 — LLM Governance](01-llm-governance/README.md) | ~20 min | What the model says and costs: PII masking, cost-based rate limiting, per-agent prompt decorators on the LLM gateway. | Same LLM gateway, two agents, two different appended compliance/audit lines — purely from which decorator is attached. |
| [02 — MCP Tool Governance](02-mcp-tool-governance/README.md) | ~15 min | Routes MCP tool calls through Agent Manager's MCP gateway (shared API Key). No per-agent policy yet. | Both agents now reach the Accounts MCP server only through the gateway — but still share one key, so tool access is still unrestricted. |
| [03 — AgentID and OAuth2](03-agentid-and-oauth2/README.md) | ~35 min | **Part A:** OAuth2/Asgardeo secures the `/chat` endpoint itself (caller identity). **Part B:** each agent gets its own AgentID identity; Agent Manager's MCP gateway enforces per-agent, per-tool policy. | Identical prompt ("open a savings account for cust-2") sent to both agents: Account Assistant succeeds, Customer Support is now **denied** — same code, only the AgentID role differs. |
| [04 — Agent Catalog](04-agent-catalog/README.md) | ~15 min | Publishing a governed agent's build as a reusable, versioned Agent Kind. Code is reused; configuration, secrets, and AgentID identity are not. | A new agent created from the Kind starts with **zero MCP tool access** until its own AgentID is walked through Module 03 Part B again. |

See [`demo_script.md`](demo_script.md) for the exact prompts to run live at
each stage, and [`DEMO_SCENARIO.md`](DEMO_SCENARIO.md) for the full
narrative walkthrough (talking points, before/after tables, caveats) behind
each module.

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

## 3. Switch an agent to governed mode (local, manual env vars)

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
  agent's own README for the exact fields). At startup the agent mints
  its own OAuth2 access token via client-credentials grant, scoped to
  `MCP_GATEWAY_URL` (RFC 8707 `resource` parameter), and uses that token
  as a Bearer header on every MCP call — see `_mint_agentid_token()` in
  each agent's `agent.py`. The Accounts MCP server from step 1 must be
  registered behind the MCP gateway in Agent Manager, with tool-access
  policy configured per AgentID client.

Call the agent the same way as in direct mode.

Full env var reference: [Customer Support](agents/customer_support/README.md#env-vars),
[Account Assistant](agents/account_assistant/README.md#env-vars).

## 4. Deploying to Agent Manager

Both agents deploy as **Platform-Hosted Agents** — Agent Manager builds
and runs the agent itself from source, rather than proxying to an
externally-hosted one. Deploy fields are identical for both (only Display
Name and Project Path differ):

| Field | Customer Support | Account Assistant |
|---|---|---|
| Agent Interface | `Chat Agent` (`POST /chat`, port 8000) | same |
| Project Path | `/agents/customer_support` | `/agents/account_assistant` |
| Language / Version | `Python` / `3.11` | same |
| Start Command | `python main.py` | same |

Once deployed, Agent Manager injects the governed-mode env vars for you
as you bind the agent to providers/servers in the console — **no manual
`.env` edit for a deployed agent**:

1. **Add Agent → Platform-Hosted Agent**, fill in the table above. At
   initial registration only `OPENAI_API_KEY` (as a secret) and
   `MCP_SERVER_URL`/`PORT=8000` need to be entered by hand — this is the
   direct/ungoverned starting point ([Module 01](01-llm-governance/README.md)).
2. Bind the agent to an LLM provider registered in Agent Manager → it
   injects `LLM_GATEWAY_BASE_URL`/`LLM_GATEWAY_API_KEY` for you.
3. Bind the agent to the org-level MCP server ([Module 02](02-mcp-tool-governance/README.md),
   registered with **API Key** security) → it injects `MCP_GATEWAY_URL` +
   `MCP_GATEWAY_API_KEY`. Every agent bound this way shares the same key —
   no per-agent tool policy yet.
4. To move to AgentID-governed MCP ([Module 03, Part B](03-agentid-and-oauth2/README.md)):
   switch that MCP server's security scheme to **OAuth2**, look up the
   agent's own **Agent ID** in the console, and assign it a role scoped to
   the tools it should be allowed to call. Agent Manager then swaps
   `MCP_GATEWAY_API_KEY` out for that agent's own `AMP_AGENTID_CLIENT_*`
   vars.
5. To add caller-identity OAuth2 on `/chat` itself ([Module 03, Part A](03-agentid-and-oauth2/README.md)):
   select **OAuth2** as the agent's security scheme and pick the
   registered Asgardeo key manager — no env var change needed.
6. **Deploy.**

Step-by-step console screens, exact role/scope names, and the full
env-var-injection table are in each agent's own README
([Customer Support](agents/customer_support/README.md#deploy-to-agent-manager),
[Account Assistant](agents/account_assistant/README.md#deploy-to-agent-manager))
and in [Module 01](01-llm-governance/README.md), [Module 02](02-mcp-tool-governance/README.md),
and [Module 03](03-agentid-and-oauth2/README.md).

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
