/**
 * Catch-up Sync Script
 *
 * Bilgisayar kapalı olduğunda kaybedilen verileri otomatik çeker.
 * Database'deki en son tarihi bulur ve bugüne kadar eksik günleri doldurur.
 *
 * Kullanım:
 *   npx tsx src/scripts/catchUpSync.ts
 */

import Database from 'better-sqlite3';
import { fetchMCP, fetchGeneration, fetchConsumption } from '../services/epiasClient.js';
import { insertMCPData, insertGenerationData, insertConsumptionData } from '../services/database.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, '../../logs/catch-up-sync.log');

// Log fonksiyonu
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  // Log dosyasına yaz
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

/**
 * Database'deki en son tarihi bulur
 */
function getLastDate(db: Database.Database): string | null {
  const result = db.prepare(`
    SELECT MAX(date) as last_date
    FROM mcp_data
  `).get() as { last_date: string | null };

  return result.last_date;
}

/**
 * İki tarih arasındaki günleri hesaplar
 */
function getDaysBetween(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  // Son günü dahil etme (çünkü o gün henüz tamamlanmamış olabilir)
  while (current < end) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Tarihleri 30 günlük parçalara böler (Generation API limiti için)
 */
function chunkDates(dates: string[], chunkSize: number = 30): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += chunkSize) {
    chunks.push(dates.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Catch-up sync - Eksik günleri doldurur
 */
async function catchUpSync() {
  log('============================================================');
  log('CATCH-UP SYNC - Eksik Gun Doldurma');
  log('============================================================');

  const dbPath = path.join(__dirname, '../../data/energy.db');
  const db = Database(dbPath);

  try {
    // 1. En son tarihi bul
    const lastDate = getLastDate(db);

    if (!lastDate) {
      log('UYARI: Database bos! Tam veri toplama scripti calistirin.');
      return;
    }

    log(`En son veri tarihi: ${lastDate}`);

    // 2. Bir gün sonrasından başla (son gün zaten var)
    const startDate = new Date(lastDate);
    startDate.setDate(startDate.getDate() + 1);
    const startDateStr = startDate.toISOString().split('T')[0];

    // 3. Bugünün tarihini al (ama bugünü dahil etme, çünkü henüz tamamlanmamış)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    log(`Kontrol araligi: ${startDateStr} - ${todayStr}`);

    // 4. Eksik günleri hesapla
    const missingDays = getDaysBetween(startDateStr, todayStr);

    if (missingDays.length === 0) {
      log('✅ Eksik gun yok! Database guncel.');
      return;
    }

    log(`⚠️  ${missingDays.length} eksik gun bulundu: ${missingDays[0]} - ${missingDays[missingDays.length - 1]}`);

    // 5. MCP verileri çek (1 yıl limiti var ama bizim max 365 gün eksik olamaz)
    if (missingDays.length > 0) {
      log('------------------------------------------------------------');
      log('MCP (FIYAT) VERISI CEKILIYOR...');
      log('------------------------------------------------------------');

      try {
        const mcpResponse = await fetchMCP(missingDays[0], missingDays[missingDays.length - 1]);
        const insertedMCP = insertMCPData(mcpResponse.items);
        log(`✅ ${insertedMCP} MCP kaydi eklendi`);
      } catch (error) {
        log(`❌ MCP verisi cekilemedi: ${error}`);
      }
    }

    // 6. Generation verileri çek (30 günlük parçalara böl)
    log('------------------------------------------------------------');
    log('GENERATION (URETIM) VERISI CEKILIYOR...');
    log('------------------------------------------------------------');

    const generationChunks = chunkDates(missingDays, 30);
    log(`${generationChunks.length} parca halinde cekilecek (API limiti 30 gun)`);

    let totalGeneration = 0;
    for (let i = 0; i < generationChunks.length; i++) {
      const chunk = generationChunks[i];
      const chunkStart = chunk[0];
      const chunkEnd = chunk[chunk.length - 1];

      log(`Parca ${i + 1}/${generationChunks.length}: ${chunkStart} - ${chunkEnd}`);

      try {
        const genResponse = await fetchGeneration(chunkStart, chunkEnd);
        const insertedGen = insertGenerationData(genResponse.items);
        totalGeneration += insertedGen;
        log(`✅ ${insertedGen} Generation kaydi eklendi`);

        // Rate limiting için kısa bekleme
        if (i < generationChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        log(`❌ Generation verisi cekilemedi (Parca ${i + 1}): ${error}`);
      }
    }

    log(`Toplam ${totalGeneration} Generation kaydi eklendi`);

    // 7. Consumption verileri çek (1 yıl limiti var)
    log('------------------------------------------------------------');
    log('CONSUMPTION (TUKETIM) VERISI CEKILIYOR...');
    log('------------------------------------------------------------');

    try {
      const consResponse = await fetchConsumption(missingDays[0], missingDays[missingDays.length - 1]);
      const insertedCons = insertConsumptionData(consResponse.items);
      log(`✅ ${insertedCons} Consumption kaydi eklendi`);
    } catch (error) {
      log(`❌ Consumption verisi cekilemedi: ${error}`);
    }

    // 8. Özet
    log('============================================================');
    log('CATCH-UP SYNC TAMAMLANDI');
    log('============================================================');

    const finalCount = db.prepare('SELECT COUNT(*) as count FROM mcp_data').get() as { count: number };
    log(`Toplam MCP kaydi: ${finalCount.count}`);

    const finalGenCount = db.prepare('SELECT COUNT(*) as count FROM generation_data').get() as { count: number };
    log(`Toplam Generation kaydi: ${finalGenCount.count}`);

    const finalConsCount = db.prepare('SELECT COUNT(*) as count FROM consumption_data').get() as { count: number };
    log(`Toplam Consumption kaydi: ${finalConsCount.count}`);

    log('============================================================');

  } catch (error) {
    log(`❌ HATA: ${error}`);
    throw error;
  } finally {
    db.close();
  }
}

// Script çalıştır
catchUpSync()
  .then(() => {
    log('Catch-up sync tamamlandi');
    process.exit(0);
  })
  .catch((error) => {
    log('Catch-up sync basarisiz');
    console.error(error);
    process.exit(1);
  });

export { catchUpSync };
