from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import ApiError


class PythonExecutionService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def resolve_script_path(self, script_path: str) -> Path:
        root = self.settings.legacy_scripts_root.resolve()
        candidate = (root / script_path).resolve()
        if not candidate.exists():
            raise ApiError(
                code="script_not_found",
                message=f"Legacy script '{script_path}' was not found.",
                details={"script_path": script_path, "legacy_scripts_root": str(root)},
                status_code=404,
            )
        # Prevent path traversal: script must stay under legacy_scripts_root
        try:
            candidate.relative_to(root)
        except ValueError:
            raise ApiError(
                code="script_not_found",
                message=f"Legacy script '{script_path}' is not under legacy_scripts_root.",
                details={"script_path": script_path},
                status_code=404,
            )
        return candidate

    def execute_json(
        self,
        script_path: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> dict | list:
        args = args or []
        env = env or {}
        candidate = self.resolve_script_path(script_path)
        command = ["python3", "-u", str(candidate), *args]
        run_env = os.environ.copy()
        run_env["PYTHONUNBUFFERED"] = "1"
        for k, v in env.items():
            run_env[str(k)] = str(v)
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            cwd=str(candidate.parent),
            env=run_env,
            check=False,
        )
        if completed.returncode != 0:
            raise ApiError(
                code="python_execution_failed",
                message="Python script execution failed.",
                details={
                    "script_path": script_path,
                    "stderr": completed.stderr.strip(),
                    "stdout": completed.stdout.strip(),
                    "returncode": completed.returncode,
                },
                retryable=False,
                status_code=500,
            )

        output = completed.stdout.strip()
        if not output:
            return {"status": "ok", "stdout": "", "script_path": script_path}

        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return {"status": "ok", "stdout": output, "script_path": script_path}
