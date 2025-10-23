import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES modules için __dirname alternatifi
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ortam değişkenlerini .env dosyasından yükler
dotenv.config();

// Services (dotenv.config()'den sonra import et)
import { fetchMCP, fetch2YearsData, fetchGeneration, fetchGenerationInChunks, fetchConsumption } from './services/epiasClient.js';
import {
  initDatabase,
  insertMCPData,
  insertGenerationData,
  insertConsumptionData,
  getMCPCount,
  getMCPData,
  getAllCounts
} from './services/database.js';

// Routes
import predictionsRouter from './routes/predictions.js';

// Database'i başlat
initDatabase();

// Express uygulamasını başlat
const app = express();

// Middleware'ler
// Frontend'den gelen isteklere izin vermek için CORS'u etkinleştir
app.use(cors());
// Gelen isteklerde JSON body'lerini parse etmek için
app.use(express.json());
// URL-encoded verileri parse etmek için
app.use(express.urlencoded({ extended: true }));

// Static files (frontend) - public klasöründen serve et
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));
console.log(`📁 Serving static files from: ${publicPath}`);

// Port'u ortam değişkenlerinden veya varsayılan olarak 5001'den al
const PORT = process.env.PORT || 5001;

// Rotalar
// API route'larını kaydet
app.use('/api/predictions', predictionsRouter);

// Sunucunun "sağlıklı" olup olmadığını kontrol eden bir test rotası
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', message: 'Server is running' });
});

