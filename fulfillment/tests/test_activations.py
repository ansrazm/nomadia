import json
import threading
import time

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.security import sign
from app.store import Store
from app.supplier import MockSupplier, SupplierError

SECRET = "fulfillment-secret-0123456789"


class CountingSupplier(MockSupplier):
    def __init__(self):
        self.calls = 0

    def issue(self, order_id, product_id, unit):
        self.calls += 1
        return super().issue(order_id, product_id, unit)


class FlakySupplier(MockSupplier):
    """Gagal pada panggilan ke-`fail_on`, sukses selain itu."""

    def __init__(self, fail_on):
        self.n = 0
        self.fail_on = fail_on

    def issue(self, order_id, product_id, unit):
        self.n += 1
        if self.n == self.fail_on:
            raise SupplierError("putus di tengah")
        return super().issue(order_id, product_id, unit)


def make(tmp_path, supplier=None):
    cfg = Settings(secret=SECRET, db_path=str(tmp_path / "f.db"), supplier="mock")
    sup = supplier or CountingSupplier()
    return TestClient(create_app(cfg, sup, Store(cfg.db_path))), sup


def post(client, payload, secret=SECRET, ts=None, raw=None):
    body = raw if raw is not None else json.dumps(payload).encode()
    ts = str(int(time.time())) if ts is None else ts
    return client.post("/v1/activations", content=body, headers={"X-Nomadia-Timestamp": ts, "X-Nomadia-Signature": sign(secret, ts, body), "Content-Type": "application/json"})


ORDER = {"orderId": "NMD-AAA11111", "items": [{"productId": "esim-jp-7", "productName": "eSIM Jepang 7 hari", "qty": 2}]}


def test_health_tanpa_auth(tmp_path):
    c, _ = make(tmp_path)
    assert c.get("/health").json()["status"] == "ok"


def test_menerbitkan_satu_kode_per_unit_dengan_qr(tmp_path):
    c, sup = make(tmp_path)
    r = post(c, ORDER)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "issued" and j["replay"] is False
    assert [a["unit"] for a in j["activations"]] == [1, 2]
    assert all(a["code"].startswith("LPA:1$") and a["qrPng"] for a in j["activations"])
    assert j["activations"][0]["code"] != j["activations"][1]["code"]
    assert sup.calls == 2


def test_idempotent_panggilan_ulang_mengembalikan_kode_yang_sama(tmp_path):
    c, sup = make(tmp_path)
    first = post(c, ORDER).json()
    again = post(c, ORDER).json()
    assert again["replay"] is True
    assert [a["code"] for a in again["activations"]] == [a["code"] for a in first["activations"]]
    assert sup.calls == 2  # pemasok tidak dipanggil lagi


def test_pesanan_sama_isi_beda_ditolak_409(tmp_path):
    c, _ = make(tmp_path)
    post(c, ORDER)
    changed = {**ORDER, "items": [{**ORDER["items"][0], "qty": 3}]}
    assert post(c, changed).status_code == 409


def test_panggilan_bersamaan_hanya_menerbitkan_sekali(tmp_path):
    c, sup = make(tmp_path)
    results = []

    def go():
        results.append(post(c, ORDER).json())

    ts = [threading.Thread(target=go) for _ in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sup.calls == 2
    assert len({tuple(a["code"] for a in r["activations"]) for r in results}) == 1


def test_kegagalan_pemasok_502_dan_tidak_menyimpan_setengah_jadi(tmp_path):
    sup = FlakySupplier(fail_on=2)
    c, _ = make(tmp_path, sup)
    assert post(c, ORDER).status_code == 502
    ok = post(c, ORDER)  # percobaan ulang: menerbitkan dari awal
    assert ok.status_code == 200 and ok.json()["replay"] is False
    assert len(ok.json()["activations"]) == 2


@pytest.mark.parametrize("kind", ["secret_salah", "timestamp_basi", "tanpa_header"])
def test_auth_ditolak_401(tmp_path, kind):
    c, _ = make(tmp_path)
    if kind == "secret_salah":
        r = post(c, ORDER, secret="salah-salah-salah-salah")
    elif kind == "timestamp_basi":
        r = post(c, ORDER, ts=str(int(time.time()) - 3600))
    else:
        r = c.post("/v1/activations", json=ORDER)
    assert r.status_code == 401


def test_body_diubah_setelah_ditandatangani_ditolak(tmp_path):
    c, _ = make(tmp_path)
    body = json.dumps(ORDER).encode()
    ts = str(int(time.time()))
    sig = sign(SECRET, ts, body)
    tampered = json.dumps({**ORDER, "orderId": "NMD-BBB22222"}).encode()
    r = c.post("/v1/activations", content=tampered, headers={"X-Nomadia-Timestamp": ts, "X-Nomadia-Signature": sig})
    assert r.status_code == 401


def test_validasi_422(tmp_path):
    c, _ = make(tmp_path)
    assert post(c, {"orderId": "X", "items": []}).status_code == 422
    assert post(c, {"orderId": "X", "items": [{"productId": "p", "productName": "n", "qty": 0}]}).status_code == 422
    assert post(c, None, raw=b"bukan json").status_code == 422


def test_vektor_tanda_tangan_cocok_dengan_api_hono():
    # Vektor yang sama dengan api/tests/outbox.test.ts: kedua sisi harus menghasilkan tanda tangan identik.
    assert sign("n8n-secret", "1762842000", b'{"event":"order.paid"}') == "sha256=fc1b5ef029ef3fae978548abe022d6205b7038449d89b5949526e1d38fa71bea"
