from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.invoke import router as invoke_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.polymarket_proxy import router as polymarket_proxy_router
from app.api.routes.economic_calendar_proxy import router as economic_calendar_proxy_router
from app.api.routes.dbnomics_proxy import router as dbnomics_proxy_router
from app.api.routes.worldmonitor_proxy import router as worldmonitor_proxy_router
from app.api.routes.runtime import router as runtime_router
from app.api.routes.ws import router as ws_router


api_router = APIRouter()
api_router.include_router(health_router, prefix="/api/v1")
api_router.include_router(invoke_router, prefix="/api/v1/bridge", tags=["bridge"])
api_router.include_router(runtime_router, prefix="/api/v1/runtime", tags=["runtime"])
api_router.include_router(jobs_router, prefix="/api/v1/jobs", tags=["jobs"])
api_router.include_router(polymarket_proxy_router, prefix="/api/v1")
api_router.include_router(economic_calendar_proxy_router, prefix="/api/v1")
api_router.include_router(dbnomics_proxy_router, prefix="/api/v1")
api_router.include_router(worldmonitor_proxy_router, prefix="/api/v1")
api_router.include_router(ws_router)
