import hashlib
import hmac
import time


def sign(secret: str, timestamp: str, body: bytes) -> str:
    """sha256=HMAC(secret, "<timestamp>.<body>"): skema yang sama dengan webhook Nomadia ke n8n."""
    mac = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


def verify(secret: str, timestamp: str, body: bytes, signature: str, tolerance_sec: int = 300, now: float | None = None) -> bool:
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs((now if now is not None else time.time()) - ts) > tolerance_sec:
        return False
    return hmac.compare_digest(sign(secret, timestamp, body), signature or "")
