import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import { fetchMCP, fetch2YearsData, fetchGeneration, fetchGenerationInChunks, fetchConsumption } from '../epiasClient.js';
import type { MCPResponse, GenerationResponse, ConsumptionResponse } from '../../types/epias.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EPİAŞ Client Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Set test environment variables
    process.env = {
      ...originalEnv,
      EPIAS_TGT: 'test-tgt-token',
      EPIAS_BASE_URL: 'https://test-api.epias.com.tr',
      EPIAS_USERNAME: 'test-user',
      EPIAS_PASSWORD: 'test-pass'
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('fetchMCP', () => {
    it('should fetch MCP data successfully with TGT token', async () => {
      const mockResponse: MCPResponse = {
        items: [
          {
            date: '2025-10-28T00:00:00+03:00',
            hour: '00:00',
            price: 2500.50,
            priceUsd: 85.20,
            priceEur: 78.40
          },
          {
            date: '2025-10-28T00:00:00+03:00',
            hour: '01:00',
            price: 2300.00,
            priceUsd: 78.50,
            priceEur: 72.10
          }
        ]
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await fetchMCP('2025-10-28', '2025-10-28');

      expect(result).toEqual(mockResponse);
      expect(result.items).toHaveLength(2);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/mcp'),
        {
          startDate: '2025-10-28T00:00:00+03:00',
          endDate: '2025-10-28T00:00:00+03:00'
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'TGT': 'test-tgt-token'
          })
        })
      );
    });

    it('should handle date range correctly', async () => {
      const mockResponse: MCPResponse = { items: [] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      await fetchMCP('2025-10-20', '2025-10-25');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        {
          startDate: '2025-10-20T00:00:00+03:00',
          endDate: '2025-10-25T00:00:00+03:00'
        },
        expect.any(Object)
      );
    });

    it('should throw error on API failure', async () => {
      const errorMessage = 'Network Error';
      mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;

      await expect(fetchMCP('2025-10-28', '2025-10-28')).rejects.toThrow(errorMessage);
    });

    it('should include timeout in request config', async () => {
      const mockResponse: MCPResponse = { items: [] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      await fetchMCP('2025-10-28', '2025-10-28');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 30000
        })
      );
    });
  });

  describe('fetch2YearsData', () => {
    it('should split 2-year request into two 1-year requests', async () => {
      const mockYear1: MCPResponse = {
        items: [
          { date: '2023-10-28T00:00:00+03:00', hour: '00:00', price: 2000, priceUsd: 70, priceEur: 65 }
        ]
      };

      const mockYear2: MCPResponse = {
        items: [
          { date: '2024-10-28T00:00:00+03:00', hour: '00:00', price: 2500, priceUsd: 85, priceEur: 78 }
        ]
      };

      mockedAxios.post
        .mockResolvedValueOnce({ data: mockYear1 })
        .mockResolvedValueOnce({ data: mockYear2 });

      const result = await fetch2YearsData('2023-10-28', '2025-10-28');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].price).toBe(2000);
      expect(result.items[1].price).toBe(2500);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should calculate mid-date correctly', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { items: [] } })
        .mockResolvedValueOnce({ data: { items: [] } });

      await fetch2YearsData('2023-01-15', '2025-01-15');

      // First call should be from start to mid (2024-01-15)
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.objectContaining({
          startDate: '2023-01-15T00:00:00+03:00',
          endDate: '2024-01-15T00:00:00+03:00'
        }),
        expect.any(Object)
      );

      // Second call should be from mid to end
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({
          startDate: '2024-01-15T00:00:00+03:00',
          endDate: '2025-01-15T00:00:00+03:00'
        }),
        expect.any(Object)
      );
    });

    it('should handle errors in first year fetch', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Year 1 failed'));
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;

      await expect(fetch2YearsData('2023-10-28', '2025-10-28')).rejects.toThrow('Year 1 failed');
    });

    it('should handle errors in second year fetch', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { items: [] } })
        .mockRejectedValueOnce(new Error('Year 2 failed'));
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;

      await expect(fetch2YearsData('2023-10-28', '2025-10-28')).rejects.toThrow('Year 2 failed');
    });
  });

  describe('fetchGeneration', () => {
    it('should fetch generation data successfully', async () => {
      const mockResponse: GenerationResponse = {
        items: [
          {
            date: '2025-10-28T00:00:00+03:00',
            hour: '00:00',
            total: 35000,
            sun: 0,
            wind: 5000,
            dammedHydro: 8000,
            naturalGas: 12000,
            lignite: 7000,
            geothermal: 3000
          }
        ]
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await fetchGeneration('2025-10-28', '2025-10-28');

      expect(result).toEqual(mockResponse);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].total).toBe(35000);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/realtime-generation'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use correct endpoint for generation', async () => {
      const mockResponse: GenerationResponse = { items: [] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      await fetchGeneration('2025-10-28', '2025-10-28');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('generation/data/realtime-generation'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('fetchGenerationInChunks', () => {
    it('should split long date range into 30-day chunks', async () => {
      const mockChunk1: GenerationResponse = {
        items: [{ date: '2025-10-01', hour: '00:00', total: 30000 } as any]
      };

      const mockChunk2: GenerationResponse = {
        items: [{ date: '2025-11-01', hour: '00:00', total: 32000 } as any]
      };

      mockedAxios.post
        .mockResolvedValueOnce({ data: mockChunk1 })
        .mockResolvedValueOnce({ data: mockChunk2 });

      // 60-day range should be split into 2 chunks
      const result = await fetchGenerationInChunks('2025-10-01', '2025-11-30');

      expect(result.items).toHaveLength(2);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should combine all chunk items into single response', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { items: [{ id: 1 }] } })
        .mockResolvedValueOnce({ data: { items: [{ id: 2 }] } })
        .mockResolvedValueOnce({ data: { items: [{ id: 3 }] } });

      const result = await fetchGenerationInChunks('2025-09-01', '2025-11-30');

      expect(result.items).toHaveLength(3);
      expect(result.items[0]).toEqual({ id: 1 });
      expect(result.items[2]).toEqual({ id: 3 });
    });

    it('should handle single chunk for short date range', async () => {
      const mockResponse: GenerationResponse = {
        items: [{ date: '2025-10-28', hour: '00:00', total: 35000 } as any]
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await fetchGenerationInChunks('2025-10-20', '2025-10-25');

      expect(result.items).toHaveLength(1);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should stop on chunk failure', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { items: [{ id: 1 }] } })
        .mockRejectedValueOnce(new Error('Chunk 2 failed'));
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;

      await expect(
        fetchGenerationInChunks('2025-09-01', '2025-11-30')
      ).rejects.toThrow('Chunk 2 failed');
    });
  });

  describe('fetchConsumption', () => {
    it('should fetch consumption data successfully', async () => {
      const mockResponse: ConsumptionResponse = {
        items: [
          {
            date: '2025-10-28T00:00:00+03:00',
            time: '00:00',
            consumption: 32000
          },
          {
            date: '2025-10-28T00:00:00+03:00',
            time: '01:00',
            consumption: 31500
          }
        ]
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await fetchConsumption('2025-10-28', '2025-10-28');

      expect(result).toEqual(mockResponse);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].consumption).toBe(32000);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/realtime-consumption'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use correct endpoint for consumption', async () => {
      const mockResponse: ConsumptionResponse = { items: [] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      await fetchConsumption('2025-10-28', '2025-10-28');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('consumption/data/realtime-consumption'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle empty consumption response', async () => {
      const mockResponse: ConsumptionResponse = { items: [] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await fetchConsumption('2025-10-28', '2025-10-28');

      expect(result.items).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle axios errors with proper logging', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401 },
        message: 'Unauthorized',
        config: { url: 'https://test-api.epias.com.tr/v1/markets/dam/data/mcp' }
      };

      mockedAxios.post.mockRejectedValueOnce(axiosError);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true) as any;

      await expect(fetchMCP('2025-10-28', '2025-10-28')).rejects.toMatchObject({
        message: 'Unauthorized'
      });
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockedAxios.post.mockRejectedValueOnce(networkError);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;

      await expect(fetchMCP('2025-10-28', '2025-10-28')).rejects.toThrow('Network timeout');
    });
  });

  describe('Authentication', () => {
    it('should use TGT token from environment', async () => {
      const mockResponse: MCPResponse = { items: [] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      await fetchMCP('2025-10-28', '2025-10-28');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'TGT': 'test-tgt-token'
          })
        })
      );
    });

    it('should include Content-Type header', async () => {
      const mockResponse: MCPResponse = { items: [] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      await fetchMCP('2025-10-28', '2025-10-28');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });
});
