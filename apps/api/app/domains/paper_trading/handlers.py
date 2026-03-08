"""Paper trading command handlers. In-memory defaults so frontend can connect without Rust."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

# In-memory store so pt_create_portfolio / pt_list_portfolios work without DB
_paper_portfolios: dict[str, dict[str, Any]] = {}
_paper_orders: list[dict[str, Any]] = []
_paper_positions: list[dict[str, Any]] = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _pt_list_portfolios(args: dict[str, Any]) -> list[dict[str, Any]]:
    return list(_paper_portfolios.values())


def _pt_create_portfolio(args: dict[str, Any]) -> dict[str, Any]:
    name = args.get("name", "Default Paper Portfolio")
    balance = float(args.get("balance", 1_000_000))
    currency = args.get("currency", "USD")
    leverage = int(args.get("leverage", 1))
    margin_mode = args.get("marginMode") or args.get("margin_mode", "cross")
    fee_rate = float(args.get("feeRate") or args.get("fee_rate", 0.001))
    pid = str(uuid.uuid4())
    now = _now_iso()
    portfolio = {
        "id": pid,
        "name": name,
        "initial_balance": balance,
        "balance": balance,
        "currency": currency,
        "leverage": leverage,
        "margin_mode": margin_mode,
        "fee_rate": fee_rate,
        "created_at": now,
    }
    _paper_portfolios[pid] = portfolio
    return portfolio


def _pt_get_portfolio(args: dict[str, Any]) -> dict[str, Any] | None:
    pid = args.get("id", "")
    return _paper_portfolios.get(pid)


def _pt_delete_portfolio(args: dict[str, Any]) -> None:
    pid = args.get("id", "")
    _paper_portfolios.pop(pid, None)
    _paper_orders[:] = [o for o in _paper_orders if o.get("portfolio_id") != pid]
    _paper_positions[:] = [p for p in _paper_positions if p.get("portfolio_id") != pid]


def _pt_reset_portfolio(args: dict[str, Any]) -> dict[str, Any] | None:
    pid = args.get("id", "")
    p = _paper_portfolios.get(pid)
    if not p:
        return None
    balance = p.get("initial_balance", 1_000_000)
    p["balance"] = balance
    _paper_orders[:] = [o for o in _paper_orders if o.get("portfolio_id") != pid]
    _paper_positions[:] = [p for p in _paper_positions if p.get("portfolio_id") != pid]
    return p


def _pt_get_orders(args: dict[str, Any]) -> list[dict[str, Any]]:
    pid = args.get("portfolioId") or args.get("portfolio_id", "")
    status = args.get("status")
    orders = [o for o in _paper_orders if o.get("portfolio_id") == pid]
    if status:
        orders = [o for o in orders if o.get("status") == status]
    return orders


def _pt_get_positions(args: dict[str, Any]) -> list[dict[str, Any]]:
    pid = args.get("portfolioId") or args.get("portfolio_id", "")
    return [p for p in _paper_positions if p.get("portfolio_id") == pid]


def _pt_place_order(args: dict[str, Any]) -> dict[str, Any]:
    portfolio_id = args.get("portfolioId") or args.get("portfolio_id", "")
    symbol = args.get("symbol", "")
    side = args.get("side", "buy")
    order_type = args.get("orderType") or args.get("order_type", "market")
    quantity = float(args.get("quantity", 0))
    price = args.get("price")
    stop_price = args.get("stopPrice") or args.get("stop_price")
    reduce_only = args.get("reduceOnly") or args.get("reduce_only", False)
    order_id = str(uuid.uuid4())
    now = _now_iso()
    order = {
        "id": order_id,
        "portfolio_id": portfolio_id,
        "symbol": symbol,
        "side": side,
        "order_type": order_type,
        "quantity": quantity,
        "price": price,
        "stop_price": stop_price,
        "filled_qty": 0,
        "avg_price": None,
        "status": "pending",
        "reduce_only": reduce_only,
        "created_at": now,
        "filled_at": None,
    }
    _paper_orders.append(order)
    return order


def _pt_cancel_order(args: dict[str, Any]) -> None:
    oid = args.get("orderId") or args.get("order_id", "")
    for o in _paper_orders:
        if o.get("id") == oid:
            o["status"] = "cancelled"
            break


def _pt_fill_order(args: dict[str, Any]) -> dict[str, Any] | None:
    order_id = args.get("orderId") or args.get("order_id", "")
    fill_price = float(args.get("fillPrice") or args.get("fill_price", 0))
    fill_qty = args.get("fillQty") or args.get("fill_qty")
    for o in _paper_orders:
        if o.get("id") == order_id:
            qty = float(fill_qty if fill_qty is not None else o.get("quantity", 0))
            o["filled_qty"] = qty
            o["avg_price"] = fill_price
            o["status"] = "filled"
            o["filled_at"] = _now_iso()
            return o
    return None


def _pt_get_stats(args: dict[str, Any]) -> dict[str, Any]:
    return {
        "total_pnl": 0,
        "win_rate": 0,
        "total_trades": 0,
        "winning_trades": 0,
        "losing_trades": 0,
        "largest_win": 0,
        "largest_loss": 0,
    }


def get_paper_trading_handlers() -> dict[str, Any]:
    return {
        "pt_list_portfolios": _pt_list_portfolios,
        "pt_create_portfolio": _pt_create_portfolio,
        "pt_get_portfolio": _pt_get_portfolio,
        "pt_delete_portfolio": _pt_delete_portfolio,
        "pt_reset_portfolio": _pt_reset_portfolio,
        "pt_get_orders": _pt_get_orders,
        "pt_get_positions": _pt_get_positions,
        "pt_place_order": _pt_place_order,
        "pt_cancel_order": _pt_cancel_order,
        "pt_fill_order": _pt_fill_order,
        "pt_get_stats": _pt_get_stats,
    }
