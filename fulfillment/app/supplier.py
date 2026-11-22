"""Adapter pemasok eSIM.

Hanya ada pemasok TIRUAN: Nomadia belum punya akun pemasok sungguhan, dan kodenya tidak terhubung ke
operator mana pun (SM-DP+ `smdp.nomadia.example` tidak ada). Antarmuka `Supplier` adalah titik sambung:
pemasok nyata cukup mengimplementasikan `issue` dan melempar `SupplierError` saat gagal.
"""
import secrets
from typing import Protocol


class SupplierError(Exception):
    """Pemasok gagal atau tidak bisa dijangkau. Pemanggil boleh mencoba lagi dengan ID pesanan yang sama."""


class Supplier(Protocol):
    def issue(self, order_id: str, product_id: str, unit: int) -> str: ...


class MockSupplier:
    def issue(self, order_id: str, product_id: str, unit: int) -> str:
        return f"LPA:1$smdp.nomadia.example${secrets.token_hex(8).upper()}"


class DownSupplier:
    """Selalu gagal. Untuk memperagakan jalur kegagalan total (SUPPLIER=mock-down)."""

    def issue(self, order_id: str, product_id: str, unit: int) -> str:
        raise SupplierError("pemasok tiruan sedang mati (SUPPLIER=mock-down)")


def make_supplier(kind: str) -> Supplier:
    return DownSupplier() if kind == "mock-down" else MockSupplier()
