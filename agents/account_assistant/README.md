# Account Assistant Agent

FastAPI + LangGraph agent exposing `POST /chat`. Intended scope: open
accounts, transfer money, check balances.

Both its LLM connection and its MCP connection are two-mode, switched
purely by which env vars are set — no code change, no separate build per
mode:

| | Direct / BYO mode | Gateway mode (API Key) | Gateway mode (AgentID) |
|---|---|---|---|
| LLM | `OPENAI_API_KEY` set, `LLM_GATEWAY_BASE_URL` unset — calls OpenAI directly | `LLM_GATEWAY_BASE_URL` set — routed through Agent Manager's LLM gateway | same |
| MCP | `MCP_SERVER_URL` set, `MCP_GATEWAY_URL` unset — calls the Accounts MCP server directly | `MCP_GATEWAY_URL` + `MCP_GATEWAY_API_KEY` set — routed through Agent Manager's MCP gateway as an `x-api-key` header, no per-agent policy | `MCP_GATEWAY_URL` set, `AMP_AGENTID_CLIENT_ID`/`SECRET`/etc. set, `MCP_GATEWAY_API_KEY` unset — routed through the gateway, authenticated with this agent's own AgentID client-credentials as a Bearer token, subject to per-agent tool policy |

Once tool policy is configured on the AgentID this agent authenticates
with (see [Module 03, Part B](../../03-agentid-and-oauth2/README.md)),
this identity is expected to be **permitted** for `open_account` /
`transfer_money` / `check_balance`, unlike the Customer Support Agent's.

## Env vars

| Var | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | If `LLM_GATEWAY_BASE_URL` is unset | Direct OpenAI key (BYO mode). |
| `LLM_GATEWAY_BASE_URL` | To enable LLM governed mode | Agent Manager LLM gateway base URL. |
| `LLM_GATEWAY_API_KEY` | If `LLM_GATEWAY_BASE_URL` is set | Sent as an `API-Key` header (not `Authorization: Bearer`) — see `_build_llm()` in `agent.py`. |
| `LLM_MODEL` | No (default `gpt-4o-mini`) | Model name passed to the LLM gateway/OpenAI. |
| `MCP_SERVER_URL` | If `MCP_GATEWAY_URL` is unset | Accounts MCP server URL, called directly. |
| `MCP_GATEWAY_URL` | To enable MCP gateway mode | The Accounts MCP server's URL as fronted by Agent Manager's MCP gateway. Set at initial registration; enables the auth flow below. |
| `MCP_GATEWAY_API_KEY` | If `MCP_GATEWAY_URL` is set and using the shared API-Key scheme (Module 02) | Sent directly as an `x-api-key` header on every MCP call — note this is a different header name than `LLM_GATEWAY_API_KEY`'s `API-Key`. No AgentID minting, no per-agent identity. |
| `AMP_AGENTID_CLIENT_ID` | If `MCP_GATEWAY_URL` is set and using AgentID (Module 03), `MCP_GATEWAY_API_KEY` unset | This agent's own AgentID OAuth2 client ID (client-credentials grant). |
| `AMP_AGENTID_CLIENT_SECRET` | If `MCP_GATEWAY_URL` is set and using AgentID | This agent's own AgentID client secret. |
| `AMP_AGENTID_TOKEN_ENDPOINT` | If `MCP_GATEWAY_URL` is set and using AgentID | Token endpoint used to mint the client-credentials access token at startup. |
| `AMP_AGENTID_SCOPES` | If `MCP_GATEWAY_URL` is set and using AgentID | Scopes requested on the token — must match this agent's AgentID role. |
| `PORT` | No (default `8000`) | Port for the `/chat` FastAPI service. Override to run alongside Customer Support locally, e.g. `PORT=8002`. |

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env
# direct mode: fill in OPENAI_API_KEY and MCP_SERVER_URL
# governed mode: also fill in LLM_GATEWAY_*/MCP_GATEWAY_URL/MCP_GATEWAY_API_KEY
# or AMP_AGENTID_* (see .env.example)
PORT=8002 python main.py
# → http://localhost:8002
```

Requires the Accounts MCP server running first (see the
[repo README](../../README.md)).

## Deploy to Agent Manager

| Field | Value |
|---|---|
| Display Name | `Account Assistant Agent` |
| Agent Interface | `Chat Agent` (`POST /chat`, port 8000) |
| Project Path | `/agents/account_assistant` |
| Language | `Python` |
| Language Version | `3.11` |
| Start Command | `python main.py` |

Steps:

1. **Add Agent → Platform-Hosted Agent**, fill the form above.
2. Configure env vars. At initial registration ([Module 01](../../01-llm-governance/README.md)):
   only `OPENAI_API_KEY` (secret) and `MCP_SERVER_URL` need to be provided
   manually — `PORT=8000` is also required. `LLM_GATEWAY_*` is injected
   by Agent Manager once the agent is bound to an LLM provider.
3. For [Module 02](../../02-mcp-tool-governance/README.md)'s gateway
   flow: bind the agent to the org-level MCP server registered with
   **API Key** security — no AgentID yet, every agent uses the same key.
   `MCP_GATEWAY_URL` and `MCP_GATEWAY_API_KEY` are then injected by Agent
   Manager, no manual env var entry needed.
4. For [Module 03, Part B](../../03-agentid-and-oauth2/README.md)'s
   AgentID flow: change that MCP server's security scheme to **OAuth2**,
   then look up this agent's **Agent ID** in the console and assign it a
   role scoped to `accounts:read` / `accounts:write`. Agent Manager then
   injects `MCP_GATEWAY_URL` and `AMP_AGENTID_CLIENT_*` in place of the
   API key.
5. For [Module 03, Part A](../../03-agentid-and-oauth2/README.md)'s
   OAuth2 flow: select **OAuth2** as the agent's security scheme and pick
   the registered Asgardeo key manager — no env var change needed.
6. Deploy.
