import 'dotenv/config';
import { fetchMCP } from '../services/epiasClient.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = path.join(__dirname, '../../data/energy.db');

async function debugDateFormat() {
  const db = new Database(dbPath);

  // Check existing date format
  console.log('📊 Mevcut veritabanındaki tarih formatı:');
  const existingSample = db.prepare('SELECT date FROM mcp_data ORDER BY date DESC LIMIT 3').all();
  existingSample.forEach((row: any) => {
    console.log(`   DB: "${row.date}"`);
  });

  // Fetch one record from API
  console.log('\n🔄 API\'den gelen tarih formatı:');
  const response = await fetchMCP('2025-10-17', '2025-10-17');

  if (response.items.length > 0) {
    const item = response.items[0];
    console.log(`   API raw: "${item.date}"`);

    // Try different conversions
    const date = new Date(item.date);
    console.log(`   new Date(): "${date.toISOString()}"`);
    console.log(`   Replace T: "${date.toISOString().replace('T', ' ').split('.')[0]}"`);
    console.log(`   toLocaleString: "${date.toLocaleString('sv-SE').replace(',', '')}"`);
  }

  db.close();
}

debugDateFormat().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
