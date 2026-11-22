#!/usr/bin/env bash
# Uji end-to-end lintas layanan untuk alur penerbitan eSIM: proses sungguhan (PostgreSQL, API Hono, FastAPI),
# kecuali n8n yang diganti penerima palsu (scripts/fake-n8n.mjs, memverifikasi tanda tangan HMAC).
# Butuh: bash, psql, node 22 + `npm ci` di api/, python3 + `pip install -r fulfillment/requirements.txt`.
# Jalan di CI; lokal di Linux, macOS, WSL, atau Git Bash. Keluar dengan kode 1 bila ada asersi yang gagal.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
ADMIN_DB="${E2E_ADMIN_DB_URL:-postgres://nomadia:nomadia@localhost:5432/postgres}"
export DATABASE_URL="${ADMIN_DB%/*}/nomadia_e2e"
export PORT=4010
export N8N_WEBHOOK_URL=http://127.0.0.1:5679/webhook/x
export N8N_WEBHOOK_SECRET=n8n-secret-0123456789
export FULFILLMENT_URL=http://127.0.0.1:8010
export FULFILLMENT_SECRET=fulfillment-secret-0123456789
export ADMIN_EMAIL=admin@nomadia.test ADMIN_PASSWORD=kata-sandi-panjang-123
export AUTH_SECRET=ssssssssssssssssssssssssssssssssssssssss
export RATE_LIMIT=off
export FAKE_N8N_EVENTS="$WORK/events.jsonl"
touch "$FAKE_N8N_EVENTS"

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && { pkill -TERM -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; }; done; rm -rf "$WORK"; }
trap cleanup EXIT

FAILS=0
check() { if "${@:2}"; then echo "  ok     $1"; else echo "  GAGAL  $1"; FAILS=$((FAILS+1)); fi; }
q() { psql "$DATABASE_URL" -qAtX -c "$1"; }
ev_count() { python3 - "$FAKE_N8N_EVENTS" "$1" "$2" <<'PY'
import json,sys
f,order,event=sys.argv[1:4]
print(sum(1 for l in open(f) if l.strip() and json.loads(l)["orderId"]==order and json.loads(l)["event"]==event))
PY
}
ev_codes() { python3 - "$FAKE_N8N_EVENTS" "$1" "$2" <<'PY'
import json,sys
f,order,event=sys.argv[1:4]
for l in open(f):
    if l.strip():
        j=json.loads(l)
        if j["orderId"]==order and j["event"]==event: print(len(j["codes"]), len(set(j["codes"])), all(c.startswith("LPA:1$") for c in j["codes"]))
PY
}
wait_for() { # wait_for <detik> <perintah...>: ulangi sampai berhasil; menggeser jatuh tempo retry supaya tes tidak menunggu backoff
  local t=$1; shift; local end=$((SECONDS+t))
  while [ $SECONDS -lt $end ]; do
    "$@" && return 0
    q "UPDATE fulfillments SET next_attempt_at = now() - interval '1 second' WHERE status='pending'" >/dev/null 2>&1
    sleep 2
  done; return 1
}
http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

start_ff() { # start_ff <mock|mock-down>
  ( cd "$ROOT/fulfillment" && FULFILLMENT_DB="$WORK/fulfillment.db" SUPPLIER="$1" exec python3 -m uvicorn app.asgi:app --host 127.0.0.1 --port 8010 >"$WORK/fastapi-$1.log" 2>&1 ) &
  FF_PID=$!; PIDS+=("$FF_PID")
  for _ in $(seq 1 40); do curl -sf -m1 http://127.0.0.1:8010/health >/dev/null && return 0; sleep 0.5; done
  echo "FastAPI tidak naik:"; cat "$WORK/fastapi-$1.log"; exit 1
}

echo "== menyiapkan database dan layanan"
psql "$ADMIN_DB" -qAtX -c "DROP DATABASE IF EXISTS nomadia_e2e" -c "CREATE DATABASE nomadia_e2e" >/dev/null || { echo "tidak bisa membuat database (E2E_ADMIN_DB_URL?)"; exit 1; }
( exec node "$ROOT/scripts/fake-n8n.mjs" >"$WORK/n8n.log" 2>&1 ) & PIDS+=("$!")
start_ff mock-down
( cd "$ROOT/api" && exec ./node_modules/.bin/tsx src/server.ts >"$WORK/api.log" 2>&1 ) & PIDS+=("$!")
for _ in $(seq 1 60); do curl -sf -m1 http://127.0.0.1:4010/health >/dev/null && break; sleep 0.5; done
curl -sf -m2 http://127.0.0.1:4010/health >/dev/null || { echo "API tidak naik:"; cat "$WORK/api.log"; exit 1; }

