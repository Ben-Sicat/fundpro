"""Developer CLI — load workbooks into a running service and inspect it.

    uv run uvicorn app.asgi:app --port 8000          # in one terminal
    uv run python -m app.cli load /path/to/*.xlsx    # in another
    uv run python -m app.cli status

Exists so a demo does not depend on clicking through a UI, and so the same
files can be re-loaded reproducibly. Nothing here is used in production.

The store is in memory: a restart empties it. That is deliberate while the
database integration is pinned — see app/store/__init__.py.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib import error, request

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _call(base: str, key: str, path: str, method: str = "GET", body: bytes | None = None,
          content_type: str | None = None) -> tuple[int, str]:
    url = f"{base}{path}"
    if not url.startswith(("http://", "https://")):
        raise ValueError("FUNDPRO_API must be an http(s) URL")
    req = request.Request(url, method=method, data=body)  # noqa: S310
    req.add_header("Authorization", f"Bearer {key}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with request.urlopen(req, timeout=120) as response:  # noqa: S310
            return response.status, response.read().decode()
    except error.HTTPError as exc:
        return exc.code, exc.read().decode()
    except OSError as exc:
        return 0, str(exc)


def _multipart(path: Path) -> tuple[bytes, str]:
    boundary = "----fundpro-cli-boundary"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: {XLSX}\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    return head + path.read_bytes() + tail, f"multipart/form-data; boundary={boundary}"


def load(base: str, key: str, paths: list[str]) -> int:
    """Upload workbooks in order. Apps Trackers first, so the bank rows match.

    Uploading a Status Report before its applications exist would put every
    row on the exceptions list as 'no matching pledge' — correct behaviour,
    but a confusing demo.
    """
    files = [Path(p) for p in paths]
    files.sort(key=lambda p: 0 if "apps" in p.name.lower() else 1)

    failures = 0
    for path in files:
        if not path.exists():
            print(f"  {path.name}: not found")
            failures += 1
            continue
        body, content_type = _multipart(path)
        status, text = _call(base, key, "/uploads", "POST", body, content_type)
        if status != 201:
            print(f"  {path.name}: HTTP {status} {text[:120]}")
            failures += 1
            continue
        payload = json.loads(text)
        upload, impact = payload["upload"], payload["impact"]
        print(
            f"  {path.name}: {upload['sourceType']} · {upload['rowCount']} rows · "
            f"{upload['matchedCount']} matched · {upload['exceptionCount']} exceptions · "
            f"+{impact.get('newPledges', 0)} new"
        )
    return failures


def status(base: str, key: str) -> int:
    for label, path in (
        ("pledges", "/pledges"),
        ("uploads", "/uploads"),
        ("exceptions", "/exceptions"),
    ):
        code, text = _call(base, key, path)
        if code != 200:
            print(f"{label}: HTTP {code} {text[:120]}")
            return 1
        print(f"{label:12s} {len(json.loads(text))}")

    code, text = _call(base, key, "/kpis")
    if code == 200:
        k = json.loads(text)
        print(
            f"{'realization':12s} {k['realizationRate']:.1%} "
            f"({k['activeDonors']} of {k['signups']} sign-ups billing)"
        )

    code, text = _call(base, key, "/settings/configuration")
    if code == 200:
        rows = json.loads(text)
        assumed = [r for r in rows if r["status"] == "assumed"]
        print(f"{'settings':12s} {len(rows)} rules, {len(assumed)} still assumed")
    return 0


def main(argv: list[str]) -> int:
    import os

    base = os.environ.get("FUNDPRO_API", "http://localhost:8000").rstrip("/")
    key = os.environ.get("API_KEY", "")
    if not key:
        print("Set API_KEY to the same value the service is running with.")
        return 2

    if len(argv) >= 2 and argv[1] == "load":
        if len(argv) < 3:
            print("usage: python -m app.cli load <file.xlsx> [...]")
            return 2
        print(f"Loading {len(argv) - 2} file(s) into {base}")
        return load(base, key, argv[2:])

    if len(argv) >= 2 and argv[1] == "status":
        return status(base, key)

    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
