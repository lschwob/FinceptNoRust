from fastapi import APIRouter

from app.models.invoke import InvokeRequest, InvokeResponse
from app.services.invoke_registry import invoke_command


router = APIRouter()


@router.post("/invoke/{command}", response_model=InvokeResponse)
async def invoke(command: str, request: InvokeRequest) -> InvokeResponse:
    return invoke_command(command, request.args)
