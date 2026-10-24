import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { migrate } from './migrate.js';

const config = loadConfig();
if (!config.databaseUrl) {
  console.error('DATABASE_URL es obligatorio para migrar.');
  process.exit(1);
}
const pool = createPool({ connectionString: config.databaseUrl });
try {
  const result = await migrate(pool);
  console.log(`aplicadas: ${result.applied.length ? result.applied.join(', ') : 'ninguna'}`);
} finally {
  await pool.end();
}
