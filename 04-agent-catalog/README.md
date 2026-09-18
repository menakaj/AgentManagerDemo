# Module 04 — Agent Catalog: publish once, configure per instance

**Duration:** 15 min

Modules 01–03 governed one deployed Customer Support Agent — its model
calls, its tool access, and who can call it. This module
is about what happens when a second team wants an agent just like it —
same code, different configuration. Agent Manager's **Agent Catalog**
lets you publish a deployed agent as a reusable, versioned **Agent
Kind**, then create new agents from it — inheriting the build, not the
environment.

The takeaway: the *code* is reused exactly as built and deployed in
Module 03; the *configuration* is not — each agent created from the kind
gets its own LLM providers, MCP servers, environment variables, and
secrets, set independently.

## Prerequisites

- Modules 01–03 done: Customer Support Agent deployed as a
  Platform-Hosted Agent, LLM-governed, MCP-governed via its own AgentID,
  and OAuth2-protected.

## Step 1 — Publish the Customer Support Agent as a Kind

1. Open the Customer Support Agent, and go to **Publish** in the left
   nav (under **Agent Lifecycle**, alongside Configure/Build/Deploy/Try
   It).
2. Publish its current build as the first version of a new Agent Kind.
   This captures the build — the resulting image/artifact — not a live
   copy of the running instance's env vars or secrets.
3. Once published, the Publish page lists every version of this kind in
   a table: **Version** (e.g. `1.1.0`, tagged **Latest**), **Release
   Date**, and **Build Name** (e.g. `test-1789586491748` — the actual
   build this version points at). From here you can:
   - **Edit Kind** — update the kind's own metadata.
   - **Create Version** — publish the agent's current build as a new,
     additional version of the same kind (so the kind accumulates a
     version history, not just a single snapshot).
   - **Unpublish Kind** — a destructive action that removes the kind and
     *all* its versions from the catalog. This does not affect agents
     already created from it.

## Step 2 — Create a new agent from the Kind

1. From **Agents**, start **Add a New Agent**. The very first choice is
   **Externally-Hosted Agent** vs. **Platform-Hosted Agent** — pick
   **Platform-Hosted Agent**, same as in Module 03.
2. On **Create a Platform-Hosted Agent**, pick a source type:
   - **Source Code** — provide agent source from a project repository
     (the path every prior module has used).
   - **Agent Catalog** — pick an Agent Kind from the Agent Catalog. Pick
     this one.
3. **Select an Agent Kind** shows the catalog as cards — name, latest
   version, last-updated time. Pick the kind published in Step 1.
4. On **Create a "\<kind-name\>" Agent**, fill in:
   - **Agent Details** — Name (e.g. `Account Assistant Agent`),
     optional description (Markdown supported), optional Labels.
   - **Agent Kind Version** — a dropdown to pick which published version
     of the kind to deploy from (defaults to latest).
   - **Tracing - Instrumentation** — *Enable auto instrumentation* is on
     by default, adding OTEL tracing automatically. Turn it off only if
     the kind's own code is already instrumented, to avoid duplicate
     traces. Configurable again per environment at deploy time.
   - **LLM Providers (Optional)** — bind this instance to an LLM
     provider here, independent of whatever the original agent used.
   - **MCP Servers (Optional)** — same independence for MCP: this new
     agent's tool access starts from nothing and is configured fresh,
     exactly as in [Module 02](../02-mcp-tool-governance/README.md)
     (gateway connectivity) and
     [Module 03, Part B](../03-agentid-and-oauth2/README.md) (per-tool
     AgentID policy).
   - **Environment Variables** — key/value pairs, each with its own
     **Mark as Secret** checkbox. Nothing here is pre-populated from the
     original agent's `.env` — set `OPENAI_API_KEY`, `MCP_SERVER_URL` /
     `MCP_GATEWAY_URL`, `AMP_AGENTID_*`, etc. independently, per
     [Module 01](../01-llm-governance/README.md)–[03](../03-agentid-and-oauth2/README.md)'s
     env var tables.
   - **File Mounts (Optional)** — mount files into the instance if the
     kind's code expects any.
5. **Deploy.**

## Step 3 — Confirm code is shared, config isn't

- Both agents now run the identical build published in Step 1 — a
  **Create Version** republish of the kind, plus a redeploy of each
  instance from the new version, is how a code change reaches both.
- **Each agent created from the kind gets its own Agent ID** — the
  identity isn't shared with, or derived from, the kind or the original
  agent it was published from. Confirm this in **Security → Agent ID**
  for the new instance: it's a distinct identity from the Customer
  Support Agent's, with no tool-policy role attached yet. That's exactly
  the identity Module 03, Part B keys per-agent tool access on, so this
  new agent starts with **no MCP tool access at all** until you walk it
  through that part again — registering its Agent ID, creating or
  reusing scopes, and assigning it a role.
- Give the new instance a different LLM provider, MCP server, or
  AgentID role than the original (or leave it unconfigured while the
  original stays governed), then call both agents' `/chat` endpoints
  with the same prompt. Responses, tool access, and Module 01's prompt
  decorators differ per instance — entirely from configuration set in
  Step 2 plus whichever AgentID role you give this new identity, on top
  of the same shared code.

## What changed and what didn't

| | Agent Kind (catalog entry) | Each agent created from it |
|---|---|---|
| Build / source | Fixed per version, published from Step 1 | Inherited — pick which version to run |
| Tracing instrumentation | Not set | Configurable per agent, and again per environment |
| LLM Providers | Not set | Bound independently per agent |
| MCP Servers | Not set | Bound independently per agent |
| Environment variables / secrets | Not set | Entered fresh per agent — nothing carries over |
| AgentID identity, tool-policy role (Module 03, Part B) | N/A — not part of the kind | Its own, independent Agent ID — never shared with or derived from the kind or the source agent. No role/scope until you assign one. |
| Prompt decorators, PII masking, rate limits (Module 01) | N/A — not part of the kind | Attached per deployed agent, independently |

## Going further

- **Create Version** lets a kind evolve independently of any agent
  created from it — existing agents stay on whatever version they were
  deployed with until someone explicitly redeploys them onto a newer
  one.
- **Unpublish Kind** removes the catalog entry and its version history,
  not the agents already running from it — worth calling out live, since
  it's easy to assume otherwise.

---

Previous: [Module 03 — AgentID and OAuth2](../03-agentid-and-oauth2/README.md)
