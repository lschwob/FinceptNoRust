from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    environment: str
    websocket_enabled: bool
    jobs_enabled: bool
    legacy_scripts_path: str
