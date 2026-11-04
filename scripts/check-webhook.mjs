const base = 'https://api-m.sandbox.paypal.com';
const {PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret, PAYPAL_WEBHOOK_ID: webhook} = process.env;
if (!id || !secret || !webhook) throw new Error('Missing sandbox configuration');
const auth = await fetch(base + '/v1/oauth2/token', {method:'POST',headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(10000)});
if (!auth.ok) throw new Error('OAuth HTTP '+auth.status);
const token = (await auth.json()).access_token;
const res = await fetch(base+'/v1/notifications/webhooks',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
if (!res.ok) throw new Error('Webhook lookup HTTP '+res.status);
const data = await res.json();
const expected = 'https://fiestapay.somospanas.com/api/paypal/webhook';
const matches = data.webhooks?.filter(w=>w.url===expected) ?? [];
console.log(JSON.stringify({checkedAt:new Date().toISOString(),httpStatus:res.status,matchingWebhooks:matches.length,webhooks:matches.map(w=>({url:w.url,idMatchesConfiguration:w.id===webhook,events:w.event_types?.map(e=>e.name)}))},null,2));
if (process.argv.includes('--sync-id') && matches.length===1 && matches[0].id!==webhook) {
  const {readFile,writeFile} = await import('node:fs/promises');
  const env = await readFile('.env','utf8');
  await writeFile('.env',env.replace(/^PAYPAL_WEBHOOK_ID=.*$/m,'PAYPAL_WEBHOOK_ID='+matches[0].id));
  console.log('Updated local webhook ID from the unique registered URL. No secrets displayed.');
}
