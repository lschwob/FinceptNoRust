from fastapi import FastAPI, Request, status
from fastapi.responses import ORJSONResponse


class ApiError(Exception):
    def __init__(self, code: str, message: str, details: dict | None = None, retryable: bool = False, status_code: int = 400):
        self.code = code
        self.message = message
        self.details = details or {}
        self.retryable = retryable
        self.status_code = status_code
        super().__init__(message)


def error_payload(code: str, message: str, details: dict | None = None, retryable: bool = False) -> dict[str, object]:
    return {
        "code": code,
        "message": message,
        "details": details or {},
        "retryable": retryable,
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> ORJSONResponse:
        return ORJSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.code, exc.message, exc.details, exc.retryable),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception) -> ORJSONResponse:
        return ORJSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                "internal_error",
                "Unexpected server error.",
                {"exception": exc.__class__.__name__},
                retryable=False,
            ),
        )
