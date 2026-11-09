import React, { useEffect, useId, useRef, useState } from 'react';

export type EnterMode = 'send' | 'button';

/** One shared preference for the three chats. Storage is best-effort. */
export const ENTER_MODE_KEY = 'fp_enter_mode';

export function readEnterMode(): EnterMode {
  try {
    return window.localStorage.getItem(ENTER_MODE_KEY) === 'button' ? 'button' : 'send';
  } catch {
    return 'send';
  }
}

export function writeEnterMode(mode: EnterMode): void {
  try {
    window.localStorage.setItem(ENTER_MODE_KEY, mode);
  } catch {
    // Private mode or a throwing storage: the composer keeps working in memory.
  }
}

export interface ChatComposerStrings {
  enterSend: string;
  enterButtonOnly: string;
  enterHintSend: string;
  enterHintButton: string;
  enterGroupLabel: string;
}

interface ChatComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder: string;
  composerLabel: string;
  composerAria: string;
  sendLabel: string;
  strings: ChatComposerStrings;
  maxLength?: number;
  /** Extra actions beside Send (the event chat keeps its Refresh here). */
  extra?: React.ReactNode;
}

/**
 * Shared composer for the public, guest and organizer chats: a textarea
 * that grows to ~5 lines plus a visible Enter-mode selector. Enter sends
 * only in `send` mode (preselected); Shift+Enter always adds a line and
 * IME composition is never submitted.
 */
export const ChatComposer: React.FC<ChatComposerProps> = ({
  value,
  onValueChange,
  onSubmit,
  disabled = false,
  placeholder,
  composerLabel,
  composerAria,
  sendLabel,
  strings,
  maxLength,
  extra,
}) => {
  const [mode, setMode] = useState<EnterMode>(() => readEnterMode());
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const groupName = useId();

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === ENTER_MODE_KEY) setMode(readEnterMode());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    // Layout-less renderers report no scrollHeight; leave the rows alone there.
    if (area.scrollHeight <= 0) {
      area.style.height = 'auto';
      return;
    }
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 120)}px`;
  }, [value]);

  const changeMode = (next: EnterMode) => {
    setMode(next);
    writeEnterMode(next);
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <>
      <form
        className="fp-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSubmit();
        }}
        style={{
          borderTop: '1px solid var(--color-border)',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          gap: '0.45rem',
          alignItems: 'flex-end',
        }}
      >
        <label style={{ flex: 1, fontSize: '0.75rem', color: 'var(--color-ink-muted)', minWidth: 0 }}>
          <span style={{ display: 'block', marginBottom: '0.2rem' }}>{composerLabel}</span>
          <textarea
            ref={areaRef}
            className="form-input"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || mode !== 'send') return;
              if ((event.nativeEvent as KeyboardEvent).isComposing) return;
              event.preventDefault();
              if (canSend) onSubmit();
            }}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            rows={2}
            aria-label={composerAria}
            enterKeyHint={mode === 'send' ? 'send' : 'enter'}
            style={{
              width: '100%',
              resize: 'none',
              minHeight: '2.6rem',
              maxHeight: '7.5rem',
              overflowY: 'auto',
              fontSize: '0.85rem',
              padding: '0.5rem 0.65rem',
            }}
          />
        </label>
        {extra}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canSend}
          style={{ padding: '0.5rem 0.8rem', fontSize: '0.82rem', marginBottom: '0.1rem', flex: '0 0 auto' }}
        >
          {sendLabel}
        </button>
      </form>

      <div role="radiogroup" aria-label={strings.enterGroupLabel} className="fp-enter-mode">
        <label>
          <input
            type="radio"
            name={groupName}
            checked={mode === 'send'}
            onChange={() => changeMode('send')}
          />
          <span>{strings.enterSend}</span>
        </label>
        <label>
          <input
            type="radio"
            name={groupName}
            checked={mode === 'button'}
            onChange={() => changeMode('button')}
          />
          <span>{strings.enterButtonOnly}</span>
        </label>
        <p className="fp-enter-mode__hint">{mode === 'send' ? strings.enterHintSend : strings.enterHintButton}</p>
      </div>
    </>
  );
};
