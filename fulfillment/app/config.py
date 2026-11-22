import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    secret: str
    db_path: str
    supplier: str  # "mock" | "mock-down"
    tolerance_sec: int = 300


def load_settings() -> Settings:
    secret = os.environ.get("FULFILLMENT_SECRET", "").strip()
    if len(secret) < 16:
        raise RuntimeError("FULFILLMENT_SECRET wajib diisi (minimal 16 karakter)")
    supplier = os.environ.get("SUPPLIER", "mock").strip() or "mock"
    if supplier not in ("mock", "mock-down"):
        raise RuntimeError("SUPPLIER harus 'mock' atau 'mock-down'")
    return Settings(secret=secret, db_path=os.environ.get("FULFILLMENT_DB", "/data/fulfillment.db"), supplier=supplier)
