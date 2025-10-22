import { getDb } from './connection.js';
// Convert undefined to null for sql.js compatibility
function sanitizeParams(params) {
    return params.map(p => p === undefined ? null : p);
}
export async function queryOne(sql, params = []) {
    const db = await getDb();
    const result = db.exec(sql, sanitizeParams(params));
    if (result.length === 0 || result[0].values.length === 0)
        return undefined;
    const rows = result[0];
    const obj = {};
    rows.columns.forEach((col, i) => obj[col] = rows.values[0][i]);
    return obj;
}
export async function queryAll(sql, params = []) {
    const db = await getDb();
    const result = db.exec(sql, sanitizeParams(params));
    if (result.length === 0)
        return [];
    const rows = result[0];
    return rows.values.map((row) => {
        const obj = {};
        rows.columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}
export async function execute(sql, params = []) {
    const db = await getDb();
    db.run(sql, sanitizeParams(params));
}
export async function getLastInsertId() {
    const db = await getDb();
    const result = db.exec('SELECT last_insert_rowid()');
    return result[0].values[0][0];
}
