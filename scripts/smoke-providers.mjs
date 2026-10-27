// Explicit sandbox smoke, never a substitute for buyer approval or human microphone testing.
import { writeFile } from 'node:fs/promises';
const base = process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:3000';
let cookie = '';
const evidence = { checkedAt:new Date().toISOString(), checks:[] };
async function request(path, body) {
  const res = await fetch(base+'/api'+path, {method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  if (res.headers.get('set-cookie')) cookie=res.headers.get('set-cookie').split(';')[0];
  const value = await res.json();
  if (!res.ok) throw new Error(path+' HTTP '+res.status+' '+(value.error??''));
  return value;
}
try {
  const caps = await request('/capabilities');
  evidence.checks.push({name:'configuration',paypal:caps.paypal,chat:Boolean(caps.chat),llmProvider:caps.llmProvider ?? null,voice:caps.voice});
  const {event} = await request('/demo',{});
  const path = '/events/'+event.slug;
  await request(path+'/join',{name:'Prueba técnica'});
  await request(path+'/rsvp',{status:'yes',companions:1});
  const {quote} = await request(path+'/quote',{});
  if(quote.amountCents!==5000 || quote.people!==2) throw new Error('Unexpected quote');
  evidence.checks.push({name:'server-quote',people:quote.people,totalCents:quote.amountCents});
  if(process.argv.includes('--chat')) {
    try {
      const chat = await request(path+'/chat',{message:'Consulta prepare_quote para cotizar mi cuota. Repite la cuenta y pide confirmación; no crees ninguna orden.'});
      evidence.checks.push({name:'selected-chat',quoteFromTool:chat.quote?.amountCents===5000,text:chat.text});
    } catch(e) { evidence.checks.push({name:'selected-chat',error:e.message}); }
  }
  if(process.argv.includes('--order')) {
    try {
      const order = await request(path+'/orders',{quoteId:quote.id,confirmed:true});
      evidence.checks.push({name:'paypal-order',created:!!order.orderId,status:order.status,approvalPending:true});
    } catch(e) { evidence.checks.push({name:'paypal-order',error:e.message}); }
  }
  if(process.argv.includes('--voice') && caps.voice) {
    const {token,sessionConfig,leaseId} = await request(path+'/voice/token',{consent:true});
    const stats={name:'assemblyai-websocket',ready:false,audioChunks:0,toolResults:0,humanMicrophoneTest:false};
    await new Promise((resolve,reject)=>{
      const ws=new WebSocket('wss://agents.assemblyai.com/v1/ws?token='+encodeURIComponent(token));
      let requested=false, pending=[];
      const finish=()=>{clearTimeout(timer);if(ws.readyState===1)ws.send(JSON.stringify({type:'session.end'}));setTimeout(()=>ws.close(),500);resolve();};
      const timer=setTimeout(finish,30000);
      ws.onopen=()=>ws.send(JSON.stringify({type:'session.update',session:sessionConfig}));
      ws.onerror=()=>{clearTimeout(timer);reject(new Error('Voice socket failed'));};
      ws.onmessage=async({data})=>{
        const e=JSON.parse(data);
        if(e.type==='session.ready')stats.ready=true;
        if(e.type==='reply.audio')stats.audioChunks++;
        if(e.type==='session.error'){stats.error=e.code??'provider-error';finish();}
        if(e.type==='tool.call')pending.push(e);
        if(e.type==='reply.done'){
          if(pending.length){
            const batch=pending;pending=[];
            for(const call of batch){
              try {
                const result=await request(path+'/voice/tool',{leaseId,name:call.name,arguments:call.arguments??{}});
                if(ws.readyState===1)ws.send(JSON.stringify({type:'tool.result',call_id:call.call_id,result:JSON.stringify(result.response),is_error:false}));
                stats.toolResults++;
              } catch{stats.error='tool-failed';finish();}
            }
          } else if(!requested) {
            requested=true;ws.send(JSON.stringify({type:'reply.create',instructions:'Usa get_event_details para consultar el evento y dime qué incluye.'}));
          } else if(stats.toolResults>0 && stats.audioChunks>0) finish();
        }
      };
    });
    evidence.checks.push(stats);
  }
} catch(e) {evidence.error=e.message;process.exitCode=1;}
await writeFile('.local/provider-smoke.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
