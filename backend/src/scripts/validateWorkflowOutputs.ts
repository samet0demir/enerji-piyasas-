import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { validateDatabase, validateForecastJson } from './workflowValidation.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = dirname(moduleFilename);
const backendRoot = path.join(moduleDirname, '../..');

function runCli() {
  const dbOnly = process.argv.includes('--db-only');
  const skipSyncFreshness = process.argv.includes('--skip-sync-freshness');
  const latestWeek = validateDatabase(path.join(backendRoot, 'data/energy.db'), {
    strictForecasts: !dbOnly,
    strictSyncData: !skipSyncFreshness,
  });

  if (!dbOnly) {
    validateForecastJson(path.join(backendRoot, 'public/forecasts.json'));
  }

  console.log(dbOnly ? 'Database outputs valid' : `Workflow outputs valid for forecast week ${latestWeek}`);
}

runCli();
