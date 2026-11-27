/**
 * Comando único de la etapa Somos Panas: valida contenido/, corre pruebas del mapa y npm run check.
 * Depende de: scripts/lib/validar-contenido.mjs, vitest, npm run check.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainValidarContenido } from './lib/validar-contenido.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, '..');
const NPM_EXECPATH = process.env.npm_execpath;

/**
 * Cita un argumento para cmd.exe cuando hay que pasar una sola cadena.
 * @param {string} valor - Argumento a citar.
 * @returns {string} Argumento listo para la línea de comandos.
 */
function citarParaCmd(valor) {
  return /[\s"&|<>^]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

/**
 * Ejecuta un subcomando y termina el proceso si falla (D-2).
 * @param {string} comando - Binario a invocar (p. ej. `npx`, `npm`).
 * @param {string[]} args - Argumentos del proceso hijo.
 * @param {string} etiqueta - Nombre legible para el mensaje de error en stderr.
 * @returns {void} No devuelve valor; sale con `process.exit` si el código ≠ 0.
 */
function ejecutar(comando, args, etiqueta) {
  // NAP-F0: en Windows `npm` y `npx` son .cmd; spawnSync con shell:false y stdio
  // heredado devuelve ENOENT. Si npm nos presta su CLI lo invocamos con Node;
  // si no, usamos cmd.exe solo en Windows y con una única cadena (sin DEP0190).
  let binario = comando;
  let argumentos = args;
  let shell = false;
  if (process.platform === 'win32') {
    const cli = comando === 'npm'
      ? NPM_EXECPATH
      : comando === 'npx' && NPM_EXECPATH
        ? join(dirname(NPM_EXECPATH), 'npx-cli.js')
        : undefined;
    if (cli && existsSync(cli)) {
      binario = process.execPath;
      argumentos = [cli, ...args];
    } else {
      binario = [comando, ...args].map(citarParaCmd).join(' ');
      argumentos = [];
      shell = true;
    }
  }
  const resultado = spawnSync(binario, argumentos, {
    cwd: RAIZ,
    stdio: 'inherit',
    shell,
  });
  if (resultado.error) {
    console.error(`verificar: no se pudo ejecutar ${etiqueta}: ${resultado.error.message}`);
    process.exit(1);
  }
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