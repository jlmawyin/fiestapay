// Does not print credentials, tokens, response bodies or buyer details.
// Only the selected chat provider (LLM_PROVIDER, default openai) is contacted; the other is never called.
const results=[];
const has=(...names)=>names.every(n=>Boolean(process.env[n]?.trim()));
const llmProvider=(process.env.LLM_PROVIDER?.trim()||'openai').toLowerCase();
if(llmProvider!=='openai'&&llmProvider!=='gemini'){console.error('LLM_PROVIDER invalido: use openai o gemini');process.exit(1);}
async function check(name,call){try{const r=await call();results.push({provider:name,configured:true,httpStatus:r.status,authenticated:r.ok});}catch{results.push({provider:name,configured:true,authenticated:false,error:'Network or provider error; inspect account privately.'});}}
if(has('PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET')) await check('paypal-sandbox',()=>fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(process.env.PAYPAL_CLIENT_ID+':'+process.env.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)}));
else results.push({provider:'paypal-sandbox',configured:false});
if(llmProvider==='openai'){
  // Model metadata lookup: authenticates and confirms model access without generating tokens.
  const model=process.env.OPENAI_MODEL?.trim()||'gpt-6-luna';
  const base=(process.env.OPENAI_BASE_URL?.trim()||'https://api.openai.com/v1').replace(/\/+$/,'');
  if(!base.startsWith('https://')) results.push({provider:'openai',configured:false,error:'OPENAI_BASE_URL must use https'});
  else if(has('OPENAI_API_KEY')) await check('openai',()=>fetch(base+'/models/'+encodeURIComponent(model),{headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},signal:AbortSignal.timeout(15000)}));
  else results.push({provider:'openai',configured:false});
  results.push({provider:'gemini',skipped:true,reason:'LLM_PROVIDER=openai'});
}else{
  if(has('GEMINI_API_KEY')) await check('gemini',()=>fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(15000)}));
  else results.push({provider:'gemini',configured:false});
  results.push({provider:'openai',skipped:true,reason:'LLM_PROVIDER=gemini'});
}
if(has('ASSEMBLYAI_API_KEY')) await check('assemblyai-voice-token',()=>fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=60&max_session_duration_seconds=60',{headers:{Authorization:'Bearer '+process.env.ASSEMBLYAI_API_KEY},signal:AbortSignal.timeout(15000)}));
else results.push({provider:'assemblyai-voice-token',configured:false});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),llmProvider,results,note:'Authentication only; does not prove checkout, model function calling, balance or spoken conversation.'},null,2));
