from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any

from app.core.config import get_settings


class JsonStore:
    def __init__(self, name: str) -> None:
        root = get_settings().project_root / "apps" / "api" / "data"
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / f"{name}.json"
        self.lock = Lock()

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, payload: dict[str, Any]) -> None:
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def get_all(self) -> dict[str, Any]:
        with self.lock:
            return self._read()

    def set_all(self, payload: dict[str, Any]) -> None:
        with self.lock:
            self._write(payload)


settings_store = JsonStore("settings")
storage_store = JsonStore("storage")
credentials_store = JsonStore("credentials")
