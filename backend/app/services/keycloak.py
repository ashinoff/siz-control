"""Platform SSO — Keycloak access-token verification (feature-flagged).

Validates a Keycloak access JWT against the realm's JWKS: signature, ``iss``,
``exp`` and ``azp`` (a public client's ``aud`` is usually "account", so we do
NOT require ``aud`` — we check ``azp`` instead). The JWKS is cached in-process
and refetched on a key-id miss or after a TTL, so Keycloak is not hit per
request. The token itself is never logged or stored — only failure reasons.
"""
import json
import time
import urllib.request
from typing import Optional

from jose import JWTError, jwt

from ..config import settings

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}


class TokenError(Exception):
    """Token failed validation. Its message is safe to log (no token data)."""


def _fetch_jwks() -> dict:
    req = urllib.request.Request(
        settings.KEYCLOAK_JWKS_URL, headers={"Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=5) as resp:  # noqa: S310 (trusted URL from config)
        return json.loads(resp.read().decode("utf-8"))


def _get_jwks(force: bool = False) -> dict:
    now = time.time()
    stale = (now - _jwks_cache["fetched_at"]) > _JWKS_TTL_SECONDS
    if force or _jwks_cache["keys"] is None or stale:
        _jwks_cache["keys"] = _fetch_jwks()
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


def _find_key(kid: str, jwks: dict) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def verify_token(token: str) -> dict:
    """Return validated claims, or raise ``TokenError`` with a safe reason."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise TokenError(f"malformed token header ({exc.__class__.__name__})")

    kid = header.get("kid")
    if not kid:
        raise TokenError("no kid in token header")

    key = _find_key(kid, _get_jwks())
    if key is None:
        # Keys may have rotated — refetch once before giving up.
        key = _find_key(kid, _get_jwks(force=True))
    if key is None:
        raise TokenError("signing key not found in JWKS")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[header.get("alg", "RS256")],
            issuer=settings.KEYCLOAK_ISSUER,
            options={"verify_aud": False},  # public client: aud is usually "account"
        )
    except JWTError as exc:
        # Covers bad signature / expired / wrong issuer.
        raise TokenError(f"invalid token ({exc.__class__.__name__})")

    azp = claims.get("azp")
    if azp != settings.KEYCLOAK_AZP:
        raise TokenError(f"unexpected azp: {azp!r}")

    return claims


def identity_from_claims(claims: dict) -> dict:
    """Extract the platform identity from validated claims."""
    return {
        "keycloak_id": claims.get("sub"),
        "email": claims.get("email"),
        "roles": (claims.get("realm_access") or {}).get("roles", []),
    }
