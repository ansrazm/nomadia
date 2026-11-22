import base64
import io
import threading

import qrcode
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from .config import Settings, load_settings
from .security import verify
from .store import Store
from .supplier import Supplier, SupplierError, make_supplier


class Item(BaseModel):
    productId: str = Field(min_length=1, max_length=100)
    productName: str = Field(min_length=1, max_length=200)
    qty: int = Field(ge=1, le=20)


class IssueRequest(BaseModel):
    orderId: str = Field(min_length=1, max_length=64)
    items: list[Item] = Field(min_length=1, max_length=50)


def qr_png_base64(code: str) -> str:
    img = qrcode.make(code, box_size=6, border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def create_app(settings: Settings | None = None, supplier: Supplier | None = None, store: Store | None = None) -> FastAPI:
    cfg = settings or load_settings()
    sup = supplier or make_supplier(cfg.supplier)
    st = store or Store(cfg.db_path)
    app = FastAPI(title="Nomadia fulfillment", version="0.1.0")
    # Satu penerbitan per pesanan pada satu waktu: panggilan ganda bersamaan tidak boleh menerbitkan dua set kode.
    order_locks: dict[str, threading.Lock] = {}
    guard = threading.Lock()

    def lock_for(order_id: str) -> threading.Lock:
        with guard:
            return order_locks.setdefault(order_id, threading.Lock())

    async def authed_body(request: Request) -> bytes:
        body = await request.body()
        ok = verify(
            cfg.secret,
            request.headers.get("x-nomadia-timestamp", ""),
            body,
            request.headers.get("x-nomadia-signature", ""),
            cfg.tolerance_sec,
        )
        if not ok:
            raise HTTPException(status_code=401, detail="Tanda tangan tidak sah atau kedaluwarsa.")
        return body

    @app.get("/health")
    def health():
        return {"status": "ok", "supplier": cfg.supplier}

    @app.post("/v1/activations")
    def issue(body: bytes = Depends(authed_body)):
        try:
            req = IssueRequest.model_validate_json(body)
        except Exception as e:  # pydantic.ValidationError
            raise HTTPException(status_code=422, detail=str(e)[:300])
        canonical = req.model_dump()

        with lock_for(req.orderId):
            prior = st.get(req.orderId)
            if prior:
                prior_req, result = prior
                if prior_req != canonical:
                    raise HTTPException(status_code=409, detail="Pesanan ini sudah diproses dengan isi yang berbeda.")
                return {"orderId": req.orderId, "status": "issued", "replay": True, "activations": result}

            out: list[dict] = []
            try:
                for item in req.items:
                    for unit in range(1, item.qty + 1):
                        code = sup.issue(req.orderId, item.productId, unit)
                        out.append({"productId": item.productId, "productName": item.productName, "unit": unit, "code": code, "qrPng": qr_png_base64(code)})
            except SupplierError as e:
                # Tidak ada yang disimpan: percobaan ulang menerbitkan dari awal, tanpa kode setengah jadi.
                raise HTTPException(status_code=502, detail=f"Pemasok gagal: {e}")
            st.put(req.orderId, canonical, out)
            return {"orderId": req.orderId, "status": "issued", "replay": False, "activations": out}

    return app
