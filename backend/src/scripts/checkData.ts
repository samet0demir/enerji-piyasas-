import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = path.join(__dirname, '../../data/energy.db');

const db = new Database(dbPath);

// Check if Oct 17-22 data exists
console.log('Checking for Oct 17-22 data...\n');

const oct17Count = db.prepare(`
  SELECT COUNT(*) as count
  FROM mcp_data
  WHERE date >= '2025-10-17T00:00:00+03:00'
    AND date <= '2025-10-22T23:59:59+03:00'
`).get() as { count: number };

console.log(`Records between Oct 17-22: ${oct17Count.count} (expected: 144)`);

if (oct17Count.count > 0) {
  console.log('\nSample records:');
  const samples = db.prepare(`
    SELECT date, price
    FROM mcp_data
    WHERE date >= '2025-10-17T00:00:00+03:00'
      AND date <= '2025-10-22T23:59:59+03:00'
    ORDER BY date
    LIMIT 5
  `).all();

  samples.forEach((row: any) => {
    console.log(`  ${row.date}: ${row.price} TRY`);
  });
} else {
  console.log('\n❌ No data found for Oct 17-22!');
  console.log('\nLast 5 records in database:');
  const last = db.prepare(`
    SELECT date, price
    FROM mcp_data
    ORDER BY date DESC
    LIMIT 5
  `).all();

  last.forEach((row: any) => {
    console.log(`  ${row.date}: ${row.price} TRY`);
  });
}

db.close();
