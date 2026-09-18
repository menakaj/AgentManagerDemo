"""Account Assistant Agent: open accounts, transfer money, check balances.

FastAPI service exposing POST /chat.

LLM and MCP each have two modes, switched purely by which env vars are
set — no code change, no separate "stage" build:

- LLM: direct OpenAI (OPENAI_API_KEY) vs. Agent Manager's LLM gateway
  (LLM_GATEWAY_BASE_URL/LLM_GATEWAY_API_KEY). See _build_llm().
- MCP: direct, ungoverned connection (MCP_SERVER_URL) vs. Agent Manager's
  MCP gateway, in one of two auth modes: a shared API Key
  (MCP_GATEWAY_URL + MCP_GATEWAY_API_KEY, no per-agent identity) or this
  agent's own AgentID client-credentials (MCP_GATEWAY_URL + AMP_AGENTID_*,
  per-agent tool policy). See _build_mcp_client(). AgentID gateway mode
  lets Agent Manager enforce per-agent tool policy server-side — this
  agent's identity is expected to be permitted for open_account/
  transfer_money/check_balance, unlike the Customer Support Agent's.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel

from system_prompt import SYSTEM_PROMPT

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("account-assistant-agent")

LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")

SESSIONS: dict[str, list[BaseMessage]] = {}


def _build_llm() -> ChatOpenAI:
    """Build a ChatOpenAI client.

    Local verification mode: if LLM_GATEWAY_BASE_URL is unset, call OpenAI
    directly using OPENAI_API_KEY (standard Authorization: Bearer auth) —
    no Agent Manager involved. Set LLM_GATEWAY_BASE_URL to switch back to
    gateway mode.

    Gateway mode: the gateway authenticates via an `API-Key` header, not
    `Authorization: Bearer`. The openai SDK sets `Authorization` from
    `api_key` by default and does not stop just because `API-Key` is also
    present in `default_headers`, so `Authorization` must be blanked
    explicitly. The SDK also rejects an empty `api_key` as "missing
    credentials" before `default_headers` ever applies, hence the
    non-empty sentinel value.
    """
    gateway_base_url = os.environ.get("LLM_GATEWAY_BASE_URL")
    if not gateway_base_url:
        return ChatOpenAI(model=LLM_MODEL, api_key=os.environ["OPENAI_API_KEY"])

    gateway_key = os.environ["LLM_GATEWAY_API_KEY"]
    return ChatOpenAI(
        model=LLM_MODEL,
        base_url=gateway_base_url,
        api_key="unused",
        default_headers={"API-Key": gateway_key, "Authorization": ""},
    )


def _mint_agentid_token(mcp_gateway_url: str) -> str:
    """Mint an AgentID access token via OAuth 2.0 client-credentials, scoped
    to this specific MCP server via the `resource` parameter (RFC 8707) -
    the tool's URL is the resource, so it must be known before minting the
    token, not just before calling the tool. This agent has its own
    AMP_AGENTID_CLIENT_ID/SECRET, so it mints its own token and Agent
    Manager enforces tool policy per that identity, not per a shared secret.

    DEV BYPASS: if AMP_AGENTID_STATIC_TOKEN is set, skip minting entirely
    and use that token as-is. For environments that can't reach the token
    endpoint's network (it sits behind restrictions a plain client_credentials
    call can't get past) - mint the token elsewhere and drop it in here. The
    token is short-lived (~1hr); re-mint and update the env var when it
    expires. Never rely on this path outside local/dev testing.
    """
    static_token = os.environ.get("AMP_AGENTID_STATIC_TOKEN")
    if static_token:
        log.warning("_mint_agentid_token: using AMP_AGENTID_STATIC_TOKEN dev bypass, not minting a fresh token")
        return static_token

    client_id = os.environ["AMP_AGENTID_CLIENT_ID"]
    client_secret = os.environ["AMP_AGENTID_CLIENT_SECRET"]
    token_endpoint = os.environ["AMP_AGENTID_TOKEN_ENDPOINT"]
    scopes = os.environ.get("AMP_AGENTID_SCOPES")

    data = {"grant_type": "client_credentials", "resource": mcp_gateway_url}
    if scopes:
        data["scope"] = scopes

    token_response = requests.post(
        token_endpoint,
        auth=(client_id, client_secret),
        data=data,
        timeout=30,
    )
    token_response.raise_for_status()
    return token_response.json()["access_token"]


def _build_mcp_client() -> MultiServerMCPClient:
    """Build an MCP client.

    Direct mode: if MCP_GATEWAY_URL is unset, connect straight to
    MCP_SERVER_URL with no authentication - no Agent Manager involved, no
    tool-access policy.

    Gateway mode, API Key: if MCP_GATEWAY_URL and MCP_GATEWAY_API_KEY are
    both set, calls go through Agent Manager's MCP gateway authenticated
    with a shared `API-Key` header - matching the MCP server's default
    API Key security scheme. No per-agent identity, so no per-agent tool
    policy either - every agent using the same key gets the same access.

    Gateway mode, AgentID: if MCP_GATEWAY_URL is set and
    MCP_GATEWAY_API_KEY is not, calls go through Agent Manager's MCP
    gateway authenticated with this agent's own AgentID client-credentials
    as a Bearer token - see _mint_agentid_token(). This is what lets Agent
    Manager enforce tool policy per this agent's own identity.
    """
    mcp_gateway_url = os.environ.get("MCP_GATEWAY_URL")
    if not mcp_gateway_url:
        return MultiServerMCPClient(
            {
                "accounts": {
                    "url": os.environ["MCP_SERVER_URL"],
                    "transport": "streamable_http",
                }
            }
        )

    api_key = os.environ.get("MCP_GATEWAY_API_KEY")
    headers = (
        {"API-Key": api_key}
        if api_key
        else {"Authorization": f"Bearer {_mint_agentid_token(mcp_gateway_url)}"}
    )
    return MultiServerMCPClient(
        {
            "accounts": {
                "url": mcp_gateway_url,
                "transport": "streamable_http",
                "headers": headers,
            }
        }
    )


_agent = None


async def _get_agent():
    global _agent
    if _agent is None:
        client = _build_mcp_client()
        tools = await client.get_tools()
        _agent = create_react_agent(_build_llm(), tools=tools, prompt=SYSTEM_PROMPT)
    return _agent


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _get_agent()
    log.info("READY %s", _ready_payload())
    yield


app = FastAPI(title="ACME Bank Account Assistant Agent", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    session_id: str
    context: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    response: str


def _ready_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "model": LLM_MODEL,
        "llm_governed": bool(os.environ.get("LLM_GATEWAY_BASE_URL")),
        "mcp_governed": bool(os.environ.get("MCP_GATEWAY_URL")),
        "agent": "account_assistant",
        "port": int(os.environ.get("PORT", "8000")),
    }


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "ACME Bank Account Assistant Agent",
        "tip": "POST /chat with {message, session_id, context}. GET /health for status.",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return _ready_payload()


def _final_text(messages: list[BaseMessage]) -> str:
    for msg in reversed(messages):
        if isinstance(msg, AIMessage):
            content = msg.content
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                parts = [
                    block.get("text", "") if isinstance(block, dict) else str(block)
                    for block in content
                ]
                return "".join(parts).strip()
    return ""


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.message.strip():
        return ChatResponse(response="How can I help you today?")

    sid = req.session_id or "_anonymous_"
    history = SESSIONS.get(sid, []) + [HumanMessage(content=req.message)]

    try:
        agent = await _get_agent()
        result = await agent.ainvoke({"messages": history})
        history = result["messages"]
        reply = _final_text(history) or "I'm not sure how to help with that."
    except Exception as e:
        log.exception("session=%s error: %s", sid, e)
        reply = "I'm having trouble reaching our systems. Please try again in a moment."

    SESSIONS[sid] = history
    return ChatResponse(response=reply)
