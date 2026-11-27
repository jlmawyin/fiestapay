// NAP-F5a: la única IA es Napster. Este chequeo solo verifica presencia de variables,
// sin imprimir valores ni llamar a la red.
const has = (name) => Boolean(process.env[name]?.trim());
const config = {
  enabled: (process.env.NAPSTER_ENABLED ?? '').trim().toLowerCase() === 'true',
  apiKey: has('NAPSTER_API_KEY'),
  apiBase: has('NAPSTER_API_BASE'),
  agentEs: has('NAPSTER_AGENT_ID_ES'),
  agentEn: has('NAPSTER_AGENT_ID_EN'),
};
const listo = config.enabled && config.apiKey && config.agentEs && config.agentEn;
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), napster: { ...config, listo }, note: 'Solo presencia de variables; no prueba sesiones ni créditos.' }, null, 2));
if (!listo) process.exitCode = 1;
