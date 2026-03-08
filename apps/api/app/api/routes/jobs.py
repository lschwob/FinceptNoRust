from fastapi import APIRouter

from app.core.errors import ApiError
from app.models.jobs import JobCreateRequest, JobDetail, JobSummary
from app.services.job_store import job_store
from app.services.python_execution import PythonExecutionService


router = APIRouter()
python_execution_service = PythonExecutionService()


@router.get("", response_model=list[JobSummary])
async def list_jobs() -> list[JobSummary]:
    return job_store.list()


@router.post("/python", response_model=JobDetail)
async def run_python_job(request: JobCreateRequest) -> JobDetail:
    if not request.script_path:
        raise ApiError(
            code="missing_script_path",
            message="script_path is required for python jobs.",
            status_code=422,
        )

    job = job_store.create(kind=request.kind or "python_script")
    job_store.update_status(job.id, "running")
    job_store.append_log(job.id, f"Executing {request.script_path}")
    try:
        result = python_execution_service.execute_json(request.script_path, request.args)
        completed = job_store.complete(job.id, result)
        assert completed is not None
        return completed
    except ApiError as exc:
        failed = job_store.fail(job.id, exc.code, exc.message)
        assert failed is not None
        return failed


@router.get("/{job_id}", response_model=JobDetail)
async def get_job(job_id: str) -> JobDetail:
    job = job_store.get(job_id)
    if not job:
        raise ApiError(
            code="job_not_found",
            message=f"Job '{job_id}' was not found.",
            details={"job_id": job_id},
            status_code=404,
        )
    return job
