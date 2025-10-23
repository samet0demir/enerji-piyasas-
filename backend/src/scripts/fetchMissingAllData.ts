/**
 * Eksik TÜM Veri Toplama - 17-22 Ekim 2025 arası
 * MCP + Generation + Consumption
 */

import 'dotenv/config';
import { fetchMCP, fetchGeneration, fetchConsumption } from '../services/epiasClient.js';
import { insertMCPData, insertGenerationData, insertConsumptionData } from '../services/database.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.join(__dirname, '../../data/energy.db');
const logDir = path.join(__dirname, '../../logs');
const logFile = path.join(logDir, 'fetch-all-data.log');

// Log klasörünü oluştur
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Log mesajını hem konsola hem dosyaya yaz
 */
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

/**
 * Ana fonksiyon
 */
async function fetchAllMissingData() {
  log('='.repeat(60));
  log('TUM VERİ TOPLAMA - 17-22 Ekim 2025');
  log('='.repeat(60));

  const db = new Database(dbPath);

  try {
    // Tarih aralığı
    const startDate = '2025-10-17';
    const endDate = '2025-10-22';

    log(`Tarih Araligi: ${startDate} - ${endDate}`);
    log(`Toplam: 6 gun x 24 saat = 144 saat\n`);

    // ========================================
    // 1. MCP (Fiyat) Verisi
    // ========================================
    log('-'.repeat(60));
    log('1. MCP (FIYAT) VERISI');
    log('-'.repeat(60));

    try {
      const currentMCP = db.prepare(`
        SELECT COUNT(*) as count
        FROM mcp_data
        WHERE date >= ?
          AND date < datetime(?, '+1 day')
      `).get(startDate + 'T00:00:00+03:00', endDate) as { count: number };

      log(`Mevcut MCP kaydi: ${currentMCP.count}`);

      if (currentMCP.count >= 144) {
        log('MCP verileri zaten tam. Atlanıyor...');
      } else {
        log('MCP verileri cekiliyor...');
        const mcpResponse = await fetchMCP(startDate, endDate);
        log(`API'den ${mcpResponse.items.length} kayit alindi`);

        const insertedMCP = insertMCPData(mcpResponse.items);
        log(`✅ ${insertedMCP} MCP kaydi eklendi`);
      }
    } catch (error) {
      log(`❌ MCP hatasi: ${error}`);
    }

    // ========================================
    // 2. Generation (Üretim) Verisi
    // ========================================
    log('\n' + '-'.repeat(60));
    log('2. GENERATION (URETIM) VERISI');
    log('-'.repeat(60));

    try {
      const currentGen = db.prepare(`
        SELECT COUNT(*) as count
        FROM generation_data
        WHERE date >= ?
          AND date < datetime(?, '+1 day')
      `).get(startDate + 'T00:00:00+03:00', endDate) as { count: number };

      log(`Mevcut Generation kaydi: ${currentGen.count}`);

      if (currentGen.count >= 144) {
        log('Generation verileri zaten tam. Atlanıyor...');
      } else {
        log('Generation verileri cekiliyor...');
        log('NOT: 6 gunluk veri, API limiti (30 gun) icinde.');

        const genResponse = await fetchGeneration(startDate, endDate);
        log(`API'den ${genResponse.items.length} kayit alindi`);

        const insertedGen = insertGenerationData(genResponse.items);
        log(`✅ ${insertedGen} Generation kaydi eklendi`);
      }
    } catch (error) {
      log(`❌ Generation hatasi: ${error}`);
    }

    // ========================================
    // 3. Consumption (Tüketim) Verisi
    // ========================================
    log('\n' + '-'.repeat(60));
    log('3. CONSUMPTION (TUKETIM) VERISI');
    log('-'.repeat(60));

    try {
      const currentCons = db.prepare(`
        SELECT COUNT(*) as count
        FROM consumption_data
        WHERE date >= ?
          AND date < datetime(?, '+1 day')
      `).get(startDate + 'T00:00:00+03:00', endDate) as { count: number };

      log(`Mevcut Consumption kaydi: ${currentCons.count}`);

      if (currentCons.count >= 144) {
        log('Consumption verileri zaten tam. Atlanıyor...');
      } else {
        log('Consumption verileri cekiliyor...');

        const consResponse = await fetchConsumption(startDate, endDate);
        log(`API'den ${consResponse.items.length} kayit alindi`);

        const insertedCons = insertConsumptionData(consResponse.items);
        log(`✅ ${insertedCons} Consumption kaydi eklendi`);
      }
    } catch (error) {
      log(`❌ Consumption hatasi: ${error}`);
    }

    // ========================================
    // ÖZET
    // ========================================
    log('\n' + '='.repeat(60));
    log('TOPLAMA TAMAMLANDI');
    log('='.repeat(60));

    // Son durumu kontrol et
    const finalMCP = db.prepare('SELECT COUNT(*) as count FROM mcp_data').get() as { count: number };
    const finalGen = db.prepare('SELECT COUNT(*) as count FROM generation_data').get() as { count: number };
    const finalCons = db.prepare('SELECT COUNT(*) as count FROM consumption_data').get() as { count: number };

    log(`Toplam MCP kaydi: ${finalMCP.count}`);
    log(`Toplam Generation kaydi: ${finalGen.count}`);
    log(`Toplam Consumption kaydi: ${finalCons.count}`);

    log('='.repeat(60));

  } catch (error) {
    log('='.repeat(60));
    log('❌ GENEL HATA OLUSTU');
    log(`Hata: ${error}`);

    if (error instanceof Error) {
      log(`Stack: ${error.stack}`);
    }

    log('='.repeat(60));
    throw error;
  } finally {
    db.close();
  }
}

// Script direkt çalıştırıldığında
fetchAllMissingData()
  .then(() => {
    log('Islem tamamlandi');
    process.exit(0);
  })
  .catch((error) => {
    log('Islem basarisiz');
    console.error(error);
    process.exit(1);
  });

export { fetchAllMissingData };
