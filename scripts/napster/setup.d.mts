/**
 * Tipos públicos de `setup.mjs` para las pruebas (NAP-F2 / NAP-F4s / NAP-S1).
 * No se ejecuta; solo describe `runSetup` con sus dependencias inyectables.
 */
export interface RunSetupOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  salida?: (linea: string) => void;
  /** NAP-S1: ruta alternativa del catálogo para no escribir el contenido real en pruebas. */
  catalogPath?: string;
  /** NAP-S5: ruta alternativa de ids.json para no escribir el archivo real en pruebas. */
  idsPath?: string;
}

export interface RunSetupResult {
  dryRun: boolean;
  ids: {
    funciones: string[];
    faqs: { es: string; en: string };
    conocimiento: string | null;
    agentes: { es: string; en: string };
  } | null;
  /** NAP-S1: resumen de `--catalog`. */
  catalogo?: { creados: number; actualizados: number; cambio: boolean } | null;
  /** NAP-S1: voces devueltas por `--list-voices`, o [] si la API no las expone. */
  voces?: unknown[] | null;
}

export function runSetup(options?: RunSetupOptions): Promise<RunSetupResult>;
