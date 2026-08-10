"""Export catalogue and file generation."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response

from app.domain.models import AuditEntry, ExportRun, ExportTemplate
from app.routes.deps import ActorDep, FiltersDep, StoreDep, TodayDep
from app.services import exports

router = APIRouter(tags=["exports"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/exports/templates")
def templates(store: StoreDep, filters: FiltersDep) -> list[ExportTemplate]:
    return exports.catalogue(store, filters)


@router.get("/exports/runs")
def runs(store: StoreDep) -> list[ExportRun]:
    return sorted(store.export_runs, key=lambda r: r.run_at, reverse=True)


@router.post("/exports/{code}")
def generate(
    code: str,
    store: StoreDep,
    filters: FiltersDep,
    actor: ActorDep,
    today: TodayDep,
    upload_id: str | None = None,
) -> Response:
    spec = exports.TEMPLATES_BY_CODE.get(code.upper())
    if spec is None:
        raise HTTPException(404, f"No export template {code}")

    report = spec.build(store, filters, {"today": today, "upload_id": upload_id})
    payload = exports.to_xlsx(report, sheet_title=spec.code)

    stamp = datetime.now(UTC)
    safe_name = "".join(ch if ch.isalnum() else "_" for ch in spec.name).strip("_")
    file_name = f"{spec.code}_{safe_name}_{stamp:%Y%m%d}.xlsx"

    run = ExportRun(
        id=store.next_id("run"),
        template_code=spec.code,
        template_name=spec.name,
        run_at=stamp,
        run_by=actor,
        row_count=report.row_count,
        file_name=file_name,
        contains_pii=spec.pii_level != "none",
    )
    store.export_runs.append(run)
    # PII-bearing exports are flagged in the audit log, per the security rules.
    store.log(
        actor,
        "export.generate",
        f"{spec.code} · {report.row_count} rows · {file_name}",
        contains_pii=run.contains_pii,
    )

    return Response(
        content=payload,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{file_name}"',
            "X-Row-Count": str(report.row_count),
            "X-Contains-Pii": "true" if run.contains_pii else "false",
        },
    )


@router.get("/audit")
def audit(store: StoreDep, limit: int = 200) -> list[AuditEntry]:
    return sorted(store.audit, key=lambda a: a.at, reverse=True)[:limit]
