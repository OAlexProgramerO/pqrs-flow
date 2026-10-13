import { createAdminContext } from '../src/admin-context.js';
import { runAdminCli } from '../src/cli/admin-cli.js';
import { openDatabase } from '../src/db/database.js';

// Opens the same database as the server (DB_PATH) and applies pending migrations
const db = openDatabase();

try {
  const { accountService } = createAdminContext(db);
  process.exitCode = await runAdminCli(process.argv.slice(2), { accountService });
} finally {
  db.close();
}
