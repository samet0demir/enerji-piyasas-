/**
 * Catch-up Sync Script
 *
 * Fills missing days between the latest database date and yesterday
 * in Europe/Istanbul time.
 */

import Database from 'better-sqlite3';
import { fetchMCP, fetchGeneration, fetchConsumption } from '../services/epiasClient.js';
import { insertMCPData, insertGenerationData, insertConsumptionData } from '../services/database.js';
import { ensureForecastHistoryComponentColumns } from '../services/schemaMigration.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { assertExpectedHourlyItems } from './catchUpValidation.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, '../../logs/catch-up-sync.log');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, `${logMessage}\n`);
}

function getLastDate(db: Database.Database): string | null {
  const result = db.prepare(`
    SELECT MAX(date) as last_date
    FROM mcp_data
  `).get() as { last_date: string | null };

  return result.last_date;
}

function getDaysBetweenInclusive(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function chunkDates(dates: string[], chunkSize: number = 30): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += chunkSize) {
    chunks.push(dates.slice(i, i + chunkSize));
  }
  return chunks;
}

async function catchUpSync() {
  log('============================================================');
  log('CATCH-UP SYNC - Missing day fill');
  log('============================================================');

  const dbPath = path.join(__dirname, '../../data/energy.db');
  const db = Database(dbPath);

  try {
    const addedForecastColumns = ensureForecastHistoryComponentColumns(db);
    if (addedForecastColumns.length > 0) {
      log(`Forecast schema migrated: ${addedForecastColumns.join(', ')}`);
    }

    const lastDate = getLastDate(db);

    if (!lastDate) {
      throw new Error('Database is empty. Run the full data bootstrap first.');
    }

    log(`Latest data date: ${lastDate}`);

    const timezoneName = 'Europe/Istanbul';
    const lastDateDay = dayjs(lastDate).tz(timezoneName).startOf('day');
    const yesterdayTR = dayjs().tz(timezoneName).startOf('day').subtract(1, 'day');
    const fromDate = lastDateDay.add(1, 'day');
    const toDate = yesterdayTR;

    log(`Check range: ${fromDate.format('YYYY-MM-DD')} - ${toDate.format('YYYY-MM-DD')} inclusive`);

    if (fromDate.isAfter(toDate)) {
      log('No missing days. Database is current.');
      return;
    }

    const missingDays = getDaysBetweenInclusive(fromDate.format('YYYY-MM-DD'), toDate.format('YYYY-MM-DD'));

    if (missingDays.length === 0) {
      log('No missing days. Database is current.');
      return;
    }

    const startDate = missingDays[0];
    const endDate = missingDays[missingDays.length - 1];
    log(`${missingDays.length} missing day(s): ${startDate} - ${endDate}`);

    log('------------------------------------------------------------');
    log('Fetching MCP price data...');
    log('------------------------------------------------------------');
    const mcpResponse = await fetchMCP(startDate, endDate);
    assertExpectedHourlyItems('MCP', mcpResponse.items, missingDays.length);
    const insertedMCP = insertMCPData(mcpResponse.items);
    log(`${insertedMCP} MCP records inserted`);

    log('------------------------------------------------------------');
    log('Fetching generation data...');
    log('------------------------------------------------------------');
    const generationChunks = chunkDates(missingDays, 30);
    let totalGeneration = 0;

    for (let i = 0; i < generationChunks.length; i++) {
      const chunk = generationChunks[i];
      const chunkStart = chunk[0];
      const chunkEnd = chunk[chunk.length - 1];

      log(`Chunk ${i + 1}/${generationChunks.length}: ${chunkStart} - ${chunkEnd}`);
      const genResponse = await fetchGeneration(chunkStart, chunkEnd);
      assertExpectedHourlyItems('Generation', genResponse.items, chunk.length);
      const insertedGen = insertGenerationData(genResponse.items);
      totalGeneration += insertedGen;
      log(`${insertedGen} generation records inserted`);

      if (i < generationChunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    log(`Total generation records inserted: ${totalGeneration}`);

    log('------------------------------------------------------------');
    log('Fetching consumption data...');
    log('------------------------------------------------------------');
    const consResponse = await fetchConsumption(startDate, endDate);
    assertExpectedHourlyItems('Consumption', consResponse.items, missingDays.length);
    const insertedCons = insertConsumptionData(consResponse.items);
    log(`${insertedCons} consumption records inserted`);

    const finalCount = db.prepare('SELECT COUNT(*) as count FROM mcp_data').get() as { count: number };
    const finalGenCount = db.prepare('SELECT COUNT(*) as count FROM generation_data').get() as { count: number };
    const finalConsCount = db.prepare('SELECT COUNT(*) as count FROM consumption_data').get() as { count: number };

    log('============================================================');
    log('CATCH-UP SYNC COMPLETED');
    log(`Total MCP records: ${finalCount.count}`);
    log(`Total generation records: ${finalGenCount.count}`);
    log(`Total consumption records: ${finalConsCount.count}`);
    log('============================================================');
  } catch (error) {
    log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    log('Running WAL checkpoint...');
    db.pragma('wal_checkpoint(TRUNCATE)');
    log('WAL checkpoint completed');
    db.close();
  }
}

catchUpSync()
  .then(() => {
    log('Catch-up sync finished');
    process.exit(0);
  })
  .catch((error) => {
    log('Catch-up sync failed');
    console.error(error);
    process.exit(1);
  });

export { catchUpSync };
