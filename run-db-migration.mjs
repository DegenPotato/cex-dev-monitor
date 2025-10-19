import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

const SQL = await initSqlJs();
const buffer = readFileSync('./monitor.db');
const db = new SQL.Database(buffer);

const migrations = [
  `ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN google_account_linked BOOLEAN DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN last_activity TIMESTAMP`,
  `CREATE INDEX IF NOT EXISTS idx_users_login_count ON users(login_count)`,
  `CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)`,
  `CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity)`,
  `CREATE INDEX IF NOT EXISTS idx_users_google_linked ON users(google_account_linked)`
];

migrations.forEach((sql, i) => {
  try {
    db.run(sql);
    console.log(`✅ Migration ${i + 1}/${migrations.length} executed`);
  } catch (err) {
    if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
      console.log(`⏭️  Migration ${i + 1}/${migrations.length} already exists`);
    } else {
      console.error(`❌ Migration ${i + 1} failed:`, err.message);
    }
  }
});

const data = db.export();
writeFileSync('./monitor.db', data);
console.log('✅ Database saved');
db.close();
console.log('✅ Migration complete!');
