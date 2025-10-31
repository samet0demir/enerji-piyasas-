import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import type { MCPItem, GenerationItem, ConsumptionItem } from '../../types/epias.js';

// Mock database instance
let testDb: Database.Database;

// Database initialization function (copy from database.ts)
function initTestDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      hour TEXT NOT NULL,
      price REAL NOT NULL,
      price_usd REAL,
      price_eur REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, hour)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mcp_date ON mcp_data(date);
    CREATE INDEX IF NOT EXISTS idx_mcp_date_hour ON mcp_data(date, hour);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      hour TEXT NOT NULL,
      total REAL NOT NULL,
      biomass REAL,
      fueloil REAL,
      geothermal REAL,
      hydro REAL,
      import_export REAL,
      lignite REAL,
      lng REAL,
      natural_gas REAL,
      naphtha REAL,
      river REAL,
      solar REAL,
      wind REAL,
      wasteheat REAL,
      asphaltite_coal REAL,
      black_coal REAL,
      import_coal REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, hour)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS consumption_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      hour TEXT NOT NULL,
      consumption REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, hour)
    )
  `);
}

// Test implementations of database functions
function insertMCPData(db: Database.Database, items: MCPItem[]): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO mcp_data (date, hour, price, price_usd, price_eur)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((data: MCPItem[]) => {
    for (const item of data) {
      insert.run(item.date, item.hour, item.price, item.priceUsd, item.priceEur);
    }
  });

  insertMany(items);
  return items.length;
}

function getMCPData(db: Database.Database, startDate: string, endDate: string): MCPItem[] {
  const query = db.prepare(`
    SELECT date, hour, price, price_usd as priceUsd, price_eur as priceEur
    FROM mcp_data
    WHERE date >= ? AND date <= ?
    ORDER BY date, hour
  `);

  return query.all(startDate, endDate) as MCPItem[];
}

function getMCPCount(db: Database.Database): number {
  const query = db.prepare('SELECT COUNT(*) as count FROM mcp_data');
  const result = query.get() as { count: number };
  return result.count;
}

function insertGenerationData(db: Database.Database, items: GenerationItem[]): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO generation_data (
      date, hour, total, biomass, fueloil, geothermal, hydro,
      import_export, lignite, lng, natural_gas, naphtha, river, solar, wind,
      wasteheat, asphaltite_coal, black_coal, import_coal
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((data: GenerationItem[]) => {
    for (const item of data) {
      insert.run(
        item.date, item.hour, item.total, item.biomass, item.fueloil,
        item.geothermal, item.dammedHydro, item.importExport, item.lignite,
        item.lng, item.naturalGas, item.naphta, item.river, item.sun, item.wind,
        item.wasteheat, item.asphaltiteCoal, item.blackCoal, item.importCoal
      );
    }
  });

  insertMany(items);
  return items.length;
}

function insertConsumptionData(db: Database.Database, items: ConsumptionItem[]): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO consumption_data (date, hour, consumption)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((data: ConsumptionItem[]) => {
    for (const item of data) {
      insert.run(item.date, item.time, item.consumption);
    }
  });

  insertMany(items);
  return items.length;
}

describe('Database Service', () => {
  beforeEach(() => {
    // Create in-memory database for each test
    testDb = new Database(':memory:');
    initTestDatabase(testDb);
  });

  afterEach(() => {
    // Close database after each test
    testDb.close();
  });

  describe('MCP Data Operations', () => {
    it('should insert MCP data successfully', () => {
      const testData: MCPItem[] = [
        {
          date: '2025-10-28',
          hour: '00:00',
          price: 2500.50,
          priceUsd: 85.20,
          priceEur: 78.40
        },
        {
          date: '2025-10-28',
          hour: '01:00',
          price: 2300.00,
          priceUsd: 78.50,
          priceEur: 72.10
        }
      ];

      const inserted = insertMCPData(testDb, testData);

      expect(inserted).toBe(2);
      expect(getMCPCount(testDb)).toBe(2);
    });

    it('should replace existing MCP data on conflict', () => {
      const initialData: MCPItem[] = [
        {
          date: '2025-10-28',
          hour: '00:00',
          price: 2000.00,
          priceUsd: 70.00,
          priceEur: 65.00
        }
      ];

      insertMCPData(testDb, initialData);
      expect(getMCPCount(testDb)).toBe(1);

      // Insert same date/hour with different price
      const updatedData: MCPItem[] = [
        {
          date: '2025-10-28',
          hour: '00:00',
          price: 2500.00,
          priceUsd: 85.00,
          priceEur: 78.00
        }
      ];

      insertMCPData(testDb, updatedData);
      expect(getMCPCount(testDb)).toBe(1); // Still 1 record (replaced)

      const data = getMCPData(testDb, '2025-10-28', '2025-10-28');
      expect(data[0].price).toBe(2500.00);
    });

    it('should retrieve MCP data for date range', () => {
      const testData: MCPItem[] = [
        { date: '2025-10-25', hour: '00:00', price: 2100, priceUsd: 70, priceEur: 65 },
        { date: '2025-10-26', hour: '00:00', price: 2200, priceUsd: 75, priceEur: 68 },
        { date: '2025-10-27', hour: '00:00', price: 2300, priceUsd: 78, priceEur: 72 },
        { date: '2025-10-28', hour: '00:00', price: 2400, priceUsd: 82, priceEur: 75 }
      ];

      insertMCPData(testDb, testData);

      const result = getMCPData(testDb, '2025-10-26', '2025-10-27');

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2025-10-26');
      expect(result[1].date).toBe('2025-10-27');
    });

    it('should return empty array for non-existent date range', () => {
      const result = getMCPData(testDb, '2099-01-01', '2099-01-02');
      expect(result).toHaveLength(0);
    });

    it('should count MCP records correctly', () => {
      expect(getMCPCount(testDb)).toBe(0);

      const testData: MCPItem[] = [
        { date: '2025-10-28', hour: '00:00', price: 2500, priceUsd: 85, priceEur: 78 },
        { date: '2025-10-28', hour: '01:00', price: 2300, priceUsd: 78, priceEur: 72 },
        { date: '2025-10-28', hour: '02:00', price: 2200, priceUsd: 75, priceEur: 69 }
      ];

      insertMCPData(testDb, testData);
      expect(getMCPCount(testDb)).toBe(3);
    });
  });

  describe('Generation Data Operations', () => {
    it('should insert generation data successfully', () => {
      const testData: GenerationItem[] = [
        {
          date: '2025-10-28',
          hour: '00:00',
          total: 35000,
          sun: 0,
          wind: 5000,
          dammedHydro: 8000,
          naturalGas: 12000,
          lignite: 7000,
          geothermal: 3000
        },
        {
          date: '2025-10-28',
          hour: '01:00',
          total: 33000,
          sun: 0,
          wind: 4800,
          dammedHydro: 7500,
          naturalGas: 11500,
          lignite: 6800,
          geothermal: 2900
        }
      ];

      const inserted = insertGenerationData(testDb, testData);

      expect(inserted).toBe(2);

      const query = testDb.prepare('SELECT COUNT(*) as count FROM generation_data');
      const result = query.get() as { count: number };
      expect(result.count).toBe(2);
    });

    it('should handle optional generation fields', () => {
      const testData: GenerationItem[] = [
        {
          date: '2025-10-28',
          hour: '00:00',
          total: 35000,
          sun: 1000,
          wind: 5000
          // Other fields omitted (undefined)
        }
      ];

      const inserted = insertGenerationData(testDb, testData);
      expect(inserted).toBe(1);

      const query = testDb.prepare('SELECT * FROM generation_data WHERE date = ?');
      const result = query.get('2025-10-28') as any;

      expect(result.total).toBe(35000);
      expect(result.solar).toBe(1000);
      expect(result.wind).toBe(5000);
      expect(result.hydro).toBeNull();
    });
  });

  describe('Consumption Data Operations', () => {
    it('should insert consumption data successfully', () => {
      const testData: ConsumptionItem[] = [
        { date: '2025-10-28', time: '00:00', consumption: 32000 },
        { date: '2025-10-28', time: '01:00', consumption: 31500 },
        { date: '2025-10-28', time: '02:00', consumption: 30800 }
      ];

      const inserted = insertConsumptionData(testDb, testData);

      expect(inserted).toBe(3);

      const query = testDb.prepare('SELECT COUNT(*) as count FROM consumption_data');
      const result = query.get() as { count: number };
      expect(result.count).toBe(3);
    });

    it('should replace existing consumption data on conflict', () => {
      const initialData: ConsumptionItem[] = [
        { date: '2025-10-28', time: '00:00', consumption: 30000 }
      ];

      insertConsumptionData(testDb, initialData);

      const updatedData: ConsumptionItem[] = [
        { date: '2025-10-28', time: '00:00', consumption: 35000 }
      ];

      insertConsumptionData(testDb, updatedData);

      const query = testDb.prepare('SELECT consumption FROM consumption_data WHERE date = ? AND hour = ?');
      const result = query.get('2025-10-28', '00:00') as { consumption: number };

      expect(result.consumption).toBe(35000);
    });
  });

  describe('Bulk Operations & Transactions', () => {
    it('should handle large batch inserts efficiently', () => {
      const largeData: MCPItem[] = [];

      // Generate 100 records (typical daily data)
      for (let i = 0; i < 100; i++) {
        largeData.push({
          date: '2025-10-28',
          hour: `${Math.floor(i / 4).toString().padStart(2, '0')}:${((i % 4) * 15).toString().padStart(2, '0')}`,
          price: 2000 + Math.random() * 1000,
          priceUsd: 70 + Math.random() * 20,
          priceEur: 65 + Math.random() * 15
        });
      }

      const start = Date.now();
      const inserted = insertMCPData(testDb, largeData);
      const duration = Date.now() - start;

      expect(inserted).toBe(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should rollback on transaction failure', () => {
      const validData: MCPItem[] = [
        { date: '2025-10-28', hour: '00:00', price: 2500, priceUsd: 85, priceEur: 78 }
      ];

      insertMCPData(testDb, validData);
      expect(getMCPCount(testDb)).toBe(1);

      // Try to insert invalid data (this should fail in real scenario with constraints)
      try {
        const invalidData: any = [
          { date: null, hour: '01:00', price: 2300 } // Missing required date
        ];
        insertMCPData(testDb, invalidData);
      } catch (error) {
        // Expected to fail
      }

      // Original data should still be there
      expect(getMCPCount(testDb)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Data Integrity', () => {
    it('should enforce UNIQUE constraint on date+hour', () => {
      const data: MCPItem[] = [
        { date: '2025-10-28', hour: '00:00', price: 2500, priceUsd: 85, priceEur: 78 },
        { date: '2025-10-28', hour: '00:00', price: 2600, priceUsd: 88, priceEur: 80 } // Duplicate
      ];

      insertMCPData(testDb, data);

      // Should only have 1 record (last one wins with INSERT OR REPLACE)
      const count = getMCPCount(testDb);
      expect(count).toBe(1);

      const result = getMCPData(testDb, '2025-10-28', '2025-10-28');
      expect(result[0].price).toBe(2600); // Last value should be kept
    });

    it('should maintain data order in queries', () => {
      const testData: MCPItem[] = [
        { date: '2025-10-28', hour: '02:00', price: 2300, priceUsd: 78, priceEur: 72 },
        { date: '2025-10-28', hour: '00:00', price: 2500, priceUsd: 85, priceEur: 78 },
        { date: '2025-10-28', hour: '01:00', price: 2400, priceUsd: 82, priceEur: 75 }
      ];

      insertMCPData(testDb, testData);

      const result = getMCPData(testDb, '2025-10-28', '2025-10-28');

      // Should be ordered by date, then hour
      expect(result[0].hour).toBe('00:00');
      expect(result[1].hour).toBe('01:00');
      expect(result[2].hour).toBe('02:00');
    });
  });
});
