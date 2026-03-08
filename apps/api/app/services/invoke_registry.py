from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Callable

from app.core.errors import ApiError
from app.models.invoke import InvokeResponse
from app.services.compat_store import credentials_store, settings_store, storage_store
from app.services.python_execution import PythonExecutionService


Handler = Callable[[dict[str, Any]], Any]
python_execution_service = PythonExecutionService()


def _check_setup_status(_: dict[str, Any]) -> dict[str, Any]:
    return {
        "needs_setup": False,
        "needs_sync": False,
        "sync_message": None,
    }


def _sync_requirements(_: dict[str, Any]) -> dict[str, Any]:
    return {"success": True, "synced_at": datetime.now(UTC).isoformat()}


def _storage_set(args: dict[str, Any]) -> dict[str, bool]:
    payload = storage_store.get_all()
    payload[args["key"]] = args["value"]
    storage_store.set_all(payload)
    return {"success": True}


def _storage_remove(args: dict[str, Any]) -> dict[str, bool]:
    payload = storage_store.get_all()
    payload.pop(args["key"], None)
    storage_store.set_all(payload)
    return {"success": True}


def _storage_set_many(args: dict[str, Any]) -> dict[str, bool]:
    payload = storage_store.get_all()
    for entry in args.get("entries", []):
        payload[entry["key"]] = entry["value"]
    storage_store.set_all(payload)
    return {"success": True}


def _storage_clear(_: dict[str, Any]) -> dict[str, bool]:
    storage_store.set_all({})
    return {"success": True}


def _db_save_setting(args: dict[str, Any]) -> dict[str, bool]:
    payload = settings_store.get_all()
    payload[args["key"]] = {
        "setting_key": args["key"],
        "setting_value": args["value"],
        "category": args.get("category"),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    settings_store.set_all(payload)
    return {"success": True}


def _db_get_setting(args: dict[str, Any]) -> str | None:
    payload = settings_store.get_all()
    setting = payload.get(args["key"])
    if not setting:
        return None
    return setting["setting_value"]


def _db_get_all_settings(_: dict[str, Any]) -> list[dict[str, Any]]:
    payload = settings_store.get_all()
    return list(payload.values())


def _db_save_credential(args: dict[str, Any]) -> dict[str, Any]:
    payload = credentials_store.get_all()
    credential = args["credential"]
    service_name = credential["service_name"]
    payload[service_name] = credential
    credentials_store.set_all(payload)
    return {"success": True, "message": f"Saved credential for {service_name}"}


def _db_get_credentials(_: dict[str, Any]) -> list[dict[str, Any]]:
    payload = credentials_store.get_all()
    return list(payload.values())


def _db_get_credential_by_service(args: dict[str, Any]) -> dict[str, Any] | None:
    payload = credentials_store.get_all()
    return payload.get(args["serviceName"])


def _db_delete_credential(args: dict[str, Any]) -> dict[str, Any]:
    payload = credentials_store.get_all()
    keys_to_remove = [key for key, value in payload.items() if value.get("id") == args["id"]]
    for key in keys_to_remove:
        payload.pop(key, None)
    credentials_store.set_all(payload)
    return {"success": True, "message": "Deleted credential"}


def _execute_python_script(args: dict[str, Any]) -> Any:
    # Frontend may send scriptName (camelCase) or script_name (snake_case)
    script_path = args.get("script_name") or args.get("scriptName")
    if not script_path:
        raise ApiError(
            code="missing_argument",
            message="Missing argument 'script_name' (or 'scriptName') for command 'execute_python_script'.",
            details={"command": "execute_python_script"},
            status_code=422,
        )
    return python_execution_service.execute_json(
        script_path=script_path,
        args=args.get("args", []),
    )


def _default_not_implemented(command: str, args: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "not_implemented_yet",
        "command": command,
        "args": args,
    }


_BASE_HANDLERS: dict[str, Handler] = {
    "check_setup_status": _check_setup_status,
    "sync_requirements": _sync_requirements,
    "storage_set": _storage_set,
    "storage_remove": _storage_remove,
    "storage_set_many": _storage_set_many,
    "storage_clear": _storage_clear,
    "db_save_setting": _db_save_setting,
    "db_get_setting": _db_get_setting,
    "db_get_all_settings": _db_get_all_settings,
    "db_save_credential": _db_save_credential,
    "db_get_credentials": _db_get_credentials,
    "db_get_credential_by_service": _db_get_credential_by_service,
    "db_delete_credential": _db_delete_credential,
    "execute_python_script": _execute_python_script,
    "execute_python_command": _execute_python_script,  # alias used by frontend nodes
}

from app.domains import get_all_handlers

HANDLERS: dict[str, Handler] = {**_BASE_HANDLERS, **get_all_handlers()}


def invoke_command(command: str, args: dict[str, Any]) -> InvokeResponse:
    handler = HANDLERS.get(command)
    if handler is None:
        return InvokeResponse(command=command, result=_default_not_implemented(command, args))
    try:
        return InvokeResponse(command=command, result=handler(args))
    except KeyError as exc:
        raise ApiError(
            code="missing_argument",
            message=f"Missing argument '{exc.args[0]}' for command '{command}'.",
            details={"command": command},
            status_code=422,
        ) from exc
