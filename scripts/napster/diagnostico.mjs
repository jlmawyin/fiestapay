/**
 * Diagnóstico de hosts Napster para el catálogo de avatares (NAP-F2).
 * Depende de `fetch` y `NAPSTER_API_KEY`; imprime solo host y código HTTP, nunca la clave.
 * Guarda `.local/napster/catalogo.json` con id, nombre, género y URL de imagen.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUTA_CATALOGO = join(RAIZ, '.local', 'napster', 'catalogo.json');
const RUTA = '/public/companions/napster-stock?pageSize=12';
const HOSTS = ['https://napster-api.napster.com', 'https://companion-api.napster.com'];

function listaDeCompanions(json) {
  if (Array.isArray(json)) return json;
  for (const clave of ['items', 'data', 'companions', 'results']) {
    if (Array.isArray(json?.[clave])) return json[clave];
  }
  if (Array.isArray(json?.data?.items)) return json.data.items;
  return [];
}

function normalizar(item) {
  const nombre =
    (typeof item?.name === 'string' && item.name) ||
    [item?.firstName, item?.lastName].filter((parte) => typeof parte === 'string' && parte).join(' ') ||
    (typeof item?.displayName === 'string' ? item.displayName : '');
  return {
    id: typeof item?.id === 'string' ? item.id : String(item?.id ?? ''),
    nombre: nombre || null,
    genero: typeof item?.gender === 'string' ? item.gender : null,
    ethnicity: typeof item?.ethnicity === 'string' ? item.ethnicity : null,
    previewUrl: typeof item?.previewUrl === 'string' ? item.previewUrl : null,
    videoLoopUrl: typeof item?.videoLoopUrl === 'string' ? item.videoLoopUrl : null,
  };
}

async function main() {
  const apiKey = (process.env.NAPSTER_API_KEY ?? '').trim();
  if (!apiKey) {
    console.error('napster:diagnostico requiere NAPSTER_API_KEY en el entorno (no se imprime).');
    process.exitCode = 1;
    return;
  }

  let catalogo = null;
  for (const base of HOSTS) {
    const host = new URL(base).host;
    try {
      const respuesta = await fetch(`${base}${RUTA}`, {
        headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      });
      console.log(`${host} -> HTTP ${respuesta.status}`);
      if (!respuesta.ok || catalogo) continue;
      const json = await respuesta.json();
      const items = listaDeCompanions(json).map(normalizar).filter((item) => item.id);
      if (items.length > 0) {
        catalogo = { host, generadoEn: new Date().toISOString(), items };
      }
    } catch {
      console.log(`${host} -> error de red`);
    }
  }

  if (!catalogo) {
    console.error('napster:diagnostico no obtuvo un catálogo con avatares.');
    process.exitCode = 1;
    return;
  }

  await mkdir(dirname(RUTA_CATALOGO), { recursive: true });
  await writeFile(RUTA_CATALOGO, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
  console.log(`catálogo: ${catalogo.items.length} avatares en ${RUTA_CATALOGO}`);
}

await main();
