// EPİAŞ API'den gelen veri tipleri için tip tanımları

/**
 * MCP (Market Clearing Price) - Tek bir saatlik veri
 */
export interface MCPItem {
  date: string;        // "2023-10-15T00:00:00+03:00"
  hour: string;        // "00:00"
  price: number;       // 2130 (TRY/MWh)
  priceUsd: number;    // 76.77
  priceEur: number;    // 72.87
}

/**
 * EPİAŞ API'den gelen MCP response
 */
export interface MCPResponse {
  items: MCPItem[];
}

/**
 * Gerçek Zamanlı Üretim - Tek bir saatlik kaynak bazlı veri
 * (API'den gelen gerçek alan isimleri)
 */
export interface GenerationItem {
  date: string;            // "2023-10-15T00:00:00+03:00"
  hour: string;            // "00:00"
  total: number;           // Toplam üretim (MWh)
  biomass?: number;        // Biyokütle
  fueloil?: number;        // Fuel-oil
  geothermal?: number;     // Jeotermal
  dammedHydro?: number;    // Barajlı Hidrolik (API: dammedHydro)
  importExport?: number;   // İthalat/İhracat
  lignite?: number;        // Linyit
  lng?: number;            // LNG
  naturalGas?: number;     // Doğalgaz (API: naturalGas camelCase)
  naphta?: number;         // Nafta (API: naphta)
  river?: number;          // Akarsu
  sun?: number;            // Güneş (API: sun)
  wind?: number;           // Rüzgar
  wasteheat?: number;      // Atık Isı
  asphaltiteCoal?: number; // Asfaltit Kömürü
  blackCoal?: number;      // Siyah Kömür
  importCoal?: number;     // İthal Kömür
}

/**
 * EPİAŞ API'den gelen Üretim response
 */
export interface GenerationResponse {
  items: GenerationItem[];
}

/**
 * Gerçek Zamanlı Tüketim - Tek bir saatlik veri
 */
export interface ConsumptionItem {
  date: string;        // "2023-10-15T00:00:00+03:00"
  time: string;        // "00:00" (API'den "time" olarak geliyor!)
  consumption: number; // Tüketim (MWh)
}

/**
 * EPİAŞ API'den gelen Tüketim response
 */
export interface ConsumptionResponse {
  items: ConsumptionItem[];
}

/**
 * fetchMCP fonksiyonu için parametreler
 */
export interface FetchMCPParams {
  startDate: string;   // "2023-10-15" formatında
  endDate: string;     // "2024-10-15" formatında
}
