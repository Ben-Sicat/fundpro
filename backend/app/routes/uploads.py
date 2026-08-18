"""Upload and consolidation: the pipeline that replaces the manual VLOOKUP.

Drop in either tracker; the service works out which it is from the header
signature rather than asking the user to say.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.domain.models import ImportException, Upload, UploadImpact
from app.parsing import NoDataSheetError, read_rows
from app.parsing.apps_tracker import parse_apps_tracker
from app.parsing.status_report import parse_status_report
from app.routes.deps import ActorDep, StoreDep
from app.services import consolidate

router = APIRouter(tags=["uploads"])
log = logging.getLogger(__name__)

#: Refuse anything larger before reading it. The real trackers are ~10-200KB;
#: this is generous enough for years of accumulated history.
MAX_UPLOAD_BYTES = 32 * 1024 * 1024
ALLOWED_SUFFIXES = {".xlsx", ".xlsm"}

#: Every xlsx is a zip archive. Checking the magic bytes stops a renamed
#: executable from reaching the parser.
ZIP_MAGIC = b"PK\x03\x04"


@router.post("/uploads", status_code=201)
async def create_upload(
    store: StoreDep,
    actor: ActorDep,
    file: UploadFile = File(...),
) -> dict:
    filename = Path(file.filename or "upload.xlsx").name
    if Path(filename).suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(415, "Only .xlsx or .xlsm workbooks are accepted")

    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than the 32MB limit")
    if not payload.startswith(ZIP_MAGIC):
        raise HTTPException(415, "File is not a readable .xlsx workbook")

    # Parsed inside a temp dir that is removed whatever happens; an uploaded
    # workbook full of donor PII must not linger on disk.
    with tempfile.TemporaryDirectory(prefix="fundpro-") as tmp:
        path = Path(tmp) / filename
        path.write_bytes(payload)
        try:
            read = read_rows(path)
        except NoDataSheetError as exc:
            # The reason is safe (it names no cell contents), the file is not.
            log.warning("upload rejected: %s", exc)
            raise HTTPException(
                422,
                "That workbook does not look like an Apps Tracker or a Status Report",
            ) from exc

        if read.signature.name == "apps_tracker":
            result = consolidate.consolidate_apps_tracker(
                store, parse_apps_tracker(read), filename=filename, uploaded_by=actor
            )
        else:
            result = consolidate.consolidate_status_report(
                store, parse_status_report(read), filename=filename, uploaded_by=actor
            )

    return {
        "upload": result.upload.model_dump(by_alias=True, mode="json"),
        "impact": result.impact.model_dump(by_alias=True, mode="json"),
        "exceptions": [
            e.model_dump(by_alias=True, mode="json") for e in result.exceptions
        ],
    }


@router.get("/uploads")
def list_uploads(store: StoreDep) -> list[Upload]:
    return sorted(store.all_uploads(), key=lambda u: u.uploaded_at, reverse=True)


@router.get("/uploads/{upload_id}/impact")
def upload_impact(upload_id: str, store: StoreDep) -> UploadImpact:
    if store.get_upload(upload_id) is None:
        raise HTTPException(404, "No such upload")
    return consolidate.impact_of(store, upload_id)


@router.get("/exceptions")
def list_exceptions(store: StoreDep, resolved: bool | None = None) -> list[ImportException]:
    rows = store.all_exceptions()
    if resolved is not None:
        rows = [e for e in rows if e.resolved == resolved]
    return sorted(rows, key=lambda e: e.created_at, reverse=True)


@router.post("/exceptions/{exception_id}/resolve")
def resolve_exception(exception_id: str, store: StoreDep, actor: ActorDep) -> ImportException:
    resolved = store.resolve_exception(exception_id)
    if resolved is None:
        raise HTTPException(404, "No such exception")
    store.log(actor, "exception.resolve", f"resolved {exception_id}")
    return resolved
