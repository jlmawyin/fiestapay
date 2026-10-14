// Does not print credentials, tokens, response bodies or buyer details.
const results=[];
const has=(...names)=>names.every(n=>Boolean(process.env[n]?.trim()));
async function check(name,call){try{const r=await call();results.push({provider:name,configured:true,httpStatus:r.status,authenticated:r.ok});}catch{results.push({provider:name,configured:true,authenticated:false,error:'Network or provider error; inspect account privately.'});}}
if(has('PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET')) await check('paypal-sandbox',()=>fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(process.env.PAYPAL_CLIENT_ID+':'+process.env.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)}));
else results.push({provider:'paypal-sandbox',configured:false});
if(has('GEMINI_API_KEY')) await check('gemini',()=>fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(15000)}));
else results.push({provider:'gemini',configured:false});
if(has('ASSEMBLYAI_API_KEY')) await check('assemblyai-voice-token',()=>fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=60&max_session_duration_seconds=60',{headers:{Authorization:'Bearer '+process.env.ASSEMBLYAI_API_KEY},signal:AbortSignal.timeout(15000)}));
else results.push({provider:'assemblyai-voice-token',configured:false});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),results,note:'Authentication only; does not prove checkout, model function calling, balance or spoken conversation.'},null,2));
