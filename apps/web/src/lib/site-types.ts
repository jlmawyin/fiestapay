/** Forma de configuración de sitio devuelta por `/api/site/profile` y `/api/site/settings`. */
export interface TenantSiteSettings {
  displayName: string;
  tagline: string;
  about: string;
  colores: {
    cloudwhite: string;
    ink: string;
    inkMuted: string;
    blue: string;
    teal: string;
    yellow: string;
    coral: string;
  };
  modulos: {
    reuniones: boolean;
    eventos: boolean;
    recaudacion: boolean;
    asistente: boolean;
  };
}