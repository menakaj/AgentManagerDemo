# Module 01 — LLM Governance: one gateway, many policies

**Duration:** 20 min

Both agents from the [repo README](../README.md) are already running in
direct/BYO mode, each holding its own `OPENAI_API_KEY`. This module puts
governance in front of the *model calls* both agents make — PII masking,
cost-based rate limiting, and per-agent prompt decorators — all
configured on Agent Manager's LLM gateway, with no change to either
agent's code. Both agents in this module are still running in direct MCP
mode (`MCP_GATEWAY_URL` unset) — only the LLM side is governed here.

## Prerequisites

- A running WSO2 Agent Manager instance you can administer at the
  organization level.
- The Customer Support Agent and Account Assistant Agent from
  [`agents/customer_support`](../agents/customer_support) and
  [`agents/account_assistant`](../agents/account_assistant), each
  reachable through Agent Manager — direct mode is fine, see the
  [repo README](../README.md) steps 1–2.

## Step 1 — Register the LLM service provider

1. In the Agent Manager console, go to the organization-level **LLM
   Providers** (or the gateway's provider registration screen).
2. Register your model provider (e.g. OpenAI) with its base URL and API
   key. Every agent that calls this provider through the gateway now goes
   through one policy point, instead of each agent holding its own key.

## Step 2 — Add a PII masking guardrail

1. On the registered LLM provider, add a **PII Masking** guardrail.
2. Configure it to catch the categories relevant to a bank — account
   numbers, national ID numbers, card numbers — so they're masked in
   requests/responses that flow through the gateway, regardless of which
   agent sent them.

## Step 3 — Add cost-based rate limiting

1. On the same provider, add a **cost-based rate limit**. This caps spend
   at the provider level, independent of any per-agent configuration.
2. Set a **per-consumer** cost limit as well, so a single noisy agent
   (or a single compromised session) can't exhaust the whole provider's
   budget — each consumer gets its own ceiling under the provider-wide
   one.

## Step 4 — Register both agents

If not already deployed:

- **Customer Support Agent** — [`agents/customer_support`](../agents/customer_support)
- **Account Assistant Agent** — [`agents/account_assistant`](../agents/account_assistant)

## Step 5 — Point each agent's LLM configuration at the gateway

For each agent, open its LLM configuration in Agent Manager and select
the provider registered in step 1. Both agents now share the same
PII-masking and cost-limit policy from steps 2–3, but each can still
carry its own additional guardrails — that's the point of step 6.

## Step 6 — Prompt decorator guardrail: Account Assistant Agent

The Account Assistant is the one that actually opens accounts, moves
money, and discloses balances, so it gets a compliance-notice decorator
scoped to those actions.

Add a **Prompt Decorator** guardrail on the Account Assistant Agent's LLM
configuration:

- `promptDecoratorConfig` → `messages` → one item only:
  - **Role:** `system`
  - **Content:**

    ```
    If your response involves opening an account, transferring funds, or
    disclosing a specific account balance, append exactly one line at the
    very end of your entire response: "This action is logged and subject
    to ACME Bank's compliance and audit policy." Do not add this line for
    general questions that don't involve those actions. Do not add it
    more than once.
    ```

## Step 7 — Prompt decorator guardrail: Customer Support Agent

The Customer Support Agent is the one that checks loan application
status, so its decorator is scoped to loan data instead:

- **Role:** `system`
- **Content:**

  ```
  If your response involves handling loans, append one line at the very
  end of your entire response: "Your loan data is accessed." Do not add
  this line for general questions that don't involve those actions. Do
  not add it more than once.
  ```

## Step 8 — Invoke both agents and see the difference

```bash
# Customer Support Agent — loan question, expect the loan-access line appended
curl -N -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is the status of the loan application for customer cust-2?", "session_id": "gov-1"}'

# Customer Support Agent — general question, expect no appended line
curl -N -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What accounts does customer cust-1 have?", "session_id": "gov-2"}'

# Account Assistant Agent — transfer, expect the compliance-notice line appended
curl -N -X POST http://localhost:8002/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Transfer $100 from acc-1001 to acc-2001.", "session_id": "gov-3"}'
```

Neither agent's code changed between steps 4 and 8 — the two different
closing lines, and the fact that only certain replies get one at all, are
entirely a function of which prompt decorator is attached to which
agent's LLM configuration at the gateway.

## What changed and what didn't

| | Before this module | After |
|---|---|---|
| Agent code | Unmodified | Unmodified |
| PII in prompts/responses | Unmasked | Masked at the gateway, for every agent on this provider |
| Spend | Unbounded | Capped provider-wide and per-consumer |
| Compliance notices | None | Appended automatically, per-agent, only when relevant |

This governs what the *model* says and costs. It says nothing yet about
which *tools* an agent is allowed to call — a Customer Support Agent
steered into asking for a transfer still reaches the same MCP server as
the Account Assistant. That's module 02.

---

Next: [Module 02 — MCP Tool Governance](../02-mcp-tool-governance/README.md)
