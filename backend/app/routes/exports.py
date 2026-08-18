"""Export catalogue and file generation."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field

from app.domain.models import AuditEntry, ExportField, ExportRun, ExportTemplate
from app.routes.deps import ActorDep, FiltersDep, StoreDep, TodayDep
from app.services import custom_export, exports

router = APIRouter(tags=["exports"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/exports/templates")
def templates(store: StoreDep, filters: FiltersDep) -> list[ExportTemplate]:
    return exports.catalogue(store, filters)


@router.get("/exports/runs")
def runs(store: StoreDep) -> list[ExportRun]:
    return sorted(store.all_export_runs(), key=lambda r: r.run_at, reverse=True)


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
    store.add_export_run(run)
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


# ---------------------------------------------------------------------------
# Custom exports — choose your own columns
# ---------------------------------------------------------------------------


def _scope_caps(
    charity_scope: str | None,
    allow_pii_header: str | None,
    allow_payment_header: str | None,
) -> tuple[bool, bool]:
    """What this caller may include in a custom export.

    A charity scope is absolute: a charity_viewer never sees donor contact
    details or payment data, and no header can re-enable them. That rule is
    enforced at the service layer, not just in the UI.

    Absent a scope, the calling frontend states the signed-in role's
    capability. The API key that reaches this endpoint is held only by that
    frontend, so the header is a trusted assertion — but it can only ever
    narrow what the scope rule already allows.
    """
    if charity_scope:
        return False, False
    return allow_pii_header == "true", allow_payment_header == "true"


@router.get("/exports/fields")
def fields(
    x_charity_scope: Annotated[str | None, Header(alias="X-Charity-Scope")] = None,
    x_allow_pii: Annotated[str | None, Header(alias="X-Allow-Pii")] = None,
    x_allow_payment: Annotated[str | None, Header(alias="X-Allow-Payment")] = None,
) -> list[ExportField]:
    """The columns this caller may choose from, grouped for display."""
    allow_pii, allow_payment = _scope_caps(x_charity_scope, x_allow_pii, x_allow_payment)
    return [
        ExportField(key=f.key, label=f.label, group=f.group, pii=f.pii)
        for f in custom_export.available_fields(allow_pii, allow_payment)
    ]


class CustomExportIn(BaseModel):
    #: Column keys, in the order they should appear in the sheet.
    columns: list[str] = Field(min_length=1, max_length=60)
    #: What to call the file and the saved run.
    name: str = Field(default="Custom export", max_length=80)


@router.post("/exports/custom/build")
def build_custom(
    body: CustomExportIn,
    store: StoreDep,
    filters: FiltersDep,
    actor: ActorDep,
    x_charity_scope: Annotated[str | None, Header(alias="X-Charity-Scope")] = None,
    x_allow_pii: Annotated[str | None, Header(alias="X-Allow-Pii")] = None,
    x_allow_payment: Annotated[str | None, Header(alias="X-Allow-Payment")] = None,
) -> Response:
    """Generate a sheet from the chosen columns and the current filters."""
    allow_pii, allow_payment = _scope_caps(x_charity_scope, x_allow_pii, x_allow_payment)
    allowed = {f.key for f in custom_export.available_fields(allow_pii, allow_payment)}

    try:
        report = custom_export.build(store, filters, body.columns, allowed=allowed)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    payload = exports.to_xlsx(report, sheet_title="Custom")
    stamp = datetime.now(UTC)
    safe_name = "".join(ch if ch.isalnum() else "_" for ch in body.name).strip("_")
    file_name = f"CUSTOM_{safe_name}_{stamp:%Y%m%d}.xlsx"

    pii_level = custom_export.pii_level_of(body.columns)
    run = ExportRun(
        id=store.next_id("run"),
        template_code="CUSTOM",
        template_name=body.name,
        run_at=stamp,
        run_by=actor,
        row_count=report.row_count,
        file_name=file_name,
        contains_pii=pii_level != "none",
    )
    store.add_export_run(run)
    # The column list is logged: for a custom export, WHICH columns left the
    # building is the thing an auditor needs, and it names no donor.
    store.log(
        actor,
        "export.custom",
        f"{report.row_count} rows · {len(body.columns)} cols · "
        f"{', '.join(body.columns)}",
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
    return sorted(store.all_audit(), key=lambda a: a.at, reverse=True)[:limit]
