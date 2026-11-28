import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiError, EventAvatarError, api } from '../../api/client';
import { useMessages } from '../../i18n/I18nContext';
import { avatarCatalog } from '../../i18n/messages/avatar';
import '../../styles/napster-avatar.css';

/** Intervalo de consulta del estado de generación (NAP-F6w). */
const POLL_MS = 10_000;
/** Límite de foto validado en el navegador antes de leerla. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_MIME = ['image/jpeg', 'image/png'] as const;

type Phase = 'loading' | 'hidden' | 'form' | 'working' | 'ready' | 'error';
type ErrorKind = 'upload' | 'status' | 'delete';

interface ErrorState {
  text: string;
  kind: ErrorKind;
}

interface EventAvatarSectionProps {
  slug: string;
  /** NAP-U5: la vista se entera del estado de la foto propia (prioridad). */
  onStatus?: (status: string | null) => void;
}

/**
 * «Tu avatar con tu foto» (NAP-F6w): el organizador sube SU foto y Napster
 * genera un avatar con su cara para recibir a los invitados. Nunca bloquea:
 * mientras no hay avatar listo, todos ven a la avatar general (Elena).
 */
export const EventAvatarSection: React.FC<EventAvatarSectionProps> = ({ slug, onStatus }) => {
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const texts = useMessages(avatarCatalog);
  const [phase, setPhase] = useState<Phase>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [firstName, setFirstName] = useState('');
  const [consent, setConsent] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const lastUpload = useRef<{ firstName: string; photo: string } | null>(null);
  const mountedRef = useRef(true);
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const photoId = `${baseId}-photo`;
  const consentId = `${baseId}-consent`;
  const fieldErrorId = `${baseId}-photo-error`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toForm = useCallback((info: string | null) => {
    setNotice(info);
    setError(null);
    setConfirmingDelete(false);
    setBusy(false);
    setPhase('form');
  }, []);

  const fail = useCallback((text: string, kind: ErrorKind) => {
    setNotice(null);
    setError({ text, kind });
    setBusy(false);
    setConfirmingDelete(false);
    setPhase('error');
  }, []);

  const friendlyFor = useCallback(
    (err: unknown): string => {
      if (err instanceof EventAvatarError && err.code === 'avatar_limit') return texts.eventAvatarLimit;
      return texts.eventAvatarUpstream;
    },
    [texts],
  );

  /** Aplica un estado del servidor; devuelve si hay que seguir consultando. */
  const applyStatus = useCallback(
    (status: string): boolean => {
      // NAP-U5: informa a la vista (la foto lista tiene prioridad).
      statusRef.current?.(status);
      if (status === 'ready') {
        setNotice(null);
        setError(null);
        setBusy(false);
        setPhase('ready');
        return false;
      }
      if (status === 'failed') {
        // Terminal: el formulario con el aviso ES el reintento; no hacer nada es seguir con la general.
        toForm(texts.eventAvatarFailed);
        return false;
      }
      if (status === 'uploaded' || status === 'generating') {
        setNotice(null);
        setError(null);
        setBusy(false);
        setPhase('working');
        return true;
      }
      toForm(null);
      return false;
    },
    [texts, toForm],
  );

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const res = await api.getEventAvatar(slug);
      if (!mountedRef.current) return;
      applyStatus(res.status);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setPhase('hidden');
        return;
      }
      fail(friendlyFor(err), 'status');
    }
  }, [slug, applyStatus, fail, friendlyFor]);

  // Estado inicial al montar.
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Consulta cada 10 s mientras genera; para al desmontar o al resolver.
  useEffect(() => {
    if (phase !== 'working') return undefined;
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [phase, refreshStatus]);

  const handleFile = (file: File | undefined, input: HTMLInputElement): void => {
    setFieldError(null);
    if (!file) {
      setPhotoDataUrl(null);
      return;
    }
    if (!(PHOTO_MIME as readonly string[]).includes(file.type)) {
      setPhotoDataUrl(null);
      input.value = '';
      setFieldError(texts.eventAvatarBadType);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoDataUrl(null);
      input.value = '';
      setFieldError(texts.eventAvatarTooBig);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (!mountedRef.current) return;
      setPhotoDataUrl(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.onerror = () => {
      if (!mountedRef.current) return;
      setPhotoDataUrl(null);
      setFieldError(texts.eventAvatarBadType);
    };
    reader.readAsDataURL(file);
  };

  const doUpload = useCallback(
    async (payload: { firstName: string; photo: string }): Promise<void> => {
      setBusy(true);
      setFieldError(null);
      try {
        const res = await api.uploadEventAvatar(slug, { consent: true, ...payload });
        if (!mountedRef.current) return;
        applyStatus(res.status);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        fail(friendlyFor(err), 'upload');
      }
    },
    [slug, applyStatus, fail, friendlyFor],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const name = firstName.trim();
    if (name.length === 0) {
      setFieldError(texts.eventAvatarNeedName);
      return;
    }
    if (!photoDataUrl) {
      setFieldError(texts.eventAvatarNeedPhoto);
      return;
    }
    const payload = { firstName: name.slice(0, 60), photo: photoDataUrl };
    lastUpload.current = payload;
    void doUpload(payload);
  };

  const doDelete = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await api.deleteEventAvatar(slug);
      if (!mountedRef.current) return;
      lastUpload.current = null;
      setPhotoDataUrl(null);
      setConsent(false);
      // NAP-U5: sin foto, la anfitriona del catálogo vuelve a mandar.
      statusRef.current?.('none');
      toForm(texts.eventAvatarDeleted);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      fail(friendlyFor(err), 'delete');
    }
  }, [slug, toForm, fail, friendlyFor]);

  const retry = useCallback(() => {
    if (!error) return;
    if (error.kind === 'upload') {
      const payload = lastUpload.current;
      if (!payload) {
        toForm(null);
        return;
      }
      void doUpload(payload);
      return;
    }
    if (error.kind === 'delete') {
      void doDelete();
      return;
    }
    void refreshStatus();
  }, [error, doUpload, doDelete, refreshStatus, toForm]);

  if (phase === 'hidden') return null;

  return (
    <section
      id="event-avatar-section"
      data-testid="event-avatar-section"
      className="panel"
      aria-labelledby={`${baseId}-title`}
    >
      <h2 id={`${baseId}-title`} style={{ fontSize: '1.25rem' }}>
        {texts.eventAvatarTitle}
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>{texts.eventAvatarIntro}</p>
      {notice ? (
        <p role="status" data-testid="event-avatar-notice" className="event-avatar-notice">
          {notice}
        </p>
      ) : null}
      <div role="status" data-testid="event-avatar-status">
        {phase === 'loading' ? <p>{texts.eventAvatarLoading}</p> : null}
        {phase === 'working' ? <p>{texts.eventAvatarGenerating}</p> : null}
        {phase === 'ready' && !confirmingDelete ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p>{texts.eventAvatarReady}</p>
            <div>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="event-avatar-back"
                onClick={() => setConfirmingDelete(true)}
              >
                {texts.eventAvatarBackToGeneral}
              </button>
            </div>
          </div>
        ) : null}
        {phase === 'ready' && confirmingDelete ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p>{texts.eventAvatarConfirmDelete}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="event-avatar-confirm-delete"
                disabled={busy}
                onClick={() => void doDelete()}
              >
                {texts.eventAvatarConfirmYes}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                {texts.eventAvatarCancel}
              </button>
            </div>
          </div>
        ) : null}
        {phase === 'error' && error ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p role="alert" data-testid="event-avatar-error">
              {error.text}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="event-avatar-retry"
                onClick={retry}
              >
                {texts.eventAvatarRetry}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="event-avatar-stay"
                onClick={() => toForm(null)}
              >
                {texts.eventAvatarStayGeneral}
              </button>
            </div>
          </div>
        ) : null}
        {phase === 'form' ? (
          <form
            data-testid="event-avatar-form"
            aria-label={texts.eventAvatarTitle}
            className="event-avatar-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div>
              <label className="form-label" htmlFor={nameId}>
                {texts.eventAvatarNameLabel}
              </label>
              <input
                id={nameId}
                name="firstName"
                type="text"
                className="form-input"
                autoComplete="given-name"
                required
                maxLength={60}
                value={firstName}
                disabled={busy}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setFieldError(null);
                }}
              />
            </div>
            <div>
              <label className="form-label" htmlFor={photoId}>
                {texts.eventAvatarPhotoLabel}
              </label>
              <input
                id={photoId}
                name="photo"
                type="file"
                accept="image/jpeg,image/png"
                required
                disabled={busy}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? fieldErrorId : undefined}
                onChange={(event) => handleFile(event.target.files?.[0], event.target)}
              />
              {photoDataUrl ? (
                <img
                  src={photoDataUrl}
                  alt={texts.eventAvatarPreviewAlt}
                  data-testid="event-avatar-preview"
                  className="event-avatar-preview"
                />
              ) : null}
            </div>
            {fieldError ? (
              <p role="alert" id={fieldErrorId} data-testid="event-avatar-field-error" className="event-avatar-error-text">
                {fieldError}
              </p>
            ) : null}
            <div>
              <input
                id={consentId}
                name="consent"
                type="checkbox"
                required
                disabled={busy}
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />{' '}
              <label htmlFor={consentId}>{texts.eventAvatarConsent}</label>
            </div>
            <div>
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="event-avatar-submit"
                disabled={!consent || busy}
              >
                {busy ? texts.eventAvatarUploading : texts.eventAvatarSubmit}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
};
