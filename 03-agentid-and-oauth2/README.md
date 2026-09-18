# Module 03 — AgentID and OAuth2: identity for callers and identity for agents

**Duration:** 35 min

Modules 01 and 02 governed what the model says and costs, and put a
gateway (API-Key secured) in front of MCP calls — but neither one
restricts who can call `/chat`, nor which tools a given agent is allowed
to use. This module closes both gaps with **AgentID**: first as the
identity an OAuth2 provider issues to a *caller* (a signed-in guest),
then as the identity Agent Manager issues to each *agent itself*, which
its MCP gateway keys per-tool policy on.

## Part A — OAuth2: from an open endpoint to a signed-in guest

The Customer Support Agent's `/chat` endpoint is still wide open: point
a client at it and it answers, no questions asked. This part puts an
identity provider in front of it — first at the agent-manager layer,
then in the web client guests actually use — without touching a line of
the agent's code.

### Prerequisites

- An [Asgardeo](https://asgardeo.io) account (free tier is enough).
- Modules 01–02 done: the Customer Support Agent LLM-governed and
  reachable through Agent Manager's MCP gateway.

### Step 1 — Create an Asgardeo organization

1. Sign up at [asgardeo.io](https://asgardeo.io) and create an
   organization if you don't have one already.
2. Note the organization name — it becomes part of every endpoint you use
   below, in the form `https://api.asgardeo.io/t/<org-name>`.

### Step 2 — Register Asgardeo as a key manager in Agent Manager

Agent Manager doesn't issue tokens itself — it validates tokens issued by
a key manager you register.

1. Log in to the Agent Manager console.
2. Go to the **organization level** (not a specific project) → **Gateways**.
3. Open the **default gateway** and click to add a **Key Manager**.
4. Provide Asgardeo's well-known endpoint:

   ```
   https://api.asgardeo.io/t/<org-name>/oauth2/token/.well-known/openid-configuration
   ```

   Agent Manager reads issuer, JWKS, and token endpoint details from this
   document — nothing else needs to be typed in by hand.
5. Save. The key manager should show as active before you continue.

### Step 3 — Deploy the Customer Support Agent as a Platform-Hosted Agent

If it isn't already registered as a Platform-Hosted Agent (as opposed to
an Externally-Hosted Agent that Agent Manager merely proxies to) — see
the pattern in the
[tutorial-3 lab, module 01](https://github.com/wso2con/2026-NBO-AI-tutorial-3/blob/main/01-build-deploy/README.md)
if you need the general build/deploy flow:

1. **Add Agent → Platform-Hosted Agent → Source Code**, pointing at
   [`agents/customer_support`](../agents/customer_support).
2. Configure env vars as in Modules 01–02 (`OPENAI_API_KEY` or
   `LLM_GATEWAY_*`; `MCP_SERVER_URL` or `MCP_GATEWAY_URL`).
3. Deploy.

This step only matters if the agent has been running purely locally up
to now — every Platform-Hosted Agent automatically gets an AgentID
identity on deployment, which Part B keys tool policy on.

### Step 4 — Confirm the gap (no auth)

With the agent deployed but no security scheme configured on its Agent
Manager listener yet:

```bash
curl -N -X POST "$AGENT_URL/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message": "What accounts does customer cust-1 have?", "session_id": "demo-1"}'
```

This succeeds with no credentials at all. Keep this response in mind —
step 6 repeats the exact same call.

### Step 5 — Enable OAuth2 on the deployed agent

1. Open the agent's **Deploy** page → **Development** environment →
   **Configurations and Secrets** → **Configure**.
2. Select **OAuth2** as the security scheme and pick the key manager you
   registered in step 2.
3. **Save.**

### Step 6 — Recheck invoking (now fails)

Run the identical `curl` from step 4 against the deployed agent's
gateway URL, still with no token:

```bash
curl -N -X POST "$AGENT_URL/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message": "What accounts does customer cust-1 have?", "session_id": "demo-1"}'
```

Expect a `401`. Same request, same agent code, same conversation history
model — the only thing that changed is a configuration toggle at the
gateway. That's the point to narrate: authorization moved out of the
agent and into the platform in front of it.

### Step 7 — Register a single-page app in Asgardeo

The webapp guests use needs its own OAuth2 client — separate from
whatever machine-to-machine credentials Part B introduces.

1. In the Asgardeo console, go to **Applications** → **New Application** →
   **Single-Page Application**.
2. Set the redirect URL to match the web client's dev origin, e.g.
   `http://localhost:5174`.
3. Copy the **Client ID** — you'll need it next. SPAs use the
   authorization-code-with-PKCE flow, so there's no client secret to copy.

### Step 8 — Configure the web client for login

The support web client at
[`webclient-support`](webclient-support) already has Asgardeo sign-in
wired in via `@asgardeo/auth-react` (see
[`src/authConfig.js`](webclient-support/src/authConfig.js)) — configure it
with the values from step 7:

```bash
cd webclient-support
npm install
cp .env.example .env
```

Edit `.env`:

```bash
VITE_ASGARDEO_BASE_URL=https://api.asgardeo.io/t/<org-name>
VITE_ASGARDEO_CLIENT_ID=<client-id-from-step-7>
VITE_ASGARDEO_SIGN_IN_REDIRECT_URL=http://localhost:5174
VITE_ASGARDEO_SIGN_OUT_REDIRECT_URL=http://localhost:5174
VITE_AGENT_BASE_URL=<agent-url-from-step-5>
```

```bash
npm run dev
# → http://localhost:5174
```

### Step 9 — Verify

Open `http://localhost:5174`. The `SignInGate` component (see
[`src/components/SignInGate.jsx`](webclient-support/src/components/SignInGate.jsx))
blocks the chat pane until Asgardeo sign-in completes. Sign in, and the
same "What accounts does customer cust-1 have?" prompt that failed with a
bare `401` in step 6 now succeeds — this time carrying the access token
Asgardeo issued to the browser session as a `Bearer` header on every
`/chat` call (see
[`src/lib/streamChat.js`](webclient-support/src/lib/streamChat.js)).

### Part A — what changed and what didn't

| | Before Part A | After |
|---|---|---|
| Agent code | Unmodified | Unmodified |
| Who can call `/chat` | Anyone | Only a caller with a valid Asgardeo-issued token |
| Where that's enforced | Nowhere | Agent Manager's gateway, via the key manager |
| Web client | No identity | Signs in via Asgardeo, forwards the token |

Part A only proves a caller is *authenticated* — it says nothing about
what a given *agent* is allowed to do once its own AgentID makes an MCP
call. That's Part B.

## Part B — AgentID: per-agent, per-tool access control

Module 02 connected both agents to the MCP server through Agent
Manager's gateway, secured with one shared API key — nothing there stops
an agent from calling a tool it has no business calling. The Customer
Support Agent can still steer itself into `open_account` or
`transfer_money` on the same Accounts MCP server the Account Assistant
uses. This part closes that gap: each agent gets its own **AgentID**
identity, and Agent Manager's MCP gateway enforces a per-agent, per-tool
policy in front of the same unmodified MCP server — replacing the shared
API key from Module 02 with per-agent client-credentials.

### Prerequisites

- Part A done for the Customer Support Agent (deployed as a
  Platform-Hosted Agent).
- The Account Assistant Agent also deployed as a Platform-Hosted Agent —
  same pattern as step 3 above, pointing at
  [`agents/account_assistant`](../agents/account_assistant).
- The [`webclient`](../webclient) side-by-side console, used for the live
  demo below:

  ```bash
  cd webclient
  npm install
  cp .env.example .env   # optional — set default agent URLs, see below
  npm run dev
  # → http://localhost:5173
  ```

  It has one view: Customer Support and Account Assistant side by side,
  a single input that sends the same prompt to both, and a URL field per
  pane (defaulting to `:8000` and `:8002`, or to
  `VITE_CUSTOMER_SUPPORT_URL` / `VITE_ACCOUNT_ASSISTANT_URL` from `.env`
  if set — see `webclient/.env.example`) with a live health chip that
  reads each agent's `mcp_governed` flag off `/health`.

  **If an agent is deployed as a Platform-Hosted Agent** rather than run
  locally, either set its Agent Manager endpoint in `.env` before
  starting the dev server, or paste it into the matching URL field on the
  page and blur it to trigger a health check — both are live-editable
  regardless of the `.env` default. Same applies to the `curl` fallback
  commands below — swap `http://localhost:8000` / `:8002` for the
  deployed endpoint.

### Step 1 — Side-by-side: the gap, live

With both agents still on Module 02's shared API key, open the web
client and send the same risky prompt to both panes at once — either the
shared input or the pre-built chips:

> "Please open a new savings account for customer cust-2."

Both panes show it succeeding. Neither agent's identity is
distinguishable to the MCP server — they're both using the same key.

<details>
<summary>Or via curl</summary>

```bash
# Customer Support Agent (port 8000) reaching into account actions
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Please open a new savings account for customer cust-2.", "session_id": "gap-1"}'

# Account Assistant Agent (port 8002) — same MCP server, no restriction either way
curl -X POST http://localhost:8002/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is the status of the loan application for customer cust-2?", "session_id": "gap-2"}'
```

</details>

### Step 2 — Find each agent's AgentID

1. In Agent Manager, open the Customer Support Agent's page and note its
   **Agent ID**.
2. Do the same for the Account Assistant Agent.

These identifiers are what tool policy gets attached to in step 5 — not
the agent's display name.

### Step 3 — Change the MCP server's authentication to OAuth2

1. Go to **organization level** → **MCP Servers** → open the server
   registered in Module 02.
2. Change the authentication type from **API Key** to **OAuth2**. This
   is what makes per-AgentID policy possible — a shared key can't carry
   per-agent identity, an OAuth2 client-credentials grant can.

### Step 4 — Create scopes for each tool

For each tool the Accounts MCP server exposes, create a scope:

| Tool | Scope |
|---|---|
| `list_accounts` | `accounts:read` |
| `check_balance` | `accounts:read` |
| `get_loan_status` | `loans:read` |
| `open_account` | `accounts:write` |
| `transfer_money` | `accounts:write` |

Grouping read-only account lookups under one scope and the two
money-moving/account-creating actions under another is enough to
demonstrate the split; add finer-grained scopes if your policy needs to
separate them further.

### Step 5 — Create AgentID roles

1. Go to **organization level** → **Agent ID**.
2. Create two roles:
   - **customer-support-role** — scoped to `accounts:read` and
     `loans:read` only.
   - **account-assistant-role** — scoped to `accounts:read` and
     `accounts:write`.
3. Assign **customer-support-role** to the Customer Support Agent's
   AgentID (from step 2), and **account-assistant-role** to the Account
   Assistant's.

### Step 6 — Switch each agent from the shared API key to its own AgentID

With the MCP server now on OAuth2 (step 3) and each agent's AgentID
assigned a role (step 5), Agent Manager automatically swaps what it
injects into each deployed agent: `MCP_GATEWAY_API_KEY` is withdrawn and
replaced with that agent's own `AMP_AGENTID_CLIENT_ID` /
`AMP_AGENTID_CLIENT_SECRET` / `AMP_AGENTID_TOKEN_ENDPOINT` /
`AMP_AGENTID_SCOPES` — `MCP_GATEWAY_URL` stays the same. No redeploy, no
manual step beyond steps 3 and 5 above; each agent gets its **own**
client-credentials, matching the AgentID it was just assigned a role
under.

Locally (outside Agent Manager), the equivalent is editing each agent's
`.env` by hand — don't share one agent's `.env` with the other:

```bash
cd agents/customer_support
# in .env: remove MCP_GATEWAY_API_KEY, fill in this agent's own
# AMP_AGENTID_CLIENT_ID / AMP_AGENTID_CLIENT_SECRET /
# AMP_AGENTID_TOKEN_ENDPOINT / AMP_AGENTID_SCOPES (MCP_GATEWAY_URL stays
# the same as Module 02)
python main.py                                    # http://localhost:8000

cd ../account_assistant
# same fields in .env, but the Account Assistant's OWN client_id/secret
PORT=8002 python main.py                          # http://localhost:8002
```

At startup each agent mints its own access token via client-credentials
grant, scoped to `MCP_GATEWAY_URL` (RFC 8707 `resource` parameter), and
uses it as a Bearer token on every MCP call — see `_build_mcp_client()` /
`_mint_agentid_token()` in each agent's `agent.py`: with
`MCP_GATEWAY_API_KEY` unset, the agent falls through to minting an
AgentID token instead of sending a static `x-api-key` header.

### Step 7 — Demo the side-by-side, governed

Back in the web client (refresh the health chips first — they should
still read `mcp governed` on both panes, now via AgentID instead of the
shared key), send the exact same prompt from step 1 to both agents
again:

> "Please open a new savings account for customer cust-2."

This time the two panes diverge: Account Assistant still succeeds,
Customer Support is denied. That divergence is the demo — the identical
prompt that succeeded on both panes in step 1 is now denied on one of
them, purely because the Customer Support Agent's AgentID role has no
`accounts:write` scope. No code change in either agent between step 1
and here, only which env vars are set.

<details>
<summary>Or via curl</summary>

```bash
# Customer Support Agent — in-scope, still works
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is the status of the loan application for customer cust-2?", "session_id": "amp-1"}'

# Customer Support Agent — out-of-scope, now denied
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Please open a new savings account for customer cust-2.", "session_id": "amp-2"}'

# Account Assistant Agent — in-scope, still works
curl -X POST http://localhost:8002/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Open a new checking account for customer cust-1.", "session_id": "amp-3"}'
```

</details>

### Part B — what changed and what didn't

| | Before Part B (Module 02) | After |
|---|---|---|
| Agent code | Unmodified | Unmodified |
| MCP auth | One shared API key, no per-agent identity | Per-agent AgentID client-credentials, Bearer-authenticated |
| Tool access | Any agent, any tool | Per-AgentID role, per-tool scope |
| Customer Support calling `open_account`/`transfer_money` | Succeeds | Denied |

## What this module covers end to end

| | Part A (OAuth2) | Part B (AgentID/MCP) |
|---|---|---|
| Identity belongs to | The human/caller signed in via Asgardeo | Each deployed agent itself |
| Enforced on | The agent's own `/chat` endpoint | The MCP gateway's tool calls |
| Denies | Unauthenticated callers | Out-of-scope tool calls, per agent |

Together, Modules 01–03 cover what the model says and costs, connecting
to tools through a gateway, who can call an agent, and which tools that
agent is allowed to use once it's calling them.

## Going further

- `_mint_agentid_token()` / `_build_mcp_client()` in each agent's
  `agent.py` — where the AgentID token is minted and attached, and where
  the direct-vs-gateway mode switch lives.
- See the [repo README's "Notes / things to verify" section](../README.md#notes--things-to-verify-against-your-agent-manager-instance)
  for caveats on this policy path (denial error shape, what was and
  wasn't confirmed against a live gateway at last test).

---

Previous: [Module 02 — MCP Tool Governance](../02-mcp-tool-governance/README.md) ·
Next: [Module 04 — Agent Catalog](../04-agent-catalog/README.md)
