import type Database from 'better-sqlite3';

const FORECAST_COMPONENT_COLUMNS = [
  'prophet_component',
  'xgboost_component',
  'lstm_component',
] as const;

export function ensureForecastHistoryComponentColumns(db: Database.Database): string[] {
  const columns = db.prepare('PRAGMA table_info(forecast_history)').all() as { name: string }[];
  const existingColumns = new Set(columns.map((column) => column.name));
  const addedColumns: string[] = [];

  for (const column of FORECAST_COMPONENT_COLUMNS) {
    if (!existingColumns.has(column)) {
      db.exec(`ALTER TABLE forecast_history ADD COLUMN ${column} REAL`);
      addedColumns.push(column);
    }
  }

  return addedColumns;
}
