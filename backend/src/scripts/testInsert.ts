import 'dotenv/config';
import { fetchMCP } from '../services/epiasClient.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = path.join(__dirname, '../../data/energy.db');

async function testInsert() {
  // Fetch just one day
  const response = await fetchMCP('2025-10-17', '2025-10-17');

  if (response.items.length === 0) {
    console.log('No items received');
    return;
  }

  const item = response.items[0];
  console.log('Sample item from API:');
  console.log(`  date: "${item.date}"`);
  console.log(`  price: ${item.price}`);

  const db = new Database(dbPath);

  // Try direct insert (not OR IGNORE)
  try {
    const result = db.prepare(`
      INSERT INTO mcp_data (date, price)
      VALUES (?, ?)
    `).run(item.date, item.price);

    console.log(`\n✅ Insert successful!`);
    console.log(`  Changes: ${result.changes}`);
    console.log(`  Last ID: ${result.lastInsertRowid}`);

    // Verify
    const verify = db.prepare(`
      SELECT * FROM mcp_data WHERE date = ?
    `).get(item.date);

    console.log(`\nVerification:`);
    console.log(verify);

  } catch (error: any) {
    console.error(`\n❌ Insert failed:`);
    console.error(error.message);
  }

  db.close();
}

testInsert().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
