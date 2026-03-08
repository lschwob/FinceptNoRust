from fastapi import APIRouter

from app.core.config import get_settings
from app.models.health import HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        environment=settings.environment,
        websocket_enabled=True,
        jobs_enabled=True,
        legacy_scripts_path=str(settings.legacy_scripts_root),
    )