// Test endpoint: EPİAŞ'tan 1 günlük MCP verisi çek
app.get('/api/test/mcp', async (req: Request, res: Response) => {
  try {
    console.log('🧪 Testing MCP fetch...');

    // Dünün verisini çek (örnek)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const data = await fetchMCP(dateStr, dateStr);

    res.status(200).json({
      success: true,
      message: `Fetched ${data.items.length} items for ${dateStr}`,
      data: data.items.slice(0, 5) // İlk 5 item'i göster
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch MCP data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test: Tüketim verisinin RAW formatını gör
app.get('/api/test/consumption', async (req: Request, res: Response) => {
  try {
    console.log('🧪 Testing Consumption fetch...');
    const testDate = '2024-10-15';

    const data = await fetchConsumption(testDate, testDate);

    res.status(200).json({
      success: true,
      message: `Fetched ${data.items.length} items`,
      rawData: data.items.slice(0, 3),  // İlk 3 item'ın tüm alanlarını göster
      fullResponse: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consumption data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test: Üretim verisinin RAW formatını gör
app.get('/api/test/generation', async (req: Request, res: Response) => {
  try {
    console.log('🧪 Testing Generation fetch...');
    const testDate = '2024-10-15';

    const data = await fetchGeneration(testDate, testDate);

    res.status(200).json({
      success: true,
      message: `Fetched ${data.items.length} items`,
      rawData: data.items.slice(0, 3),
      fullResponse: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch generation data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// MCP verilerini çek ve database'e kaydet
app.post('/api/mcp/fetch-and-save', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required (format: YYYY-MM-DD)'
      });
    }

    console.log(`📥 Fetching MCP data: ${startDate} → ${endDate}`);

    // EPİAŞ'tan veriyi çek
    const data = await fetchMCP(startDate, endDate);

    console.log(`💾 Saving ${data.items.length} records to database...`);

    // Database'e kaydet
    const inserted = insertMCPData(data.items);

    // Toplam kayıt sayısı
    const totalRecords = getMCPCount();

    res.status(200).json({
      success: true,
      message: `Successfully fetched and saved ${inserted} records`,
      stats: {
        fetched: data.items.length,
        inserted: inserted,
        totalInDatabase: totalRecords,
        dateRange: { startDate, endDate }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch and save MCP data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Database istatistiklerini getir
app.get('/api/mcp/stats', (req: Request, res: Response) => {
  try {
    const totalRecords = getMCPCount();

    res.status(200).json({
      success: true,
      stats: {
        totalRecords: totalRecords,
        daysOfData: Math.floor(totalRecords / 24),
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get stats',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 2 yıllık TÜM verileri çek ve kaydet (MCP + Üretim + Tüketim)
app.post('/api/data/fetch-all-2-years', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required (format: YYYY-MM-DD)'
      });
    }

    console.log(`\n🚀 Starting 2-year data fetch: ${startDate} → ${endDate}\n`);

    const results = {
      mcp: { fetched: 0, inserted: 0 },
      generation: { fetched: 0, inserted: 0 },
      consumption: { fetched: 0, inserted: 0 }
    };

    // 1 yıl sınırı olduğu için 2 parçaya böl
    const start = new Date(startDate);
    const end = new Date(endDate);
    const mid = new Date(startDate);
    mid.setFullYear(mid.getFullYear() + 1);

    const midDateStr = mid.toISOString().split('T')[0];

    console.log(`📦 Part 1: ${startDate} → ${midDateStr}`);
    console.log(`📦 Part 2: ${midDateStr} → ${endDate}\n`);

    // Part 1: İlk yıl (2023-10-16 → 2024-10-16)
    console.log('📥 Fetching Part 1 - MCP data...');
    try {
      const mcp1 = await fetchMCP(startDate, midDateStr);
      const inserted1 = insertMCPData(mcp1.items);
      results.mcp.fetched += mcp1.items.length;
      results.mcp.inserted += inserted1;
      console.log(`✅ Part 1 MCP: ${inserted1} records inserted`);
    } catch (error) {
      console.error('❌ Part 1 MCP failed:', error);
    }

    console.log('📥 Fetching Part 1 - Generation data (in 30-day chunks)...');
    try {
      const gen1 = await fetchGenerationInChunks(startDate, midDateStr);
      const inserted1 = insertGenerationData(gen1.items);
      results.generation.fetched += gen1.items.length;
      results.generation.inserted += inserted1;
      console.log(`✅ Part 1 Generation: ${inserted1} records inserted`);
    } catch (error) {
      console.error('❌ Part 1 Generation failed:', error);
    }

    console.log('📥 Fetching Part 1 - Consumption data...');
    try {
      const cons1 = await fetchConsumption(startDate, midDateStr);
      const inserted1 = insertConsumptionData(cons1.items);
      results.consumption.fetched += cons1.items.length;
      results.consumption.inserted += inserted1;
      console.log(`✅ Part 1 Consumption: ${inserted1} records inserted`);
    } catch (error) {
      console.error('❌ Part 1 Consumption failed:', error);
    }

    // Part 2: İkinci yıl (2024-10-16 → 2025-10-16)
    console.log('\n📥 Fetching Part 2 - MCP data...');
    try {
      const mcp2 = await fetchMCP(midDateStr, endDate);
      const inserted2 = insertMCPData(mcp2.items);
      results.mcp.fetched += mcp2.items.length;
      results.mcp.inserted += inserted2;
      console.log(`✅ Part 2 MCP: ${inserted2} records inserted`);
    } catch (error) {
      console.error('❌ Part 2 MCP failed:', error);
    }

    console.log('📥 Fetching Part 2 - Generation data (in 30-day chunks)...');
    try {
      const gen2 = await fetchGenerationInChunks(midDateStr, endDate);
      const inserted2 = insertGenerationData(gen2.items);
      results.generation.fetched += gen2.items.length;
      results.generation.inserted += inserted2;
      console.log(`✅ Part 2 Generation: ${inserted2} records inserted`);
    } catch (error) {
      console.error('❌ Part 2 Generation failed:', error);
    }

    console.log('📥 Fetching Part 2 - Consumption data...');
    try {
      const cons2 = await fetchConsumption(midDateStr, endDate);
      const inserted2 = insertConsumptionData(cons2.items);
      results.consumption.fetched += cons2.items.length;
      results.consumption.inserted += inserted2;
      console.log(`✅ Part 2 Consumption: ${inserted2} records inserted`);
    } catch (error) {
      console.error('❌ Part 2 Consumption failed:', error);
    }

    const counts = getAllCounts();

    console.log(`\n✅ 2-year data fetch completed!\n`);

    res.status(200).json({
      success: true,
      message: '2-year data fetch completed',
      results: results,
      totalInDatabase: counts,
      dateRange: { startDate, endDate }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch 2-year data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Database'den MCP verilerini getir (query)
app.get('/api/mcp/query', (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required (format: YYYY-MM-DD)'
      });
    }

    const data = getMCPData(startDate as string, endDate as string);

    // Limit varsa uygula
    const limitNum = limit ? parseInt(limit as string) : data.length;
    const limitedData = data.slice(0, limitNum);

    res.status(200).json({
      success: true,
      count: limitedData.length,
      total: data.length,
      dateRange: { startDate, endDate },
      data: limitedData
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to query MCP data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 Backend server is running at http://localhost:${PORT}`);
});