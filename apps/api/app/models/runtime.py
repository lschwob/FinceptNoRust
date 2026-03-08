from pathlib import Path

from pydantic import BaseModel


class RuntimeSummary(BaseModel):
    legacy_frontend_root: Path
    legacy_scripts_root: Path
    inventory_documented: bool
