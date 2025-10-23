/**
 * Veri Temizleme Servisi
 *
 * EPİAŞ API'sinden gelen hatalı verileri temizler
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../data/energy.db');

export interface CleaningReport {
  totalRecords: number;
  suspiciousRecords: number;
  correctedRecords: number;
  deletedRecords: number;
  issues: string[];
}

/**
 * Hatalı veri kontrolü ve temizleme
 */
export function cleanMCPData(): CleaningReport {
  const db = new Database(dbPath);

  const report: CleaningReport = {
    totalRecords: 0,
    suspiciousRecords: 0,
    correctedRecords: 0,
    deletedRecords: 0,
    issues: []
  };

  try {
    // Toplam kayıt sayısı
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM mcp_data');
    const { total } = countStmt.get() as { total: number };
    report.totalRecords = total;

    // Şüpheli kayıtları bul (0 TRY fiyatlar)
    const suspiciousStmt = db.prepare(`
      SELECT date, price,
             strftime('%w', date) as day_of_week,
             strftime('%H', date) as hour
      FROM mcp_data
      WHERE price = 0
    `);

    const suspicious = suspiciousStmt.all() as Array<{
      date: string;
      price: number;
      day_of_week: string;
      hour: string;
    }>;

    report.suspiciousRecords = suspicious.length;

    // Her şüpheli kayıt için analiz
    for (const record of suspicious) {
      const isSunday = record.day_of_week === '0';
      const isMidday = parseInt(record.hour) >= 10 && parseInt(record.hour) <= 14;

      if (isSunday && isMidday) {
        // Pazar + öğle saati = muhtemelen doğru
        report.issues.push(
          `${record.date}: 0 TRY (Pazar, öğle) - MUHTEMELEN DOĞRU`
        );
      } else {
        // Şüpheli! Manuel kontrol gerekli
        report.issues.push(
          `${record.date}: 0 TRY (ŞÜPHEL İ - manuel kontrol gerekli)`
        );
      }
    }

    console.log(`✓ Veri temizleme raporu hazır`);
    console.log(`  - Toplam kayıt: ${report.totalRecords}`);
    console.log(`  - Şüpheli kayıt: ${report.suspiciousRecords}`);

  } finally {
    db.close();
  }

  return report;
}

/**
 * EPİAŞ web sitesinden manuel doğrulama için URL oluştur
 */
export function generateEPIASVerificationURL(date: string): string {
  const d = new Date(date);
  const dateStr = d.toISOString().split('T')[0].split('-').reverse().join('.');

  return `https://seffaflik.epias.com.tr/transparency/piyasalar/gop/ptf.xhtml?date=${dateStr}`;
}

// CLI kullanımı için
if (require.main === module) {
  console.log('🔍 EPİAŞ Veri Temizleme Başlıyor...\n');

  const report = cleanMCPData();

  console.log('\n📊 Temizleme Raporu:');
  console.log('='.repeat(60));
  console.log(`Toplam Kayıt     : ${report.totalRecords}`);
  console.log(`Şüpheli Kayıt    : ${report.suspiciousRecords}`);
  console.log(`Düzeltilen       : ${report.correctedRecords}`);
  console.log(`Silinen          : ${report.deletedRecords}`);

  if (report.issues.length > 0) {
    console.log('\n⚠️  Tespit Edilen Sorunlar:');
    report.issues.slice(0, 20).forEach(issue => {
      console.log(`   ${issue}`);
    });

    if (report.issues.length > 20) {
      console.log(`   ... ve ${report.issues.length - 20} sorun daha`);
    }
  }

  console.log('\n💡 Öneriler:');
  console.log('   1. EPİAŞ web sitesinden manuel kontrol yapın');
  console.log('   2. Doğrulama URL örneği:');
  if (report.issues.length > 0) {
    const firstDate = report.issues[0].split(':')[0];
    console.log(`      ${generateEPIASVerificationURL(firstDate)}`);
  }
  console.log('='.repeat(60));
}
