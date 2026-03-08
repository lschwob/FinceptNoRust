from __future__ import annotations

from datetime import UTC, datetime
from threading import Lock
from uuid import uuid4

from app.models.jobs import JobDetail, JobSummary


class InMemoryJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobDetail] = {}
        self._lock = Lock()

    def create(self, kind: str) -> JobDetail:
        now = datetime.now(UTC)
        job = JobDetail(
            id=str(uuid4()),
            kind=kind,
            status="queued",
            created_at=now,
            updated_at=now,
            logs=[],
            result=None,
            error=None,
        )
        with self._lock:
            self._jobs[job.id] = job
        return job

    def list(self) -> list[JobSummary]:
        with self._lock:
            return [
                JobSummary(
                    id=job.id,
                    kind=job.kind,
                    status=job.status,
                    created_at=job.created_at,
                    updated_at=job.updated_at,
                )
                for job in self._jobs.values()
            ]

    def get(self, job_id: str) -> JobDetail | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update_status(self, job_id: str, status: str) -> JobDetail | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            job.status = status
            job.updated_at = datetime.now(UTC)
            return job

    def append_log(self, job_id: str, line: str) -> JobDetail | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            job.logs.append(line)
            job.updated_at = datetime.now(UTC)
            return job

    def complete(self, job_id: str, result: object) -> JobDetail | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            job.result = result
            job.status = "completed"
            job.updated_at = datetime.now(UTC)
            return job

    def fail(self, job_id: str, code: str, message: str) -> JobDetail | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            job.error = {"code": code, "message": message}
            job.status = "failed"
            job.updated_at = datetime.now(UTC)
            return job


job_store = InMemoryJobStore()
