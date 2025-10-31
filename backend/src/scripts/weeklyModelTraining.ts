/**
 * Weekly Model Training Script
 * =============================
 *
 * Bu script her Pazartesi sabah 03:00'da GitHub Actions tarafından çalıştırılır.
 * Python weekly_workflow.py scriptini tetikler ve haftalık döngüyü tamamlar:
 *
 * 1. Geçen hafta tahmin vs gerçek karşılaştırması
 * 2. Model eğitimi (dün'e kadar veriyle)
 * 3. Bu hafta tahmini
 * 4. JSON export (frontend için)
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCRIPT_DIR = path.join(__dirname, '../ml');
const PYTHON_SCRIPT = path.join(SCRIPT_DIR, 'weekly_workflow.py');
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'weekly-training.log');

/**
 * Log mesajı yaz (console + file)
 */
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  console.log(logMessage);

  // Log klasörünü oluştur
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  // Log dosyasına ekle
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

/**
 * Ana fonksiyon
 */
async function main() {
  log('============================================================');
  log('WEEKLY MODEL TRAINING - Haftalık İş Akışı');
  log('============================================================');

  try {
    // Python scriptini kontrol et
    if (!fs.existsSync(PYTHON_SCRIPT)) {
      throw new Error(`Python script bulunamadı: ${PYTHON_SCRIPT}`);
    }

    log(`Python script bulundu: ${PYTHON_SCRIPT}`);

    // Python scriptini çalıştır
    log('Python weekly_workflow.py çalıştırılıyor...');

    const output = execSync(`python "${PYTHON_SCRIPT}"`, {
      encoding: 'utf-8',
      cwd: SCRIPT_DIR,
      stdio: 'pipe'
    });

    // Python çıktısını logla
    log('Python çıktısı:');
    log('---START---');
    log(output);
    log('---END---');

    log('✅ Haftalık iş akışı başarıyla tamamlandı!');
    log('============================================================');

    process.exit(0);

  } catch (error) {
    log('❌ HATA oluştu!');

    if (error instanceof Error) {
      log(`Hata mesajı: ${error.message}`);

      // Eğer execSync hatası ise, stderr'i de göster
      if ('stderr' in error) {
        const execError = error as any;
        log(`stderr: ${execError.stderr}`);
        log(`stdout: ${execError.stdout}`);
      }
    }

    log('============================================================');

    process.exit(1);
  }
}

// Script'i çalıştır
main();
