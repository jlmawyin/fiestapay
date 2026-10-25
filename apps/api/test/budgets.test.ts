import {randomBytes} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createPool,type Pool} from '../src/db/pool.js';
import {migrate} from '../src/db/migrate.js';
import {reserveAiRequest} from '../src/ai/budget.js';
import {newId,sha256} from '../src/lib/ids.js';
import {startDemo} from '../src/domain/events.js';

describe.skipIf(!process.env.DATABASE_URL)('persisted AI consumption limits',()=>{
  const schema='fp_budget_'+randomBytes(5).toString('hex');
  let pool:Pool;
  beforeAll(async()=>{pool=createPool({connectionString:process.env.DATABASE_URL!,schema});await migrate(pool,{schema});});
  afterAll(async()=>{await pool?.end();const admin=createPool({connectionString:process.env.DATABASE_URL!});await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();});
  it('serializes concurrent reservations and a new session cannot bypass the global budget',async()=>{
    const first=newId(),second=newId();
    await pool.query('INSERT INTO sessions(id,token_hash) VALUES($1,$2),($3,$4)',[first,sha256('first'),second,sha256('second')]);
    const event=await startDemo(pool,first);
    const results=await Promise.allSettled([reserveAiRequest(pool,first,event.id,1),reserveAiRequest(pool,second,event.id,1)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    await expect(reserveAiRequest(pool,second,event.id,1)).rejects.toMatchObject({statusCode:429});
    expect((await pool.query('SELECT count(*)::int AS count FROM ai_requests')).rows[0].count).toBe(1);
  });
});
