/**
 * EPİAŞ API'sinden veri doğrulama servisi
 * Veritabanındaki değerleri EPİAŞ API ile karşılaştırır
 */

import axios from 'axios';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../data/energy.db');

interface EPIASMCPResponse {
  items: Array<{
    date: string;
    price: number;
    priceUsd: number;
    priceEur: number;
  }>;
}

interface VerificationResult {
  date: string;
  hour: string;
  dbPrice: number;
  apiPrice: number | null;
  match: boolean;
  error?: string;
}

/**
 * EPİAŞ'tan TGT al
 */
async function getTGT(): Promise<string> {
  const username = process.env.EPIAS_USERNAME || 'your_username';
  const password = process.env.EPIAS_PASSWORD || 'your_password';

  const response = await axios.post(
    'https://giris.epias.com.tr/cas/v1/tickets',
    `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const locationHeader = response.headers['location'];
  if (!locationHeader) {
    throw new Error('TGT alınamadı: Location header bulunamadı');
  }

  const tgt = locationHeader.split('/').pop();
  if (!tgt) {
    throw new Error('TGT parse edilemedi');
  }

  return tgt;
}

/**
 * Belirli bir tarihteki MCP fiyatını EPİAŞ'tan çek
 */
async function fetchMCPFromEPIAS(date: string): Promise<number | null> {
  try {
    const tgt = await getTGT();

    // Tarih formatı: 2024-03-31T00:00:00+03:00 -> 2024-03-31
    const dateOnly = date.split('T')[0];
    const startDate = `${dateOnly}T00:00:00+03:00`;
    const endDate = `${dateOnly}T23:59:59+03:00`;

    const response = await axios.post<EPIASMCPResponse>(
      'https://seffaflik.epias.com.tr/electricity-service/v1/markets/dam/data/mcp',
      {
        startDate,
        endDate,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          TGT: tgt,
        },
      }
    );

    // Aynı saati bul
    const targetHour = date.split('T')[1]?.substring(0, 5);
    const item = response.data.items.find(
      (item) => item.date === date || item.date.includes(targetHour || '')
    );

    return item?.price ?? null;
  } catch (error) {
    console.error('EPİAŞ API hatası:', error);
    return null;
  }
}

/**
 * Şüpheli kayıtları doğrula
 */
export async function verifySuspiciousPrices(): Promise<VerificationResult[]> {
  const db = new Database(dbPath);
  const results: VerificationResult[] = [];

  try {
    // 0 TRY ve çok düşük fiyatları çek
    const stmt = db.prepare(`
      SELECT date, hour, price
      FROM mcp_data
      WHERE price < 100
      ORDER BY price ASC
      LIMIT 20
    `);

    const records = stmt.all() as Array<{
      date: string;
      hour: string;
      price: number;
    }>;

    console.log(`\n🔍 ${records.length} şüpheli kayıt doğrulanıyor...\n`);

    for (const record of records) {
      console.log(`Kontrol ediliyor: ${record.date} (${record.price} TRY)`);

      const apiPrice = await fetchMCPFromEPIAS(record.date);

      const result: VerificationResult = {
        date: record.date,
        hour: record.hour,
        dbPrice: record.price,
        apiPrice,
        match: apiPrice !== null && Math.abs(apiPrice - record.price) < 0.01,
      };

      if (apiPrice === null) {
        result.error = 'API çağrısı başarısız';
      }

      results.push(result);

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    db.close();
  }

  return results;
}

/**
 * Doğrulama raporunu yazdır
 */
function printVerificationReport(results: VerificationResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('EPİAŞ VERİ DOĞRULAMA RAPORU');
  console.log('='.repeat(80));

  let matchCount = 0;
  let mismatchCount = 0;
  let errorCount = 0;

  console.log(
    `\n${'Tarih'.padEnd(25)} ${'DB Fiyat'.padEnd(12)} ${'API Fiyat'.padEnd(12)} ${'Durum'}`
  );
  console.log('-'.repeat(80));

  for (const result of results) {
    const dbPrice = result.dbPrice.toFixed(2).padEnd(10);
    const apiPrice = result.apiPrice?.toFixed(2).padEnd(10) ?? 'HATA'.padEnd(10);
    let status = '';

    if (result.error) {
      status = `❌ ${result.error}`;
      errorCount++;
    } else if (result.match) {
      status = '✅ EŞLEŞIYOR';
      matchCount++;
    } else {
      status = `⚠️  FARKLI (Fark: ${Math.abs(
        (result.apiPrice ?? 0) - result.dbPrice
      ).toFixed(2)} TRY)`;
      mismatchCount++;
    }

    console.log(`${result.date.padEnd(25)} ${dbPrice} ${apiPrice} ${status}`);
  }

  console.log('-'.repeat(80));
  console.log(`\n📊 Özet:`);
  console.log(`   ✅ Eşleşen       : ${matchCount} kayıt`);
  console.log(`   ⚠️  Farklı        : ${mismatchCount} kayıt`);
  console.log(`   ❌ Hata          : ${errorCount} kayıt`);

  console.log('\n💡 Değerlendirme:');
  if (matchCount > results.length * 0.9) {
    console.log(
      '   ✅ VERİLER DOĞRU: %90+ eşleşme var, veri tabanındaki değerler güvenilir.'
    );
    console.log('   → 0 TRY fiyatlar GERÇEK piyasa durumudur.');
    console.log('   → Model iyileştirmesi önerilir (extreme price handling).');
  } else if (matchCount > results.length * 0.5) {
    console.log(
      '   ⚠️  KISMİ SORUN: %50-90 arası eşleşme, bazı kayıtlar şüpheli.'
    );
    console.log('   → Manuel kontrol önerilir.');
  } else {
    console.log('   ❌ CİDDİ SORUN: %50\'den az eşleşme, veri kaynağı hatalı olabilir.');
    console.log('   → API endpoint değişikliği veya veri temizleme gerekli.');
  }

  console.log('='.repeat(80));
}

// CLI kullanımı
if (require.main === module) {
  console.log('🚀 EPİAŞ Veri Doğrulama Başlatılıyor...');
  console.log('⚠️  NOT: Bu işlem 20+ API çağrısı yapacak, ~30 saniye sürebilir.\n');

  verifySuspiciousPrices()
    .then((results) => {
      printVerificationReport(results);
    })
    .catch((error) => {
      console.error('\n❌ Doğrulama hatası:', error.message);
      process.exit(1);
    });
}

export { VerificationResult };
