"""Broker command handlers. WebSocket stubs return success so bridge doesn't break."""
from __future__ import annotations

from typing import Any


def _stub(name: str):
    def _handler(args: dict[str, Any]) -> dict[str, Any]:
        return {"status": "not_implemented_yet", "command": name, "message": "Broker integration not yet implemented."}
    return _handler


# WebSocket: return success so frontend doesn't throw (no real stream until backend implements WS)
def _ws_set_config(args: dict[str, Any]) -> dict[str, Any]:
    return {"success": True}


def _ws_connect(args: dict[str, Any]) -> dict[str, Any]:
    return {"connected": True, "provider": args.get("provider", "")}


def _ws_disconnect(args: dict[str, Any]) -> dict[str, Any]:
    return {"disconnected": True}


def _ws_reconnect(args: dict[str, Any]) -> dict[str, Any]:
    return {"connected": True}


def _ws_subscribe(args: dict[str, Any]) -> dict[str, Any]:
    return {"subscribed": True, "provider": args.get("provider", ""), "symbol": args.get("symbol", ""), "channel": args.get("channel", "")}


def _ws_unsubscribe(args: dict[str, Any]) -> dict[str, Any]:
    return {"unsubscribed": True}


def _ws_get_metrics(args: dict[str, Any]) -> dict[str, Any]:
    return {"provider": args.get("provider", ""), "subscribed": 0, "messages_received": 0}


def _ws_get_all_metrics(args: dict[str, Any]) -> dict[str, Any]:
    return {"providers": {}}


WS_HANDLERS = {
    "ws_set_config": _ws_set_config,
    "ws_connect": _ws_connect,
    "ws_disconnect": _ws_disconnect,
    "ws_reconnect": _ws_reconnect,
    "ws_subscribe": _ws_subscribe,
    "ws_unsubscribe": _ws_unsubscribe,
    "ws_get_metrics": _ws_get_metrics,
    "ws_get_all_metrics": _ws_get_all_metrics,
}

# Other broker commands (stubs; ws_* are in WS_HANDLERS above)
BROKER_COMMANDS = [
    "angelone_ws_connect",
    "angelone_ws_disconnect",
    "angelone_ws_subscribe",
    "angelone_ws_unsubscribe",
    "angelone_download_master_contract",
    "zerodha_ws_connect",
    "zerodha_ws_disconnect",
    "zerodha_ws_subscribe",
    "zerodha_ws_unsubscribe",
    "alpaca_ws_connect",
    "alpaca_ws_disconnect",
    "alpaca_ws_subscribe",
    "alpaca_ws_unsubscribe",
    "aliceblue_ws_connect",
    "aliceblue_ws_disconnect",
    "aliceblue_ws_subscribe",
    "aliceblue_ws_unsubscribe",
    "dhan_ws_connect",
    "dhan_ws_disconnect",
    "dhan_ws_subscribe",
    "dhan_ws_unsubscribe",
    "fyers_ws_connect",
    "fyers_ws_disconnect",
    "fyers_ws_subscribe",
    "fyers_ws_unsubscribe",
    "upstox_ws_connect",
    "upstox_ws_disconnect",
    "upstox_ws_subscribe",
    "upstox_ws_unsubscribe",
]


def get_broker_handlers() -> dict[str, Any]:
    out = dict(WS_HANDLERS)
    out.update({name: _stub(name) for name in BROKER_COMMANDS})
    return out
