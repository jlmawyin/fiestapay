/**
 * Quién recibe a los invitados (NAP-U5): foto y nombre de la avatar elegida
 * como anfitriona, con opción de cambiarla (`PUT avatar-choice`; `null`
 * vuelve a la general). Si la foto propia está en camino o lista, el texto
 * aclara que tiene prioridad. Se usa en la pantalla final y en el panel.
 */
import React, { useEffect, useState } from 'react';
import { api, type AvatarCatalogItem } from '../../api/client';
import { useMessages } from '../../i18n/I18nContext';
import { interviewCatalog } from '../../i18n/messages/interview';
import '../../styles/create-interview.css';

interface HostAvatarProps {
  slug: string;
  /** avatarId actual del evento (`null` → la default del catálogo). */
  currentId: string | null;
  /** Estado de la foto propia, si la vista lo sabe. */
  photoStatus?: string | null;
  onChanged?: (avatarId: string | null) => void;
}

export const HostAvatar: React.FC<HostAvatarProps> = ({ slug, currentId, photoStatus = null, onChanged }) => {
  const m = useMessages(interviewCatalog);
  const [avatars, setAvatars] = useState<AvatarCatalogItem[]>([]);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getAvatars()
      .then((res) => {
        if (alive) setAvatars(res.avatars);
      })
      .catch(() => {
        if (alive) setAvatars([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (avatars.length === 0) return null;
  const current = avatars.find((item) => item.id === currentId) ?? avatars.find((item) => item.default) ?? avatars[0]!;
  const photoFirst = photoStatus === 'ready' || photoStatus === 'generating' || photoStatus === 'uploaded';

  const save = async (avatarId: string | null): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await api.setAvatarChoice(slug, avatarId);
      const next = res.event.avatarId ?? null;
      const shown = avatars.find((item) => item.id === next) ?? avatars.find((item) => item.default) ?? current;
      setChanging(false);
      setNote(m.hostSaved(shown.displayName));
      onChanged?.(next);
    } catch {
      setNote(m.hostSaveFail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="host-avatar" aria-label={m.hostTitle} data-testid="host-avatar">
      <h2 className="host-avatar-title">{m.hostTitle}</h2>
      <p className="host-avatar-current" data-testid="host-avatar-current">
        <img src={current.previewUrl} alt="" width={48} height={48} loading="lazy" data-testid="host-avatar-photo" />
        <span data-testid="host-avatar-name">{current.displayName}</span>
      </p>
      {photoFirst ? <p className="host-avatar-note">{m.hostPhotoPriority}</p> : null}
      {changing ? (
        <div className="interview-picker-grid" role="group" aria-label={m.hostChange}>
          {avatars.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`interview-pick ${item.id === current.id ? 'interview-pick-active' : ''}`}
              aria-pressed={item.id === current.id}
              data-testid={`host-avatar-pick-${item.id}`}
              disabled={busy}
              onClick={() => void save(item.id)}
            >
              <img src={item.previewUrl} alt="" width={56} height={56} loading="lazy" />
              <span className="interview-pick-name">{item.displayName}</span>
            </button>
          ))}
          <button
            type="button"
            className="interview-pick interview-pick-more"
            data-testid="host-avatar-pick-default"
            disabled={busy}
            onClick={() => void save(null)}
          >
            {m.hostUseDefault}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="host-avatar-change"
          onClick={() => {
            setNote(null);
            setChanging(true);
          }}
        >
          {m.hostChange}
        </button>
      )}
      {note ? (
        <p className="host-avatar-note" role="status" data-testid="host-avatar-note">
          {note}
        </p>
      ) : null}
    </section>
  );
};
