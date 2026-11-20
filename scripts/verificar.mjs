/**
 * Comando único de la etapa Somos Panas: valida contenido/, corre pruebas del mapa y npm run check.
 * Depende de: scripts/lib/validar-contenido.mjs, vitest, npm run check.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainValidarContenido } from './lib/validar-contenido.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, '..');

function ejecutar(comando, args, etiqueta) {
  const resultado = spawnSync(comando, args, {
    cwd: RAIZ,
    stdio: 'inherit',
    shell: false,
  });
  if (resultado.status !== 0) {
    console.error(`verificar: falló ${etiqueta} (código ${resultado.status ?? 1})`);
    process.exit(resultado.status ?? 1);
  }
}

const codigoValidacion = mainValidarContenido();
if (codigoValidacion !== 0) {
  process.exit(codigoValidacion);
}

ejecutar(
  'npx',
  ['vitest', 'run', '--config', 'scripts/vitest.somospanas.config.ts'],
  'pruebas del mapa (somospanas)',
);

ejecutar('npm', ['run', 'check'], 'npm run check');

console.log('verificar: contenido válido, pruebas del mapa y check en verde.');