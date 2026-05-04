import { describe, it, expect, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { ensureForecastHistoryComponentColumns } from '../schemaMigration.js';

describe('schema migration helpers', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('adds forecast component columns to an existing forecast_history table', () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE forecast_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        forecast_datetime TEXT NOT NULL,
        predicted_price REAL NOT NULL,
        actual_price REAL,
        absolute_error REAL,
        percentage_error REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(week_start, forecast_datetime)
      )
    `);

    const added = ensureForecastHistoryComponentColumns(db);
    const columns = db.prepare('PRAGMA table_info(forecast_history)').all() as { name: string }[];

    expect(added).toEqual(['prophet_component', 'xgboost_component', 'lstm_component']);
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['prophet_component', 'xgboost_component', 'lstm_component'])
    );
  });

  it('is idempotent when component columns already exist', () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE forecast_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        forecast_datetime TEXT NOT NULL,
        predicted_price REAL NOT NULL,
        actual_price REAL,
        absolute_error REAL,
        percentage_error REAL,
        prophet_component REAL,
        xgboost_component REAL,
        lstm_component REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(week_start, forecast_datetime)
      )
    `);

    expect(ensureForecastHistoryComponentColumns(db)).toEqual([]);
  });
});
