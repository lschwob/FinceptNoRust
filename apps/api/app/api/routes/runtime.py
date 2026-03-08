from pathlib import Path

from fastapi import APIRouter

from app.core.config import get_settings
from app.models.runtime import RuntimeSummary


router = APIRouter()


@router.get("/summary", response_model=RuntimeSummary)
async def get_runtime_summary() -> RuntimeSummary:
    settings = get_settings()
    inventory_path = Path(settings.project_root) / "docs" / "migration" / "generated" / "inventory.json"
    return RuntimeSummary(
        legacy_frontend_root=settings.legacy_frontend_root,
        legacy_scripts_root=settings.legacy_scripts_root,
        inventory_documented=inventory_path.exists(),
    )
