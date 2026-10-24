import { withTransaction, type Pool } from '../db/pool.js';
import { HttpError } from '../errors.js';

/** Reserve before the model call; timeouts still consume this reservation. Cookie resets and
 * concurrent requests cannot bypass the shared daily cap. Counts are UTC calendar days. */
export async function reserveAiRequest(pool: Pool, sessionId: string, eventId: string, dailyLimit = 200) {
  await withTransaction(pool, async db => {
    await db.query('SELECT pg_advisory_xact_lock(778899125)');
    const {rows} = await db.query<{total:string,personal:string}>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE session_id=$1)::text AS personal FROM ai_requests
      WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,[sessionId]);
    if(Number(rows[0]?.total)>=dailyLimit || Number(rows[0]?.personal)>=60) {
      throw new HttpError(429,'Se alcanzó el límite de consultas IA; continúa con el formulario');
    }
    await db.query('INSERT INTO ai_requests(session_id,event_id) VALUES($1,$2)',[sessionId,eventId]);
  });
}