DEP="$(date -d '+30 days' +%F 2>/dev/null || date -v+30d +%F)"
mkorder() { curl -s -X POST http://127.0.0.1:4010/orders -H 'content-type: application/json' -d "{\"name\":\"Budi\",\"email\":\"budi@example.com\",\"phone\":\"081234567890\",\"departureDate\":\"$DEP\",\"delivery\":{\"method\":\"ship\",\"address\":{\"recipient\":\"Budi\",\"street\":\"Jl. Merdeka 12\",\"district\":\"Sukajadi\",\"city\":\"Pekanbaru\",\"province\":\"Riau\",\"postalCode\":\"28111\"}},\"items\":[{\"productId\":\"$1\",\"qty\":$2}]}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['orderId'])"; }
markpaid() { ( cd "$ROOT/api" && ./node_modules/.bin/tsx src/dev/mark-paid.ts "$1" >/dev/null 2>&1 ); }
is_manual() { [ "$(q "SELECT status FROM fulfillments WHERE order_id='$1'")" = "manual_pending" ]; }
is_issued() { [ "$(q "SELECT status FROM fulfillments WHERE order_id='$1'")" = "issued" ]; }
has_event() { [ "$(ev_count "$1" "$2")" -ge 1 ]; }
no_event() { [ "$(ev_count "$1" "$2")" -eq 0 ]; }
order_paid() { [ "$(q "SELECT status FROM orders WHERE id='$1'")" = "paid" ]; }

echo; echo "== A. pemasok mati total"
ESIM="$(mkorder jepang-esim-7 2)"; WIFI="$(mkorder singapura-wifi-3 1)"
markpaid "$ESIM"; markpaid "$WIFI"
check "eSIM masuk manual_pending setelah semua percobaan" wait_for 120 is_manual "$ESIM"
check "pesanan eSIM TETAP lunas" order_paid "$ESIM"
check "peringatan order.fulfillment_failed terkirim ke n8n" wait_for 40 has_event "$ESIM" order.fulfillment_failed
check "TIDAK ada order.paid (pelanggan belum dapat email kode)" no_event "$ESIM" order.paid
check "pesanan SIM/WiFi fisik tidak terpengaruh: order.paid tanpa kode" wait_for 40 has_event "$WIFI" order.paid

echo; echo "== B. pemasok pulih, admin menerbitkan ulang"
kill "$FF_PID" 2>/dev/null; wait "$FF_PID" 2>/dev/null; start_ff mock
TOKEN="$(curl -s -X POST http://127.0.0.1:4010/admin/login -H 'content-type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")"
check "tanpa token ditolak 401" [ "$(http_code http://127.0.0.1:4010/admin/fulfillments)" = "401" ]
check "daftar manual_pending memuat pesanan" bash -c "curl -s 'http://127.0.0.1:4010/admin/fulfillments?status=manual_pending' -H 'Authorization: Bearer $TOKEN' | grep -q '$ESIM'"
check "retry admin diterima 200" [ "$(http_code -X POST "http://127.0.0.1:4010/admin/orders/$ESIM/fulfillment/retry" -H "Authorization: Bearer $TOKEN")" = "200" ]
check "penerbitan selesai (issued)" wait_for 60 is_issued "$ESIM"
check "order.paid terkirim ke n8n setelah kode terbit" wait_for 40 has_event "$ESIM" order.paid
check "order.paid membawa 2 kode berbeda berformat LPA" [ "$(ev_codes "$ESIM" order.paid)" = "2 2 True" ]
check "retry kedua ditolak 409" [ "$(http_code -X POST "http://127.0.0.1:4010/admin/orders/$ESIM/fulfillment/retry" -H "Authorization: Bearer $TOKEN")" = "409" ]

echo; echo "== C. jalur normal"
OK="$(mkorder jepang-esim-7 1)"; markpaid "$OK"
check "terbit (issued)" wait_for 60 is_issued "$OK"
check "order.paid membawa 1 kode" bash -c "wait=0; for _ in \$(seq 1 20); do [ \"\$(python3 - '$FAKE_N8N_EVENTS' '$OK' <<'PY'
import json,sys
print(next((len(json.loads(l)['codes']) for l in open(sys.argv[1]) if l.strip() and json.loads(l)['orderId']==sys.argv[2] and json.loads(l)['event']=='order.paid'), -1))
PY
)\" = 1 ] && exit 0; sleep 1; done; exit 1"

echo; echo "== D. idempotency di FastAPI"
BODY="{\"orderId\":\"$OK\",\"items\":[{\"productId\":\"jepang-esim-7\",\"productName\":\"beda\",\"qty\":1}]}"
TS="$(date +%s)"
SIG="sha256=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$FULFILLMENT_SECRET" | sed 's/^.* //')"
check "ID pesanan sama dengan isi berbeda ditolak 409" [ "$(http_code -X POST http://127.0.0.1:8010/v1/activations -H 'content-type: application/json' -H "X-Nomadia-Timestamp: $TS" -H "X-Nomadia-Signature: $SIG" -d "$BODY")" = "409" ]
check "tanda tangan salah ditolak 401" [ "$(http_code -X POST http://127.0.0.1:8010/v1/activations -H 'content-type: application/json' -H "X-Nomadia-Timestamp: $TS" -H "X-Nomadia-Signature: sha256=salah" -d "$BODY")" = "401" ]

echo
if [ "$FAILS" -eq 0 ]; then echo "E2E fulfillment: SEMUA LULUS"; else echo "E2E fulfillment: $FAILS asersi GAGAL"; echo "--- log API:"; tail -30 "$WORK/api.log"; exit 1; fi
