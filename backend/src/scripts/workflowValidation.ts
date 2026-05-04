import Database from 'better-sqlite3';
import fs from 'fs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

type ValidationOptions = {
  strictForecasts?: boolean;
  strictSyncData?: boolean;
};

const HOURLY_TABLES = ['mcp_data', 'generation_data', 'consumption_data'] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getExpectedCompleteDataDay(now = dayjs()): string {
  return now.tz('Europe/Istanbul').startOf('day').subtract(1, 'day').format('YYYY-MM-DD');
}

function validateSyncedData(db: Database.Database, expectedDay = getExpectedCompleteDataDay()) {
  for (const table of HOURLY_TABLES) {
    const latest = db.prepare(`SELECT MAX(date) as latest_date FROM ${table}`).get() as { latest_date: string | null };
    assert(latest.latest_date, `${table} has no data`);

    const latestDay = latest.latest_date.slice(0, 10);
    assert(
      latestDay >= expectedDay,
      `${table} latest day ${latestDay} is older than expected complete day ${expectedDay}`,
    );

    const dayStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT substr(date, 12, 2)) as distinct_hours
      FROM ${table}
      WHERE substr(date, 1, 10) = ?
    `).get(latestDay) as { total: number; distinct_hours: number };

    assert(dayStats.total >= 24, `${table} latest day ${latestDay} has ${dayStats.total} rows, expected at least 24`);
    assert(
      dayStats.distinct_hours === 24,
      `${table} latest day ${latestDay} has ${dayStats.distinct_hours} distinct hours, expected 24`,
    );
  }
}

function validateDatabase(dbPath: string, options: ValidationOptions = {}) {
  const strictForecasts = options.strictForecasts ?? true;
  const strictSyncData = options.strictSyncData ?? true;
  const db = new Database(dbPath, { readonly: true });

  try {
    const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    assert(integrity.integrity_check === 'ok', `database integrity_check failed: ${integrity.integrity_check}`);

    const columns = db.prepare('PRAGMA table_info(forecast_history)').all() as { name: string }[];
    const columnNames = new Set(columns.map((column) => column.name));
    for (const column of ['prophet_component', 'xgboost_component', 'lstm_component']) {
      assert(columnNames.has(column), `forecast_history missing column: ${column}`);
    }

    if (strictSyncData) {
      validateSyncedData(db);
    }

    if (!strictForecasts) {
      return 'db-only';
    }

    const latestWeek = db.prepare(`
      SELECT week_start
      FROM forecast_history
      GROUP BY week_start
      ORDER BY week_start DESC
      LIMIT 1
    `).get() as { week_start: string } | undefined;
    assert(latestWeek, 'forecast_history has no forecast weeks');

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN predicted_price < 0 THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN predicted_price IS NULL THEN 1 ELSE 0 END) as null_count
      FROM forecast_history
      WHERE week_start = ?
    `).get(latestWeek.week_start) as { total: number; negative_count: number; null_count: number };

    assert(stats.total === 168, `latest forecast week ${latestWeek.week_start} has ${stats.total} rows, expected 168`);
    assert(stats.negative_count === 0, `latest forecast week has ${stats.negative_count} negative predictions`);
    assert(stats.null_count === 0, `latest forecast week has ${stats.null_count} null predictions`);

    return latestWeek.week_start;
  } finally {
    db.close();
  }
}

function validateForecastJson(jsonPath: string) {
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw);
  const forecasts = data?.current_week?.forecasts;

  assert(Array.isArray(forecasts), 'forecasts.json current_week.forecasts is not an array');
  assert(forecasts.length === 168, `forecasts.json has ${forecasts.length} current forecasts, expected 168`);
  assert(data.model_type, 'forecasts.json missing model_type');
  assert(data.models_count >= 2, 'forecasts.json models_count must be at least 2');
  assert(data.quality, 'forecasts.json missing quality report');

  const invalid = forecasts.filter((forecast: { predicted: unknown }) => (
    typeof forecast.predicted !== 'number' ||
    !Number.isFinite(forecast.predicted) ||
    forecast.predicted < 0
  ));
  assert(invalid.length === 0, `forecasts.json has ${invalid.length} invalid predictions`);
}

export {
  validateDatabase,
  validateForecastJson,
  validateSyncedData,
  getExpectedCompleteDataDay,
};
