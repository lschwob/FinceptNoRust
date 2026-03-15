"""Proxy for public geo-intelligence data feeds (USGS, NASA EONET, etc.)
Used by the News tab WorldMonitor integration."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import httpx

router = APIRouter(prefix="/proxy/worldmonitor", tags=["worldmonitor-proxy"])

USGS_EARTHQUAKE_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary"
NASA_EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"


@router.get("/earthquakes")
async def proxy_earthquakes(min_magnitude: str = "4.5", timeframe: str = "day") -> JSONResponse:
    """USGS earthquake feed. timeframe: hour|day|week|month. min_magnitude: significant|4.5|2.5|1.0|all."""
    url = f"{USGS_EARTHQUAKE_URL}/{min_magnitude}_{timeframe}.geojson"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                events = []
                for f in data.get("features", []):
                    p = f.get("properties", {})
                    c = f.get("geometry", {}).get("coordinates", [0, 0, 0])
                    events.append({
                        "id": f.get("id", ""),
                        "lat": c[1] if len(c) > 1 else 0,
                        "lng": c[0] if len(c) > 0 else 0,
                        "depth": c[2] if len(c) > 2 else 0,
                        "magnitude": p.get("mag", 0),
                        "place": p.get("place", ""),
                        "time": p.get("time", 0),
                        "url": p.get("url", ""),
                        "tsunami": p.get("tsunami", 0),
                        "type": "earthquake",
                    })
                return JSONResponse({"events": events, "count": len(events)})
            return JSONResponse({"events": [], "count": 0, "error": f"USGS API {r.status_code}"}, status_code=502)
        except Exception as e:
            return JSONResponse({"events": [], "count": 0, "error": str(e)}, status_code=502)


@router.get("/natural-events")
async def proxy_natural_events(status: str = "open", limit: int = 50) -> JSONResponse:
    """NASA EONET natural events (wildfires, volcanoes, storms, etc.)."""
    url = f"{NASA_EONET_URL}?status={status}&limit={limit}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                events = []
                for e in data.get("events", []):
                    cats = e.get("categories", [])
                    cat = cats[0].get("title", "Unknown") if cats else "Unknown"
                    cat_id = cats[0].get("id") if cats else None
                    geo = e.get("geometry", [])
                    coords = geo[-1].get("coordinates") if geo else None
                    if not coords:
                        continue
                    events.append({
                        "id": e.get("id", ""),
                        "title": e.get("title", ""),
                        "category": cat,
                        "categoryId": cat_id,
                        "lat": coords[1] if len(coords) > 1 else 0,
                        "lng": coords[0] if len(coords) > 0 else 0,
                        "date": geo[-1].get("date") if geo else None,
                        "link": e.get("link", ""),
                        "type": "natural",
                    })
                return JSONResponse({"events": events, "count": len(events)})
            return JSONResponse({"events": [], "count": 0, "error": f"EONET API {r.status_code}"}, status_code=502)
        except Exception as e:
            return JSONResponse({"events": [], "count": 0, "error": str(e)}, status_code=502)
