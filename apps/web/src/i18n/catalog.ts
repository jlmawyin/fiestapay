/**
 * Flat message table. `NoInfer` on the English side makes `en` follow `es`
 * exactly: a missing key, an extra key, or a value of the wrong shape is a
 * type error at the catalog definition site.
 */
export type Messages = Record<string, string | ((...args: never[]) => string)>;

export interface LocaleCatalog<M extends Messages> {
  es: M;
  en: M;
}

export function defineCatalog<M extends Messages>(catalog: { es: M; en: NoInfer<M> }): LocaleCatalog<M> {
  return catalog;
}
