"""Load a legacy archive straight into Supabase, from this machine.

    # see what WOULD happen, touching nothing
    uv run python -m app.migrate_legacy "/path/to/April to July 2026 Data" --dry-run

    # do it
    uv run python -m app.migrate_legacy "/path/to/April to July 2026 Data"

Runs locally and talks to Postgres directly, so it costs nothing to host and is
not subject to the deployed API's request-size or duration limits — a full-size
tracker that would exceed Vercel's 4.5MB body cap is fine here.

It reuses the SAME parsers, consolidation and store as the API. There is no
second implementation of the pipeline, so anything proved here holds in
production and vice versa.

Four properties worth knowing:

**Idempotent.** Re-running the same archive changes nothing. Billing events
dedupe on their natural key in the database, exceptions dedupe among unresolved
rows, and pledges upsert on serial. Interrupt it and run it again.

**Files are classified by CONTENT, not filename.** `read_rows` picks the
signature from the header row, so a "Submissions" file that is really apps-shaped
is treated as such — which is exactly the case here: the daily Submissions
files carry the Apps Tracker schema in a 107-column variant.

**Applications are loaded before bank rows.** A Status Report processed first
would put every row on the review queue as `no_matching_pledge`. Within each
kind, files go in date order so that the earliest outcome is recorded first and
`debit_date` lands on the true first approval.

**Existing data wins.** `prefer_existing=True` implements the owner's backfill
rule (2026-08-18): a populated field is never overwritten by a historical file,
and only gaps are filled. A PROVISIONAL record created from a bank row still
yields to the real application — see `merge_application`.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from app.config import get_settings
from app.parsing.apps_tracker import parse_apps_tracker
from app.parsing.reader import NoDataSheetError, read_rows
from app.parsing.status_report import parse_status_report
from app.services import consolidate
from app.store.factory import StoreLike
from app.store.memory import Store
from app.store.postgres import PostgresStore

#: Both legacy formats. `.xls` is the daily Submissions files (BIFF) and
#: `.xlsx` the Status Reports; `read_rows` handles each.
WORKBOOK_SUFFIXES = (".xls", ".xlsx")

#: Excel lock files and macOS resource forks litter shared drives. Skipping
#: them here keeps them out of the unreadable-files report, where they would
#: look like real failures.
IGNORED_PREFIXES = ("~$", "._")


@dataclass
class Report:
    """What the run did, for the reconciliation conversation with the owner."""

    apps_files: int = 0
    status_files: int = 0
    unreadable: list[tuple[str, str]] = field(default_factory=list)
    rows_read: int = 0
    pledges_created: int = 0
    pledges_updated: int = 0
    provisional: int = 0
    events_added: int = 0
    problems: Counter[str] = field(default_factory=Counter)
    unmatched_serials: set[str] = field(default_factory=set)

    def render(self, *, dry_run: bool) -> str:
        lines = [
            "",
            "=" * 68,
            f"  {'DRY RUN — nothing was written' if dry_run else 'MIGRATION COMPLETE'}",
            "=" * 68,
            f"  files read          {self.apps_files + self.status_files}"
            f"  ({self.apps_files} applications, {self.status_files} bank)",
            f"  rows read           {self.rows_read}",
            f"  pledges created     {self.pledges_created}",
            f"  pledges updated     {self.pledges_updated}",
            f"  from bank only      {self.provisional}   (PROVISIONAL, no application yet)",
            f"  billing events      {self.events_added}",
        ]
        if self.problems:
            lines.append("  review queue")
            for problem, count in self.problems.most_common():
                lines.append(f"      {problem:24s} {count}")
        else:
            lines.append("  review queue        empty")

        if self.unmatched_serials:
            sample = sorted(self.unmatched_serials)[:5]
            lines.append(
                f"  unmatched serials   {len(self.unmatched_serials)}"
                f"  e.g. {', '.join(sample)}"
            )
        if self.unreadable:
            lines.append(f"  UNREADABLE FILES    {len(self.unreadable)}")
            for name, why in self.unreadable[:10]:
                lines.append(f"      {name}: {why}")
            if len(self.unreadable) > 10:
                lines.append(f"      ... and {len(self.unreadable) - 10} more")
        lines.append("=" * 68)
        return "\n".join(lines)


#: `Status Report (08-04-2026 - 10-04-2026).xlsx` and
#: `FP-STC Daily 2026-06-09.xls` — two different date conventions in one
#: archive. Both are captured so files sort chronologically rather than
#: alphabetically, which would put October before April.
_DMY = re.compile(r"(\d{2})-(\d{2})-(\d{4})")
_YMD = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def file_date(path: Path) -> str:
    """A sortable ISO date from the filename, or '' when there is none.

    Sorting by name would interleave months; sorting by mtime is worse still,
    because copying an archive rewrites it — several files here already carry a
    2026-08-17 mtime from being re-saved.
    """
    ymd = _YMD.search(path.name)
    if ymd:
        return f"{ymd.group(1)}-{ymd.group(2)}-{ymd.group(3)}"
    dmy = _DMY.search(path.name)
    if dmy:
        return f"{dmy.group(3)}-{dmy.group(2)}-{dmy.group(1)}"
    return ""


def find_workbooks(root: Path) -> list[Path]:
    return sorted(
        p
        for p in root.rglob("*")
        if p.is_file()
        and p.suffix.lower() in WORKBOOK_SUFFIXES
        and not p.name.startswith(IGNORED_PREFIXES)
    )


@dataclass
class Classified:
    apps: list[Path] = field(default_factory=list)
    status: list[Path] = field(default_factory=list)
    unreadable: list[tuple[str, str]] = field(default_factory=list)


def classify(paths: list[Path], *, verbose: bool = False) -> Classified:
    """Split files by what their HEADERS say they are.

    Costs one read of each file up front, which buys ordering: applications
    cannot be loaded before bank rows if we do not yet know which is which.
    """
    out = Classified()
    for path in paths:
        try:
            result = read_rows(path)
        except NoDataSheetError as exc:
            out.unreadable.append((path.name, str(exc)))
            continue
        except Exception as exc:  # one bad file must not stop the run
            out.unreadable.append((path.name, f"{type(exc).__name__}: {exc}"))
            continue

        if result.signature.name == "apps_tracker":
            out.apps.append(path)
        else:
            out.status.append(path)
        if verbose:
            print(f"    {path.name}: {result.signature.name}, {len(result.rows)} rows")

    out.apps.sort(key=lambda p: (file_date(p), p.name))
    out.status.sort(key=lambda p: (file_date(p), p.name))
    return out


def migrate(
    store: StoreLike,
    root: Path,
    *,
    dry_run: bool,
    limit: int | None = None,
    verbose: bool = False,
) -> Report:
    report = Report()
    paths = find_workbooks(root)
    if not paths:
        print(f"No .xls/.xlsx files under {root}")
        return report

    print(f"Found {len(paths)} workbooks under {root}")
    print("Classifying by header signature…")
    groups = classify(paths, verbose=verbose)
    report.unreadable = groups.unreadable

    if limit:
        groups.apps = groups.apps[:limit]
        groups.status = groups.status[:limit]

    report.apps_files = len(groups.apps)
    report.status_files = len(groups.status)
    print(
        f"  {len(groups.apps)} application files, {len(groups.status)} bank files, "
        f"{len(groups.unreadable)} unreadable"
    )

    if dry_run:
        # Parsing is where the data-quality problems surface, so a dry run
        # still parses everything — it just never reaches the store.
        print("\nDry run: parsing only, nothing written.")
        for path in groups.apps + groups.status:
            try:
                result = read_rows(path)
                if result.signature.name == "apps_tracker":
                    parsed = parse_apps_tracker(result)
                else:
                    parsed = parse_status_report(result)
                report.rows_read += parsed.total
                report.problems["parse_error"] += len(parsed.exceptions)
            except Exception as exc:
                report.unreadable.append((path.name, f"{type(exc).__name__}: {exc}"))
        return report

    # Applications first, then bank rows. See the module docstring.
    print(f"\nLoading {len(groups.apps)} application files…")
    for index, path in enumerate(groups.apps, start=1):
        try:
            result = read_rows(path)
            parsed = parse_apps_tracker(result)
            outcome = consolidate.consolidate_apps_tracker(
                store,
                parsed,
                filename=path.name,
                uploaded_by="legacy-migration",
                # The backfill rule: never overwrite a populated field.
                prefer_existing=True,
            )
        except Exception as exc:  # a bad file must not stop the archive
            report.unreadable.append((path.name, f"{type(exc).__name__}: {exc}"))
            continue

        report.rows_read += outcome.upload.row_count
        report.pledges_created += outcome.impact.new_pledges
        report.pledges_updated += outcome.upload.matched_count - outcome.impact.new_pledges
        for exc_row in outcome.exceptions:
            report.problems[exc_row.problem] += 1
        print(
            f"  [{index}/{len(groups.apps)}] {path.name}: "
            f"{outcome.upload.row_count} rows, +{outcome.impact.new_pledges} new, "
            f"{outcome.upload.exception_count} exceptions"
        )

    print(f"\nLoading {len(groups.status)} bank files…")
    for index, path in enumerate(groups.status, start=1):
        try:
            result = read_rows(path)
            parsed = parse_status_report(result)
            outcome = consolidate.consolidate_status_report(
                store, parsed, filename=path.name, uploaded_by="legacy-migration"
            )
        except Exception as exc:
            report.unreadable.append((path.name, f"{type(exc).__name__}: {exc}"))
            continue

        report.rows_read += outcome.upload.row_count
        report.provisional += outcome.upload.new_record_count
        for exc_row in outcome.exceptions:
            report.problems[exc_row.problem] += 1
            if exc_row.problem == "no_matching_pledge" and exc_row.serial_no:
                report.unmatched_serials.add(exc_row.serial_no)
        print(
            f"  [{index}/{len(groups.status)}] {path.name}: "
            f"{outcome.upload.row_count} rows, {outcome.upload.matched_count} matched, "
            f"{outcome.upload.exception_count} exceptions"
        )

    report.events_added = len(store.all_billing_events())
    return report


def build_store(*, use_memory: bool) -> StoreLike:
    """The real store, or an in-memory one for a rehearsal.

    `--in-memory` parses and consolidates the whole archive without touching
    Supabase, which is the honest way to rehearse: it exercises consolidation
    and the review queue, not just the parsers.
    """
    if use_memory:
        print("Using the IN-MEMORY store: nothing will reach Supabase.")
        return Store()

    settings = get_settings()
    if not settings.supabase_db_url:
        print("SUPABASE_DB_URL is not set. Put it in backend/.env or the environment.")
        raise SystemExit(2)
    print("Connecting to Postgres…")
    return PostgresStore(settings.supabase_db_url)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.migrate_legacy",
        description="Load a legacy archive of .xls/.xlsx files into the platform.",
    )
    parser.add_argument("root", type=Path, help="folder to walk (recursively)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="parse everything and report, but write nothing",
    )
    parser.add_argument(
        "--in-memory",
        action="store_true",
        help="full consolidation against a throwaway store; never touches Supabase",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="only the first N files of each kind, for a quick rehearsal",
    )
    parser.add_argument("--verbose", action="store_true", help="log every file classified")
    args = parser.parse_args(argv)

    root: Path = args.root.expanduser()
    if not root.is_dir():
        print(f"Not a directory: {root}")
        return 2

    started = datetime.now(UTC)
    store = build_store(use_memory=args.in_memory or args.dry_run)
    report = migrate(
        store,
        root,
        dry_run=args.dry_run,
        limit=args.limit,
        verbose=args.verbose,
    )

    if not args.dry_run and not args.in_memory:
        store.log(
            "legacy-migration",
            "import.migration",
            f"{report.apps_files + report.status_files} files, "
            f"{report.rows_read} rows, {report.pledges_created} new pledges",
        )

    print(report.render(dry_run=args.dry_run or args.in_memory))
    print(f"  elapsed {(datetime.now(UTC) - started).total_seconds():.0f}s")

    if isinstance(store, PostgresStore):
        store.close()
    # Unreadable files are the one outcome that should fail a scripted run:
    # everything else is recorded in the review queue by design.
    return 1 if report.unreadable else 0


if __name__ == "__main__":
    sys.exit(main())
