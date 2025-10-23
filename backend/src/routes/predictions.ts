/**
 * Tahmin API Endpoint'leri
 *
 * Prophet modelini kullanarak MCP fiyat tahminleri yapar
 */

import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);
const router = express.Router();

// Python virtual environment yolu
const PYTHON_PATH = path.join(__dirname, '../../venv/Scripts/python.exe');
const PREDICT_SCRIPT = path.join(__dirname, '../ml/predict.py');
const FORECAST_CSV = path.join(__dirname, '../../models');

interface ForecastData {
  date: string;
  predicted_price: number;
  lower_bound: number;
  upper_bound: number;
}

interface ForecastResponse {
  success: boolean;
  data?: {
    forecasts: ForecastData[];
    summary: {
      days: number;
      min_price: number;
      max_price: number;
      avg_price: number;
      generated_at: string;
    };
  };
  error?: string;
}

/**
 * GET /api/predictions/:days
 * Gelecek N gün için tahmin yapar
 */
router.get('/:days', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.params.days);

    // Validasyon
    if (isNaN(days) || days < 1 || days > 30) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz gün sayısı. 1-30 arası olmalıdır.',
      });
    }

    console.log(`[*] ${days} günlük tahmin istendi...`);

    // Python scriptini çalıştır
    const command = `"${PYTHON_PATH}" "${PREDICT_SCRIPT}" ${days}`;
    const { stdout, stderr } = await execAsync(command, {
      cwd: path.join(__dirname, '../../'),
      timeout: 120000, // 2 dakika
    });

    if (stderr && !stderr.includes('plotly')) {
      console.warn('Python uyarısı:', stderr);
    }

    // CSV dosyasını oku
    const csvPath = path.join(FORECAST_CSV, `forecast_${days}days.csv`);

    if (!fs.existsSync(csvPath)) {
      throw new Error('Tahmin dosyası oluşturulamadı');
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').slice(1); // Header'ı atla

    const forecasts: ForecastData[] = [];
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let totalPrice = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      const [date, predicted, lower, upper] = line.split(',');

      const price = parseFloat(predicted);
      const lowerBound = parseFloat(lower);
      const upperBound = parseFloat(upper);

      forecasts.push({
        date: date.trim(),
        predicted_price: price,
        lower_bound: lowerBound,
        upper_bound: upperBound,
      });

      minPrice = Math.min(minPrice, price);
      maxPrice = Math.max(maxPrice, price);
      totalPrice += price;
    }

    const response: ForecastResponse = {
      success: true,
      data: {
        forecasts,
        summary: {
          days,
          min_price: minPrice,
          max_price: maxPrice,
          avg_price: totalPrice / forecasts.length,
          generated_at: new Date().toISOString(),
        },
      },
    };

    console.log(`[+] ${days} günlük tahmin tamamlandı (${forecasts.length} saat)`);

    res.json(response);
  } catch (error: any) {
    console.error('Tahmin hatası:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Tahmin oluşturulurken bir hata oluştu',
    });
  }
});

/**
 * GET /api/predictions/performance
 * Model performans metriklerini döndürür
 */
router.get('/metrics/performance', async (_req: Request, res: Response) => {
  try {
    // Model performans dosyasını kontrol et
    const perfImagePath = path.join(FORECAST_CSV, 'test_performance.png');

    if (!fs.existsSync(perfImagePath)) {
      return res.status(404).json({
        success: false,
        error: 'Performans verisi bulunamadı',
      });
    }

    // Performans metrikleri (hardcoded - ileride DB'den gelecek)
    const metrics = {
      mae: 478.5,
      rmse: 644.29,
      mape: 14.7, // Gerçek MAPE (>=100 TRY için)
      test_period: 'Son 30 gün',
      model_version: 'Prophet v1',
      trained_at: '2025-10-20T07:23:00Z',
      training_records: 17568,
      performance_chart_url: `/api/predictions/metrics/chart`,
    };

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/predictions/metrics/chart
 * Performans grafiğini döndürür
 */
router.get('/metrics/chart', (_req: Request, res: Response) => {
  const chartPath = path.join(FORECAST_CSV, 'test_performance.png');

  if (!fs.existsSync(chartPath)) {
    return res.status(404).send('Grafik bulunamadı');
  }

  res.sendFile(chartPath);
});

export default router;
