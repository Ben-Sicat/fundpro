import hmac

from starlette.requests import Request
from starlette.responses import JSONResponse

# Health stays probe-friendly (no secret on the monitor side); it leaks nothing
# but a status word and a table count.
PUBLIC_PATHS = frozenset({"/health"})


class BearerAuthMiddleware:
    """Server-to-server auth: constant-time bearer-token check on every request."""

    def __init__(self, app, api_key: str):
        self.app = app
        self.api_key = api_key

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] in PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(
            token.encode(), self.api_key.encode()
        ):
            response = JSONResponse({"detail": "Unauthorized"}, status_code=401)
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
