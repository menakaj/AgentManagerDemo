# Demo Script

Each agent exposes `POST /chat` with body `{"message": "...", "session_id": "..."}`,
responding `{"response": "..."}`. Use a consistent `session_id` per
conversation to preserve context across turns. `cust-1` = Alice Perera
(accounts `acc-1001`, `acc-1002`), `cust-2` = Ravi Kumar (account `acc-2001`).

Every agent defaults to `PORT=8000` (each runs in its own container/process
in a real deployment, so a uniform default is fine). Run one agent at a
time locally against that port, or override `PORT` for a second one if you
need two running side by side (see README).

Example request (Customer Support Agent running on port 8000):

```bash
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What accounts does customer cust-1 have?", "session_id": "demo-1"}'
```

For every prompt below, POST it as the `message` field to whichever
agent's `/chat` endpoint is currently running.

## Direct mode - direct MCP, no tool access control

`MCP_GATEWAY_URL` unset — each agent connects straight to the Accounts
MCP server (see the [repo README](README.md)).

### Customer Support Agent (in-scope)

1. "What accounts does customer cust-1 have?"
2. "What's the balance on account acc-1001?"
3. "What's the status of the loan application for customer cust-2?"
4. "Can you give me a summary of Alice Perera's accounts and her loan status?"

### Customer Support Agent (out-of-scope - demonstrates the gap)

5. "Please open a new savings account for customer cust-2."
   - **Expected in direct mode: this succeeds** - nothing stops the
     Customer Support Agent from calling `open_account`, even though
     it's outside its intended role.
6. "Transfer $100 from acc-1001 to acc-2001."
   - **Expected in direct mode: this also succeeds.**

### Account Assistant Agent (in-scope)

1. "Open a new checking account for customer cust-1."
2. "Transfer $200 from acc-1002 to acc-1001."
3. "What's the balance on acc-2001?"

## Gateway mode (API Key) - MCP via Agent Manager, no tool access control

`MCP_GATEWAY_URL` set on each agent, both using the same
`MCP_GATEWAY_API_KEY` (see [Module 02](02-mcp-tool-governance/README.md)).
Calls now go through Agent Manager, but there's still no per-agent
policy — prompts 5 and 6 above still succeed here too, since neither
agent has its own identity yet.

## Governed mode (AgentID) - per-agent, per-tool access control

`MCP_GATEWAY_URL` set on each agent, each with its own AgentID
client-credentials instead of the shared API key (see
[Module 03, Part B](03-agentid-and-oauth2/README.md)).

### Customer Support Agent (in-scope - still works)

1. "What accounts does customer cust-1 have?"
2. "What's the loan status for customer cust-2?"

### Customer Support Agent (out-of-scope - now blocked)

3. "Please open a new savings account for customer cust-2."
   - **Expected in governed mode: this is denied** by Agent Manager's
     MCP gateway policy - narrate that the same prompt that worked in
     direct mode is now blocked purely by governance, with no code
     change in the agent itself.
4. "Transfer $100 from acc-1001 to acc-2001."
   - **Expected: denied.**

### Account Assistant Agent (in-scope - still works)

5. "Open a new checking account for customer cust-1."
6. "Transfer $50 from acc-1002 to acc-1001."
   - **Expected: both succeed** - this agent's token is authorized for
     these tools.
