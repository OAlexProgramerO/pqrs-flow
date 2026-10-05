import { env } from '../src/config/env.js';
import { openDatabase } from '../src/db/database.js';
import { seedDemoData } from '../src/db/seed.js';
import { createPqrsRepository } from '../src/repositories/pqrs.repository.js';

if (env.nodeEnv === 'production') {
  console.error('Refusing to add demo data when NODE_ENV is production.');
  process.exit(1);
}

const db = openDatabase();

try {
  const created = seedDemoData(createPqrsRepository(db));
  const first = created[0].caseNumber;
  const last = created[created.length - 1].caseNumber;

  console.log(`Added ${created.length} demo requests (${first} to ${last}) to ${env.dbPath}`);
  console.log(`Try the tracking page with ${first} and ${created[0].requesterEmail}`);
} finally {
  db.close();
}
