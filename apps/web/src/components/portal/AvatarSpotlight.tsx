/**
 * La avatar en la portada (NAP-U2): foto de la avatar general con un globo de
 * subtítulo en el idioma activo. Si GET /api/avatars trae loopUrl para la
 * avatar default, usa ese video en bucle (mudo, autoplay, playsinline); si
 * falla o se pide reducir movimiento, vuelve a la foto.
 */
import React, { useEffect, useState } from 'react';
import { DEFAULT_AVATAR_PREVIEW_URL } from '../avatar/NapsterAvatar';

interface AvatarSpotlightProps {
  /** Saludo del globo, ya en el idioma activo. */
  saludo: string;
  /** Texto alternativo de la foto. */
  previewAlt: string;
}

/**
 * Saca el loop de la avatar default de GET /api/avatars. El contrato lo
 * integra DSH y puede no existir aún: acepta varias envolturas ({ loopUrl },
 * { default: { loopUrl } }, { avatars: [{ id: 'default', loopUrl }] }) y
 * `videoLoopUrl` como alias. Exportada para probarla sin red.
 */
export function loopUrlForDefault(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const pick = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;
  const direct = pick(record.loopUrl) ?? pick(record.videoLoopUrl);
  if (direct) return direct;
  for (const key of ['default', 'avatar']) {
    const nested = record[key];
    if (nested && typeof nested === 'object') {
      const entry = nested as Record<string, unknown>;
      const found = pick(entry.loopUrl) ?? pick(entry.videoLoopUrl);
      if (found) return found;
    }
  }
  if (Array.isArray(record.avatars)) {
    for (const item of record.avatars) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      if (entry.id !== 'default' && entry.name !== 'default' && entry.key !== 'default') continue;
      const found = pick(entry.loopUrl) ?? pick(entry.videoLoopUrl);
      if (found) return found;
    }
  }
  return null;
}

function reduceMovimiento(): boolean {
  try {
    if (typeof matchMedia !== 'function') return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export const AvatarSpotlight: React.FC<AvatarSpotlightProps> = ({ saludo, previewAlt }) => {
  const [loopUrl, setLoopUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    if (reduceMovimiento()) return;
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/avatars', { credentials: 'same-origin' });
        if (!res.ok) return;
        const found = loopUrlForDefault((await res.json()) as unknown);
        if (vivo && found) setLoopUrl(found);
      } catch {
        // Sin catálogo de avatares se queda la foto; no rompe la portada.
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const showVideo = loopUrl !== null && !videoError;
  return (
    <figure className="portal-spotlight" data-testid="portal-avatar-spotlight">
      <p className="portal-spotlight-bubble" data-testid="portal-avatar-greeting">
        {saludo}
      </p>
      {showVideo ? (
        <video
          className="portal-spotlight-media"
          data-testid="portal-avatar-loop"
          src={loopUrl}
          poster={DEFAULT_AVATAR_PREVIEW_URL}
          muted
          loop
          autoPlay
          playsInline
          aria-hidden="true"
          ref={(el) => {
            // El atributo muted no basta en todos los navegadores; se fuerza la propiedad.
            if (el) el.muted = true;
          }}
          onError={() => setVideoError(true)}
        />
      ) : (
        <img
          className="portal-spotlight-media"
          data-testid="portal-avatar-photo"
          src={DEFAULT_AVATAR_PREVIEW_URL}
          alt={previewAlt}
        />
      )}
    </figure>
  );
};
