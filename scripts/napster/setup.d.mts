/**
 * Tipos públicos de `setup.mjs` para las pruebas (NAP-F2).
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
    faq: string;
    agentes: { es: string; en: string };
  } | null;
}

export function runSetup(options?: RunSetupOptions): Promise<RunSetupResult>;
