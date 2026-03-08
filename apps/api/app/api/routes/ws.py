from fastapi import APIRouter, WebSocket, WebSocketDisconnect


router = APIRouter()


async def _echo_socket(websocket: WebSocket, channel: str) -> None:
    await websocket.accept()
    await websocket.send_json({"channel": channel, "status": "connected"})
    try:
        while True:
            payload = await websocket.receive_json()
            await websocket.send_json({"channel": channel, "echo": payload})
    except WebSocketDisconnect:
        return


@router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket) -> None:
    await _echo_socket(websocket, "notifications")


@router.websocket("/ws/market")
async def market_socket(websocket: WebSocket) -> None:
    await _echo_socket(websocket, "market")


@router.websocket("/ws/jobs")
async def jobs_socket(websocket: WebSocket) -> None:
    await _echo_socket(websocket, "jobs")


@router.websocket("/ws/brokers")
async def brokers_socket(websocket: WebSocket) -> None:
    await _echo_socket(websocket, "brokers")
