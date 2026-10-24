import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';

const config = loadConfig();

// Production requires real persistence and a known public origin. There is no in-memory
// fallback and no implicit origin allowlist: failing fast beats serving a broken demo.
if (!config.databaseUrl) {
  console.error('DATABASE_URL es obligatorio: FiestaPay requiere PostgreSQL.');
  process.exit(1);
}
if (config.allowedOrigins.length === 0) {
  console.error('PUBLIC_ORIGIN (o ALLOWED_ORIGINS) es obligatorio para validar el origen de las mutaciones.');
  process.exit(1);
}

const pool = createPool({ connectionString: config.databaseUrl });

if (process.env.MIGRATE_ON_BOOT !== '0') {
  const result = await migrate(pool);
  if (result.applied.length > 0) console.log(`migraciones aplicadas: ${result.applied.join(', ')}`);
}

const app = await buildApp({ pool, config });

if (!config.paypal) app.log.warn(`PayPal deshabilitado: ${config.paypalDisabledReason}`);
if (!config.gemini) app.log.warn(`Gemini deshabilitado: ${config.geminiDisabledReason}`);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`cerrando por ${signal}`);
  try {
    await app.close();
    await pool.end();
  } finally {
    process.exit(0);
  }
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
