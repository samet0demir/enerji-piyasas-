import { describe, it, expect } from '@jest/globals';
import Database from 'better-sqlite3';
import { validateSyncedData } from '../workflowValidation.js';

function createHourlyTable(db: Database.Database, table: string) {
  db.exec(`CREATE TABLE ${table} (date TEXT PRIMARY KEY)`);
}

function insertDay(db: Database.Database, table: string, day: string, hours = 24) {
  const insert = db.prepare(`INSERT INTO ${table} (date) VALUES (?)`);
  for (let hour = 0; hour < hours; hour++) {
    insert.run(`${day}T${hour.toString().padStart(2, '0')}:00:00+03:00`);
  }
}

describe('workflow output data freshness validation', () => {
  it('accepts all hourly tables when the expected day has 24 distinct hours', () => {
    const db = new Database(':memory:');
    for (const table of ['mcp_data', 'generation_data', 'consumption_data']) {
      createHourlyTable(db, table);
      insertDay(db, table, '2026-05-03');
    }

    expect(() => validateSyncedData(db, '2026-05-03')).not.toThrow();
    db.close();
  });

  it('throws when a latest day is missing an hourly record', () => {
    const db = new Database(':memory:');
    createHourlyTable(db, 'mcp_data');
    createHourlyTable(db, 'generation_data');
    createHourlyTable(db, 'consumption_data');
    insertDay(db, 'mcp_data', '2026-05-03');
    insertDay(db, 'generation_data', '2026-05-03', 23);
    insertDay(db, 'consumption_data', '2026-05-03');

    expect(() => validateSyncedData(db, '2026-05-03')).toThrow(
      'generation_data latest day 2026-05-03 has 23 rows, expected at least 24'
    );
    db.close();
  });
});
