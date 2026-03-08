"""Proxy for Polymarket Gamma API to avoid CORS when the frontend runs in the browser."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
import httpx

GAMMA_BASE = "https://gamma-api.polymarket.com"

router = APIRouter(prefix="/proxy/polymarket/gamma", tags=["polymarket-proxy"])


@router.get("/{path:path}")
async def proxy_gamma(request: Request, path: str) -> Response:
    """Forward GET requests to gamma-api.polymarket.com. Query string is preserved."""
    url = f"{GAMMA_BASE}/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(url)
            content_type = r.headers.get("content-type", "")
            if "application/json" in content_type:
                return JSONResponse(content=r.json(), status_code=r.status_code)
            return Response(content=r.content, status_code=r.status_code, media_type=content_type or None)
        except httpx.HTTPError as e:
            return JSONResponse(
                content={"detail": str(e), "proxy": "polymarket-gamma"},
                status_code=502,
            )
        except Exception as e:
            return JSONResponse(
                content={"detail": str(e), "proxy": "polymarket-gamma"},
                status_code=502,
            )
