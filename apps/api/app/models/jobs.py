from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class JobCreateRequest(BaseModel):
    kind: str = Field(description="High-level job type, e.g. python_script.")
    script_path: str | None = None
    args: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class JobSummary(BaseModel):
    id: str
    kind: str
    status: str
    created_at: datetime
    updated_at: datetime


class JobDetail(JobSummary):
    logs: list[str] = Field(default_factory=list)
    result: Any | None = None
    error: dict[str, Any] | None = None
