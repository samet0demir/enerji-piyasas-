import axios, { AxiosError } from 'axios';
import type { MCPResponse, GenerationResponse, ConsumptionResponse } from '../types/epias.js';

// .env dosyasından EPİAŞ API base URL'ini al
const EPIAS_BASE_URL = process.env.EPIAS_BASE_URL || 'https://seffaflik.epias.com.tr/electricity-service';
const EPIAS_LOGIN_URL = 'https://giris.epias.com.tr/cas/v1/tickets';

/**
 * EPİAŞ'tan TGT (Ticket Granting Ticket) alır
 *
 * @returns TGT token string
 * @throws Error if authentication fails
 */
async function getTGT(): Promise<string> {
  const username = process.env.EPIAS_USERNAME;
  const password = process.env.EPIAS_PASSWORD;

  if (!username || !password) {
    throw new Error('EPİAŞ credentials not found. Please set EPIAS_USERNAME and EPIAS_PASSWORD in .env file.');
  }

  try {
    // EPİAŞ CAS (Central Authentication Service) endpoint'ine login
    const response = await axios.post(
      EPIAS_LOGIN_URL,
      `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // DEBUG: EPİAŞ'tan gelen yanıtı detaylı logla
    console.log('🔍 EPİAŞ LOGIN STATUS:', response.status);
    console.log('🔍 EPİAŞ LOGIN HEADERS:', JSON.stringify(response.headers, null, 2));

    if (response && response.data) {
      if (typeof response.data === 'string') {
        console.log('🔍 EPİAŞ LOGIN BODY (string - first 200 chars):', response.data.slice(0, 200));
      } else {
        console.log('🔍 EPİAŞ LOGIN BODY KEYS:', Object.keys(response.data));
        try {
          const jsonStr = JSON.stringify(response.data);
          console.log('🔍 EPİAŞ LOGIN BODY LENGTH:', jsonStr.length);
          console.log('🔍 EPİAŞ LOGIN BODY (first 1000 chars):', jsonStr.slice(0, 1000));
        } catch(e) {
          console.log('🔍 EPİAŞ login stringify error:', e);
        }
      }
    } else {
      console.log('🔍 EPİAŞ login returned EMPTY BODY');
    }

    // Response JSON formatında: { tgt: "TGT-xxx...", created: "...", code: 201 }
    const tgt = response.data.tgt;

    if (!tgt) {
      console.error('❌ TGT field not found. Available fields:', Object.keys(response.data || {}));
      throw new Error('TGT token not found in response');
    }

    console.log('✅ TGT token obtained successfully');
    return tgt;

  } catch (error) {
    console.error('❌ Failed to obtain TGT token:', error);
    if (axios.isAxiosError(error)) {
      console.error('❌ Axios Error Details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
    }
    throw new Error('EPİAŞ authentication failed. Please check your credentials.');
  }
}

/**
 * EPİAŞ API'den MCP (Market Clearing Price) verilerini çeker
 *
 * @param startDate - Başlangıç tarihi (YYYY-MM-DD formatında, örn: "2023-10-15")
 * @param endDate - Bitiş tarihi (YYYY-MM-DD formatında, örn: "2024-10-15")
 * @returns MCP verileri array'i
 *
 * @example
 * const data = await fetchMCP('2024-10-01', '2024-10-02');
 * console.log(data.items[0].price); // 2130
 */
export async function fetchMCP(startDate: string, endDate: string): Promise<MCPResponse> {
  try {
    // EPİAŞ MCP endpoint'i (v1 gerekli, POST method)
    const url = `${EPIAS_BASE_URL}/v1/markets/dam/data/mcp`;

    // Tarih formatını ISO 8601'e çevir: "2023-10-15" -> "2023-10-15T00:00:00+03:00"
    const formatDate = (dateStr: string) => `${dateStr}T00:00:00+03:00`;

    // TGT token al (.env'de varsa onu kullan, yoksa otomatik login yap)
    let tgtToken = process.env.EPIAS_TGT || '';

    if (!tgtToken) {
      console.log('🔐 TGT token not found in .env, attempting to login...');
      tgtToken = await getTGT();
    }

    // Axios ile POST isteği (yeni API POST kullanıyor)
    const response = await axios.post<MCPResponse>(
      url,
      {
        startDate: formatDate(startDate),  // "2023-10-15T00:00:00+03:00" formatında
        endDate: formatDate(endDate)       // "2024-10-15T00:00:00+03:00" formatında
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'TGT': tgtToken  // EPİAŞ kimlik doğrulama token'ı
        },
        timeout: 30000  // 30 saniye timeout (yavaş network için)
      }
    );

    // API'den gelen veriyi logla (debug için)
    console.log(`✅ MCP data fetched: ${response.data.items.length} items (${startDate} → ${endDate})`);

    return response.data;

  } catch (error) {
    // Hata durumunu yakala ve detaylı log
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('❌ EPİAŞ API Error:', {
        status: axiosError.response?.status,
        message: axiosError.message,
        url: axiosError.config?.url
      });
    } else {
      console.error('❌ Unexpected error:', error);
    }

    // Hatayı yukarı fırlat (caller handle etsin)
    throw error;
  }
}

/**
 * 2 yıllık MCP verisini çeker (EPİAŞ max 1 yıl sınırı olduğu için 2 parçaya böler)
 *
 * @param startDate - Başlangıç tarihi (2 yıl öncesi)
 * @param endDate - Bitiş tarihi (bugün)
 * @returns Birleştirilmiş 2 yıllık veri
 *
 * @example
 * const data = await fetch2YearsData('2023-10-16', '2025-10-15');
 */
export async function fetch2YearsData(startDate: string, endDate: string): Promise<MCPResponse> {
  console.log(`📅 Fetching 2 years data: ${startDate} → ${endDate}`);

  // Başlangıç tarihinden 1 yıl sonrasını hesapla
  const midDate = new Date(startDate);
  midDate.setFullYear(midDate.getFullYear() + 1);
  const midDateStr = midDate.toISOString().split('T')[0]; // "2024-10-16"

  console.log(`📦 Part 1: ${startDate} → ${midDateStr}`);
  console.log(`📦 Part 2: ${midDateStr} → ${endDate}`);

  // İlk yılı çek
  const year1 = await fetchMCP(startDate, midDateStr);

  // İkinci yılı çek
  const year2 = await fetchMCP(midDateStr, endDate);

  // İki array'i birleştir
  const combined: MCPResponse = {
    items: [...year1.items, ...year2.items]
  };

  console.log(`✅ Total items fetched: ${combined.items.length}`);

  return combined;
}

/**
 * EPİAŞ API'den Gerçek Zamanlı Üretim verilerini çeker
 * NOT: Bu API maksimum 30 günlük veri çekmeyi destekler
 *
 * @param startDate - Başlangıç tarihi (YYYY-MM-DD formatında)
 * @param endDate - Bitiş tarihi (YYYY-MM-DD formatında)
 * @returns Üretim verileri array'i
 */
export async function fetchGeneration(startDate: string, endDate: string): Promise<GenerationResponse> {
  try {
    const url = `${EPIAS_BASE_URL}/v1/generation/data/realtime-generation`;
    const formatDate = (dateStr: string) => `${dateStr}T00:00:00+03:00`;

    let tgtToken = process.env.EPIAS_TGT || '';
    if (!tgtToken) {
      console.log('🔐 TGT token not found in .env, attempting to login...');
      tgtToken = await getTGT();
    }

    const response = await axios.post<GenerationResponse>(
      url,
      {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'TGT': tgtToken
        },
        timeout: 30000
      }
    );

    console.log(`✅ Generation data fetched: ${response.data.items.length} items (${startDate} → ${endDate})`);
    return response.data;

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('❌ EPİAŞ Generation API Error:', {
        status: axiosError.response?.status,
        message: axiosError.message,
        url: axiosError.config?.url
      });
    } else {
      console.error('❌ Unexpected error:', error);
    }
    throw error;
  }
}

/**
 * Üretim verisini aylık parçalara bölerek çeker (API limiti 30 gün olduğu için)
 *
 * @param startDate - Başlangıç tarihi (YYYY-MM-DD)
 * @param endDate - Bitiş tarihi (YYYY-MM-DD)
 * @returns Birleştirilmiş üretim verileri
 */
export async function fetchGenerationInChunks(startDate: string, endDate: string): Promise<GenerationResponse> {
  console.log(`📅 Fetching generation data in 30-day chunks: ${startDate} → ${endDate}`);

  const allItems: any[] = [];
  let currentDate = new Date(startDate);
  const finalDate = new Date(endDate);

  let chunkNumber = 1;

  while (currentDate < finalDate) {
    // 30 günlük chunk hesapla
    const chunkStart = currentDate.toISOString().split('T')[0] || '';
    const chunkEnd = new Date(currentDate);
    chunkEnd.setDate(chunkEnd.getDate() + 30);

    // Final tarihten fazla gitmesin
    if (chunkEnd > finalDate) {
      chunkEnd.setTime(finalDate.getTime());
    }

    const chunkEndStr = chunkEnd.toISOString().split('T')[0] || '';

    console.log(`📦 Chunk ${chunkNumber}: ${chunkStart} → ${chunkEndStr}`);

    try {
      const chunkData = await fetchGeneration(chunkStart, chunkEndStr);
      allItems.push(...chunkData.items);
      console.log(`✅ Chunk ${chunkNumber} completed: ${chunkData.items.length} items`);
    } catch (error) {
      console.error(`❌ Chunk ${chunkNumber} failed:`, error);
      throw error;
    }

    // Bir sonraki chunk'a geç
    currentDate.setDate(currentDate.getDate() + 31); // 31 gün ekle ki overlap olmasın
    chunkNumber++;

    // Rate limiting için kısa bir bekleme
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`✅ Total generation items fetched: ${allItems.length}`);

  return { items: allItems };
}

/**
 * EPİAŞ API'den Gerçek Zamanlı Tüketim verilerini çeker
 *
 * @param startDate - Başlangıç tarihi (YYYY-MM-DD formatında)
 * @param endDate - Bitiş tarihi (YYYY-MM-DD formatında)
 * @returns Tüketim verileri array'i
 */
export async function fetchConsumption(startDate: string, endDate: string): Promise<ConsumptionResponse> {
  try {
    const url = `${EPIAS_BASE_URL}/v1/consumption/data/realtime-consumption`;
    const formatDate = (dateStr: string) => `${dateStr}T00:00:00+03:00`;

    let tgtToken = process.env.EPIAS_TGT || '';
    if (!tgtToken) {
      console.log('🔐 TGT token not found in .env, attempting to login...');
      tgtToken = await getTGT();
    }

    const response = await axios.post<ConsumptionResponse>(
      url,
      {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'TGT': tgtToken
        },
        timeout: 30000
      }
    );

    console.log(`✅ Consumption data fetched: ${response.data.items.length} items (${startDate} → ${endDate})`);
    return response.data;

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('❌ EPİAŞ Consumption API Error:', {
        status: axiosError.response?.status,
        message: axiosError.message,
        url: axiosError.config?.url
      });
    } else {
      console.error('❌ Unexpected error:', error);
    }
    throw error;
  }
}
