import json
import sqlite3
import threading

SCHEMA = """
CREATE TABLE IF NOT EXISTS activations (
  order_id   TEXT PRIMARY KEY,
  request    TEXT NOT NULL,
  result     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


class Store:
    """Hasil penerbitan per ID pesanan. PRIMARY KEY order_id menjamin satu pesanan hanya punya satu hasil."""

    def __init__(self, path: str):
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._lock = threading.Lock()
        self._conn.executescript(SCHEMA)

    def get(self, order_id: str) -> tuple[dict, list] | None:
        with self._lock:
            row = self._conn.execute("SELECT request, result FROM activations WHERE order_id = ?", (order_id,)).fetchone()
        return (json.loads(row[0]), json.loads(row[1])) if row else None

    def put(self, order_id: str, request: dict, result: list) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO activations (order_id, request, result) VALUES (?, ?, ?)",
                (order_id, json.dumps(request, sort_keys=True), json.dumps(result)),
            )

    def lock(self) -> threading.Lock:
        return self._lock
