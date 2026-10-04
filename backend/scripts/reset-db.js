import { env } from '../src/config/env.js';
import { removeDatabaseFiles } from '../src/db/maintenance.js';

if (env.nodeEnv === 'production') {
  console.error('Refusing to delete the database when NODE_ENV is production.');
  process.exit(1);
}

removeDatabaseFiles(env.dbPath);
console.log(`Removed ${env.dbPath} and its WAL files, if they existed.`);
