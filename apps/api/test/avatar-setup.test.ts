/**
 * Prueba del `--dry-run` de `scripts/napster/setup.mjs` (NAP-F2), sin red.
 * Depende del propio script y de los contratos de tools; no escribe `.local/napster/ids.json`.
 */
import { describe, expect, it, vi } from 'vitest';
import { runSetup } from '../../../scripts/napster/setup.mjs';

describe('napster:setup --dry-run (NAP-F2)', () => {
  it('imprime el plan sin llamar a la red ni escribir ids', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('no debe haber red en --dry-run');
    });
    const lineas: string[] = [];
    const resultado = await runSetup({
      argv: ['--dry-run', '--companion', 'comp_demo', '--voice', 'voz_demo'],
      env: { NAPSTER_API_KEY: 'no-se-imprime', NAPSTER_API_BASE: 'https://napster.test' },
      fetchImpl,
      salida: (linea: string) => lineas.push(linea),
    });

    expect(resultado.dryRun).toBe(true);
    expect(resultado.ids).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lineas.join('\n')).toContain('sin red');
    expect(lineas.join('\n')).toContain('comp_demo');
    expect(lineas.join('\n')).toContain('voz_demo');
    expect(lineas.join('\n')).toContain('somospanas-es');
    expect(lineas.join('\n')).not.toContain('no-se-imprime');
  });
});
