import axios from 'axios';

// Static JSON path (served from backend/public or deployed static hosting)
const FORECASTS_JSON = '/forecasts.json';

// Type definitions
export type ForecastData = {
  datetime: string;
  predicted: number;
  actual?: number | null;
  lower_bound?: number;
  upper_bound?: number;
}

export type ComparisonData = {
  datetime: string;
  predicted: number;
  actual: number;
  error: number;
  error_percent: number;
}

export type WeeklyPerformance = {
  week_start: string;
  week_end: string;
  mape: number;
  mae: number;
  rmse: number;
  total_predictions: number;
}

export type ForecastsResponse = {
  generated_at: string;
  current_week: {
    start: string;
    end: string;
    forecasts: ForecastData[];
  };
  last_week_performance: WeeklyPerformance | null;
  last_week_comparison: ComparisonData[];
  historical_trend: WeeklyPerformance[];
}

export type GenerationData = {
  date: string;
  hour: string;
  total: number;
  solar: number;
  wind: number;
  hydro: number;
  natural_gas: number;
  lignite: number;
  geothermal: number;
  biomass: number;
}

export type ConsumptionData = {
  date: string;
  hour: string;
  consumption: number;
}

// API functions
const API_BASE = 'http://localhost:5001/api';

export const api = {
  async getForecasts(): Promise<ForecastsResponse> {
    try {
      const response = await axios.get(FORECASTS_JSON);
      return response.data;
    } catch (error) {
      console.error('Error fetching forecasts:', error);
      throw new Error('Tahmin verileri yüklenemedi. Lütfen backend\'in çalıştığından emin olun.');
    }
  },

  async getGeneration(): Promise<GenerationData[]> {
    try {
      const response = await axios.get(`${API_BASE}/generation/recent`);
      return response.data.generation;
    } catch (error) {
      console.error('Error fetching generation:', error);
      return [];
    }
  },

  async getConsumption(): Promise<ConsumptionData[]> {
    try {
      const response = await axios.get(`${API_BASE}/consumption/recent`);
      return response.data.consumption;
    } catch (error) {
      console.error('Error fetching consumption:', error);
      return [];
    }
  }
};
