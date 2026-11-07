import pg from "pg";

// Kolom DATE dibaca apa adanya ('2026-12-31'). Bawaan driver membuat Date di zona waktu server, yang bisa menggeser tanggal sehari.
pg.types.setTypeParser(1082, (v: string) => v);

export type Db = pg.Pool;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}
