"""Proxy for Fincept economic calendar API. Forwards requests with X-API-Key to avoid CORS."""

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse
import httpx

FINCEPT_CALENDAR_BASE = "https://api.fincept.in"

router = APIRouter(prefix="/proxy/economic-calendar", tags=["economic-calendar-proxy"])


@router.get("")
async def proxy_economic_calendar(
    country: str = "US",
    limit: int = 10,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
) -> JSONResponse:
    """Forward GET to api.fincept.in/macro/economic-calendar with query params and X-API-Key."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header required")
    url = f"{FINCEPT_CALENDAR_BASE}/macro/economic-calendar?country={country}&limit={limit}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(url, headers={"Content-Type": "application/json", "X-API-Key": x_api_key})
            return JSONResponse(content=r.json(), status_code=r.status_code)
        except httpx.HTTPError as e:
            return JSONResponse(content={"detail": str(e)}, status_code=502)
        except Exception as e:
            return JSONResponse(content={"detail": str(e)}, status_code=502)
