"""Accounts MCP server for the ACME Bank demo.

In-memory only. No auth/access-control here by design — in this demo,
governance (who may call which tool) is enforced by WSO2 Agent Manager's
MCP gateway sitting in front of this server (Stage 2), not by the server
itself. Stage 1 talks to this server directly, so every tool is reachable
by every caller.
"""

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("accounts-mcp", host="0.0.0.0", port=8001)

# ---- in-memory data ----

customers = {
    "cust-1": {"name": "Alice Perera"},
    "cust-2": {"name": "Ravi Kumar"},
}

accounts = {
    "acc-1001": {"customer_id": "cust-1", "type": "checking", "balance": 2500.00},
    "acc-1002": {"customer_id": "cust-1", "type": "savings", "balance": 10800.50},
    "acc-2001": {"customer_id": "cust-2", "type": "checking", "balance": 640.25},
}

loan_applications = {
    "cust-1": {"loan_id": "loan-501", "status": "APPROVED", "amount": 15000.00},
    "cust-2": {"loan_id": "loan-502", "status": "PENDING_REVIEW", "amount": 5000.00},
}

_next_account_seq = 3001


@mcp.tool()
def check_balance(account_id: str) -> dict:
    """Check the current balance of a bank account by its account_id."""
    account = accounts.get(account_id)
    if account is None:
        return {"error": f"account {account_id} not found"}
    return {"account_id": account_id, "balance": account["balance"], "type": account["type"]}


@mcp.tool()
def list_accounts(customer_id: str) -> list:
    """List all accounts belonging to a customer by their customer_id."""
    return [
        {"account_id": acc_id, "type": acc["type"], "balance": acc["balance"]}
        for acc_id, acc in accounts.items()
        if acc["customer_id"] == customer_id
    ]


@mcp.tool()
def open_account(customer_id: str, account_type: str) -> dict:
    """Open a new bank account (e.g. 'checking' or 'savings') for a customer."""
    global _next_account_seq
    if customer_id not in customers:
        return {"error": f"customer {customer_id} not found"}
    account_id = f"acc-{_next_account_seq}"
    _next_account_seq += 1
    accounts[account_id] = {"customer_id": customer_id, "type": account_type, "balance": 0.0}
    return {"account_id": account_id, "customer_id": customer_id, "type": account_type, "balance": 0.0}


@mcp.tool()
def transfer_money(from_account_id: str, to_account_id: str, amount: float) -> dict:
    """Transfer an amount of money from one account to another."""
    from_acc = accounts.get(from_account_id)
    to_acc = accounts.get(to_account_id)
    if from_acc is None or to_acc is None:
        return {"error": "one or both account ids not found"}
    if amount <= 0:
        return {"error": "amount must be positive"}
    if from_acc["balance"] < amount:
        return {"error": "insufficient balance"}
    from_acc["balance"] -= amount
    to_acc["balance"] += amount
    return {
        "from_account_id": from_account_id,
        "to_account_id": to_account_id,
        "amount": amount,
        "from_balance": from_acc["balance"],
        "to_balance": to_acc["balance"],
    }


@mcp.tool()
def get_loan_status(customer_id: str) -> dict:
    """Get the loan application status for a customer."""
    loan = loan_applications.get(customer_id)
    if loan is None:
        return {"error": f"no loan application found for customer {customer_id}"}
    return {"customer_id": customer_id, **loan}


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
