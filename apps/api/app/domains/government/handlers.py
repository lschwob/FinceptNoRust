"""Government / economic data command handlers. Run legacy Python scripts via PythonExecutionService."""
from __future__ import annotations

import json
from typing import Any

from app.core.errors import ApiError
from app.services.python_execution import PythonExecutionService

python_execution = PythonExecutionService()

# Script name (under legacy_scripts_root) for each bridge command
_GOV_SCRIPT_MAP = {
    "execute_government_us_command": "government_us_data.py",
    "execute_canada_gov_command": "canada_gov_api.py",
    "execute_french_gov_command": "french_gov_api.py",
    "execute_swiss_gov_command": "swiss_gov_api.py",
    "execute_spain_data_command": "spain_data.py",
    "execute_pxweb_command": "pxweb_fetcher.py",
    "execute_openafrica_command": "openafrica_api.py",
    "execute_data_gov_hk_command": "data_gov_hk_api.py",
    "execute_congress_gov_command": "congress_gov_data.py",
    "execute_wto_command": "wto_data.py",
}


def _run_gov_script(script_name: str, command: str, args: list[str] | None) -> dict[str, Any] | list[Any]:
    """Run a government legacy script with command + args; return parsed JSON or error dict."""
    args = args if args is not None else []
    script_args = [command] + [str(a) for a in args]
    try:
        return python_execution.execute_json(script_path=script_name, args=script_args)
    except ApiError as e:
        # If script printed JSON to stdout before exiting non-zero, return that for better UX
        stdout = (e.details or {}).get("stdout") or ""
        if stdout and stdout.strip():
            try:
                parsed = json.loads(stdout)
                if isinstance(parsed, dict) and ("success" in parsed or "error" in parsed):
                    return parsed
            except json.JSONDecodeError:
                pass
        return {"success": False, "error": e.message, "data": []}
    except Exception as e:
        return {"success": False, "error": str(e), "data": []}


def _gov_handler(bridge_name: str):
    """Build a handler for a government bridge command (execute_*_command)."""

    def _handler(args: dict[str, Any]) -> dict[str, Any] | list[Any]:
        script = _GOV_SCRIPT_MAP.get(bridge_name)
        if not script:
            return {"success": False, "error": f"{bridge_name} has no script mapping", "data": []}
        command = args.get("command") or args.get("cmd")
        if not command:
            return {
                "success": False,
                "error": "Missing argument 'command'",
                "data": [],
            }
        raw_args = args.get("args")
        if not isinstance(raw_args, list):
            raw_args = []
        result = _run_gov_script(script, str(command), raw_args)
        if isinstance(result, dict):
            return result
        return {"success": True, "data": result}


    return _handler


# Commands invoked by frontend (from inventory)
GOV_COMMANDS = [
    "execute_government_us_command",
    "execute_canada_gov_command",
    "execute_french_gov_command",
    "execute_swiss_gov_command",
    "execute_spain_data_command",
    "execute_pxweb_command",
    "execute_openafrica_command",
    "execute_data_gov_hk_command",
    "execute_congress_gov_command",
    "execute_wto_command",
]


def get_government_handlers() -> dict[str, Any]:
    return {name: _gov_handler(name) for name in GOV_COMMANDS}
