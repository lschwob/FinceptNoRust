from typing import Any

from pydantic import BaseModel, Field


class InvokeRequest(BaseModel):
    args: dict[str, Any] = Field(default_factory=dict)


class InvokeResponse(BaseModel):
    command: str
    result: Any
