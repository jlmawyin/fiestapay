/**
 * Tipos públicos de `setup.mjs` para las pruebas (NAP-F2 / NAP-F4s).
 * No se ejecuta; solo describe `runSetup` con sus dependencias inyectables.
 */
export interface RunSetupOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  salida?: (linea: string) => void;
}

export interface RunSetupResult {
  dryRun: boolean;
  ids: {
    funciones: string[];
    faqs: { es: string; en: string };
    conocimiento: string | null;
    agentes: { es: string; en: string };
  } | null;
}

export function runSetup(options?: RunSetupOptions): Promise<RunSetupResult>;
