/**
 * Pruebas del `--dry-run` de `scripts/napster/setup.mjs` (NAP-F2 / NAP-F4s), sin red.
 * Depende del propio script y de los contratos de tools; no escribe `.local/napster/ids.json`.
 */
import { describe, expect, it, vi } from 'vitest';
import { runSetup } from '../../../scripts/napster/setup.mjs';

function salidaCapturada() {
  const lineas: string[] = [];
  return { lineas, salida: (linea: string) => lineas.push(linea) };
}

describe('napster:setup --dry-run (NAP-F4s)', () => {
  it('imprime el plan con FAQ por idioma sin llamar a la red ni escribir ids', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('no debe haber red en --dry-run');
    });
    const { lineas, salida } = salidaCapturada();
    const resultado = await runSetup({
      argv: ['--dry-run', '--companion', 'comp_demo', '--voice', 'voz_demo'],
      env: { NAPSTER_API_KEY: 'no-se-imprime', NAPSTER_API_BASE: 'https://napster.test' },
      fetchImpl,
      salida,
    });

    expect(resultado.dryRun).toBe(true);
    expect(resultado.ids).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lineas.join('\n')).toContain('sin red');
    expect(lineas.join('\n')).toContain('comp_demo');
    expect(lineas.join('\n')).toContain('voz_demo');
    expect(lineas.join('\n')).toContain('FAQ es: somospanas-faq-es');
    expect(lineas.join('\n')).toContain('FAQ en: somospanas-faq-en');
    expect(lineas.join('\n')).toContain('conocimiento: no configurado');
    expect(lineas.join('\n')).toContain('somospanas-es');
    expect(lineas.join('\n')).not.toContain('no-se-imprime');
  });

  it('con --knowledge-base-url imprime los dos markdown sin red', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('no debe haber red en --dry-run');
    });
    const { lineas, salida } = salidaCapturada();
    await runSetup({
      argv: [
        '--dry-run',
        '--companion',
        'comp_demo',
        '--voice',
        'voz_demo',
        '--knowledge-base-url',
        'https://somospanas.com/conocimiento/',
      ],
      env: { NAPSTER_API_KEY: 'no-se-imprime', NAPSTER_API_BASE: 'https://napster.test' },
      fetchImpl,
      salida,
    });

    const texto = lineas.join('\n');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(texto).toContain('conocimiento: somospanas-conocimiento');
    expect(texto).toContain('https://somospanas.com/conocimiento/somospanas.es.md');
    expect(texto).toContain('https://somospanas.com/conocimiento/somospanas.en.md');
  });
});
