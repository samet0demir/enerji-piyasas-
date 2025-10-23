/**
 * Eksik Veri Toplama - 17-22 Ekim 2025 arası
 */

import 'dotenv/config';
import { fetchMCP } from '../services/epiasClient.js';
import { insertMCPData } from '../services/database.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.join(__dirname, '../../data/energy.db');

async function fetchMissingData() {
  console.log('='.repeat(60));
  console.log('EKSIK VERI TOPLAMA - 17-22 Ekim 2025');
  console.log('='.repeat(60));

  const db = new Database(dbPath);

  try {
    // Mevcut veri aralığını kontrol et
    const existingData = db.prepare(`
      SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as total
      FROM mcp_data
    `).get() as { min_date: string; max_date: string; total: number };

    console.log('\n📊 Mevcut Veri Durumu:');
    console.log(`   Toplam kayıt: ${existingData.total}`);
    console.log(`   Tarih aralığı: ${existingData.min_date} → ${existingData.max_date}`);

    // 17-22 Ekim arası verileri çek
    const startDate = '2025-10-17';
    const endDate = '2025-10-22';

    console.log(`\n🔄 Veri çekiliyor: ${startDate} → ${endDate}`);
    console.log(`   (6 gün × 24 saat = 144 beklenen kayıt)`);

    // EPİAŞ API'den veri çek
    const response = await fetchMCP(startDate, endDate);

    console.log(`\n✅ API'den ${response.items.length} kayıt alındı`);

    // Veritabanına ekle (insertMCPData fonksiyonu kullanarak)
    const inserted = insertMCPData(response.items);

    console.log(`\n📝 Veritabanı Güncelleme Sonuçları:`);
    console.log(`   İşlenen : ${inserted} kayıt`);

    // Güncel durumu kontrol et
    const updatedData = db.prepare(`
      SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as total
      FROM mcp_data
    `).get() as { min_date: string; max_date: string; total: number };

    console.log(`\n📊 Güncel Veri Durumu:`);
    console.log(`   Toplam kayıt: ${updatedData.total}`);
    console.log(`   Tarih aralığı: ${updatedData.min_date} → ${updatedData.max_date}`);

    // Eksik tarih var mı kontrol et (17-22 Ekim arası)
    const missingDates = db.prepare(`
      WITH RECURSIVE dates(d) AS (
        VALUES('2025-10-17T00:00:00+03:00')
        UNION ALL
        SELECT datetime(d, '+1 hour')
        FROM dates
        WHERE d < '2025-10-22T23:00:00+03:00'
      )
      SELECT d
      FROM dates
      WHERE d NOT IN (SELECT date FROM mcp_data)
      LIMIT 10
    `).all();

    if (missingDates.length > 0) {
      console.log(`\n⚠️  Hala eksik tarihler var:`);
      missingDates.forEach((row: any) => {
        console.log(`   ${row.d}`);
      });
    } else {
      console.log(`\n✅ Tüm tarihler tamamlandı! (17-22 Ekim arası)`);
    }

    console.log('\n' + '='.repeat(60));

    if (inserted > 0) {
      console.log('✅ YENİ VERİ EKLENDİ - MODEL YENİDEN EĞİTİLMELİ');
      console.log('   Şimdi çalıştır:');
      console.log('   ./venv/Scripts/python.exe src/ml/train_prophet.py');
    } else {
      console.log('ℹ️  Yeni veri eklenmedi (tüm veriler zaten mevcut)');
    }

    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Ana fonksiyonu çalıştır
fetchMissingData()
  .then(() => {
    console.log('\n✅ İşlem tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ İşlem başarısız:', error);
    process.exit(1);
  });
