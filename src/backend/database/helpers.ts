import { getDb } from './connection.js';

// Convert undefined to null for sql.js compatibility
function sanitizeParams(params: any[]): any[] {
  return params.map(p => p === undefined ? null : p);
}

export async function queryOne<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  const db = await getDb();
  const result = db.exec(sql, sanitizeParams(params));
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  
  const rows = result[0];
  const obj: any = {};
  rows.columns.forEach((col: string, i: number) => obj[col] = rows.values[0][i]);
  return obj as T;
}

export async function queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  const result = db.exec(sql, sanitizeParams(params));
  if (result.length === 0) return [];
  
  const rows = result[0];
  return rows.values.map((row: any[]) => {
    const obj: any = {};
    rows.columns.forEach((col: string, i: number) => obj[col] = row[i]);
    return obj as T;
  });
}

export async function execute(sql: string, params: any[] = []): Promise<void> {
  const db = await getDb();
  db.run(sql, sanitizeParams(params));
}

export async function getLastInsertId(): Promise<number> {
  const db = await getDb();
  const result = db.exec('SELECT last_insert_rowid()');
  return result[0].values[0][0] as number;
}
