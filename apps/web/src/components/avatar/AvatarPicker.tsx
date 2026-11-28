/**
 * Fila para elegir guía (NAP-U3, NAP-U5): tarjetas con la foto (previewUrl)
 * y el displayName de `GET /api/avatars`, con la default ya elegida. Se ven
 * unas pocas más «Ver todas» (rejilla en diálogo, botones nativos para el
 * teclado y foco visible). Cuando llega `suggest_avatars{tag}` se muestra
 * arriba «Sugeridas para tu reunión de <etiqueta>» con las de ese tag,
 * resaltadas sin dorado (el dorado es solo del paso activo y del botón
 * principal). «Usar mi foto» solo explica que se activa al publicar.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import type { AvatarCatalogItem } from '../../api/client';
import { useMessages } from '../../i18n/I18nContext';
import { interviewCatalog } from '../../i18n/messages/interview';

/** Visibles en la fila antes de «Ver todas». */
export const AVATAR_ROW_VISIBLE = 5;

interface AvatarPickerProps {
  avatars: AvatarCatalogItem[];
  selectedId: string | null;
  /** Ids del tag sugerido por la avatar (`suggest_avatars`). */
  suggestedIds?: readonly string[];
  /** Etiqueta localizada («Fiesta») para el título de sugeridas. */
  suggestedTagLabel?: string | null;
  /** Con sesión en curso, cambiar pide confirmación (la vista reinicia). */
  sessionActive: boolean;
  onSelect: (id: string) => void;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  avatars,
  selectedId,
  suggestedIds = [],
  suggestedTagLabel = null,
  sessionActive,
  onSelect,
}) => {
  const m = useMessages(interviewCatalog);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const suggested = new Set(suggestedIds);
  const suggestedAvatars = avatars.filter((item) => suggested.has(item.id));

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open ]);

  if (avatars.length === 0) return null;

  const choose = (item: AvatarCatalogItem): void => {
    if (item.id === selectedId) {
      setOpen(false);
      return;
    }
    if (sessionActive && !window.confirm(m.pickerConfirmSwitch(item.firstName))) return;
    setOpen(false);
    onSelect(item.id);
  };

  const onDialogKey = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') setOpen(false);
  };

  const card = (item: AvatarCatalogItem, prefix: string) => {
    const active = item.id === selectedId;
    const marked = suggested.has(item.id);
    return (
      <button
        key={item.id}
        type="button"
        className={`interview-pick ${active ? 'interview-pick-active' : ''} ${marked ? 'interview-pick-suggested' : ''}`}
        aria-pressed={active}
        data-testid={`${prefix}-${item.id}`}
        data-suggested={marked || undefined}
        onClick={() => choose(item)}
      >
        <img
          src={item.previewUrl}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          onError={(event) => {
            // Sin foto (red caída) la tarjeta queda con el nombre.
            event.currentTarget.style.display = 'none';
          }}
        />
        <span className="interview-pick-name">{item.displayName}</span>
        {marked ? <span className="interview-pick-badge">{m.pickerSuggested}</span> : null}
      </button>
    );
  };

  return (
    <section className="interview-picker" aria-label={m.pickerTitle} data-testid="avatar-picker">
      <h2 className="interview-picker-title">{m.pickerTitle}</h2>
      {suggestedAvatars.length > 0 && suggestedTagLabel ? (
        <div className="interview-suggested" data-testid="avatar-suggested">
          <h3 className="interview-suggested-title" data-testid="avatar-suggested-title">
            {m.pickerSuggestedFor(suggestedTagLabel)}
          </h3>
          <div className="interview-picker-row" role="group" aria-label={m.pickerSuggestedFor(suggestedTagLabel)}>
            {suggestedAvatars.map((item) => card(item, 'avatar-pick-suggested'))}
          </div>
        </div>
      ) : null}
      <div className="interview-picker-row" role="group" aria-label={m.pickerTitle}>
        {avatars.slice(0, AVATAR_ROW_VISIBLE).map((item) => card(item, open ? 'avatar-pick-all' : 'avatar-pick'))}
        {avatars.length > AVATAR_ROW_VISIBLE ? (
          <button
            type="button"
            className="interview-pick interview-pick-more"
            data-testid="avatar-pick-more"
            onClick={() => setOpen(true)}
          >
            {m.pickerShowAll}
          </button>
        ) : null}
      </div>
      <p className="interview-photo-note">
        <Camera size={16} aria-hidden="true" />
        <span>
          <strong>{m.pickerUsePhoto}.</strong> {m.pickerUsePhotoNote}
        </span>
      </p>
      {open ? (
        <div className="interview-dialog-backdrop" onClick={() => setOpen(false)}>
          <div
            className="interview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={m.pickerDialogTitle}
            data-testid="avatar-picker-dialog"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onDialogKey}
          >
            <div className="interview-dialog-head">
              <h2>{m.pickerDialogTitle}</h2>
              <button
                ref={closeRef}
                type="button"
                className="btn btn-secondary"
                data-testid="avatar-picker-close"
                onClick={() => setOpen(false)}
              >
                {m.pickerClose}
              </button>
            </div>
            <div className="interview-picker-grid">{avatars.map((item) => card(item, 'avatar-pick-all'))}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
