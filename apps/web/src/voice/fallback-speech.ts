/**
 * Last-resort speech for the public informational assistant when no neural voice
 * is configured. The browser's native speech queue is kept: a new phrase is enqueued
 * behind the one already playing, so a reply is never cut. Only an explicit cancel()
 * (Stop, unmount or a human cancellation) stops the current phrase.
 * Rate stays inside 0.95-1.0 as required by the voice policy.
 */

import type { Locale } from '@fiestapay/shared';

export const FALLBACK_SPEECH_RATE = 0.97;

export interface SpeechLike {
  speaking: boolean;
  cancel(): void;
  speak(utterance: SpeechSynthesisUtterance): void;
  getVoices(): SpeechSynthesisVoice[];
}

export interface UtteranceLike {
  text: string;
  lang: string;
  rate: number;
  voice: SpeechSynthesisVoice | null;
}

/** es-ES first, then es-US, then any Spanish voice. Returns null when none exists. */
export function pickSpanishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const spanish = voices.filter((voice) => /^es(?:-|$)/i.test(voice.lang || ''));
  if (spanish.length === 0) return null;
  const exact = (tag: string) => spanish.find((voice) => voice.lang?.toLowerCase() === tag) ?? null;
  return exact('es-es') ?? exact('es-us') ?? spanish[0] ?? null;
}

/** en-US first, then any English voice. Returns null when none exists. */
export function pickEnglishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((voice) => /^en(?:-|$)/i.test(voice.lang || ''));
  if (english.length === 0) return null;
  return english.find((voice) => voice.lang?.toLowerCase() === 'en-us') ?? english[0] ?? null;
}

/** Voice of the locale, or null when the browser offers none (callers stay silent). */
export function pickVoiceForLocale(
  voices: readonly SpeechSynthesisVoice[],
  locale: Locale = 'es',
): SpeechSynthesisVoice | null {
  return locale === 'en' ? pickEnglishVoice(voices) : pickSpanishVoice(voices);
}

export class SpanishSpeechFallback {
  private readonly synth: SpeechLike | null;
  private readonly makeUtterance: ((text: string) => UtteranceLike) | null;
  private locale: Locale;

  constructor(
    synth: SpeechLike | null = null,
    makeUtterance: ((text: string) => UtteranceLike) | null = null,
    locale: Locale = 'es',
  ) {
    this.synth =
      synth ??
      (typeof globalThis !== 'undefined' &&
      'speechSynthesis' in globalThis &&
      globalThis.speechSynthesis
        ? (globalThis.speechSynthesis as unknown as SpeechLike)
        : null);
    this.makeUtterance =
      makeUtterance ??
      (typeof SpeechSynthesisUtterance === 'function'
        ? (text: string) => new SpeechSynthesisUtterance(text)
        : null);
    this.locale = locale;
  }

  /** Switches the voice language. Never falls back to the other language. */
  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  get supported(): boolean {
    return Boolean(this.synth && this.makeUtterance);
  }

  get speaking(): boolean {
    return Boolean(this.synth?.speaking);
  }

  get voices(): SpeechSynthesisVoice[] {
    try {
      return this.synth?.getVoices() ?? [];
    } catch {
      return [];
    }
  }

  get bestVoice(): SpeechSynthesisVoice | null {
    return pickVoiceForLocale(this.voices, this.locale);
  }

  /**
   * Enqueues one phrase without cancelling the one already playing. Returns false when
   * unsupported, when no voice of the locale exists (never falls back to a default
   * voice of the other language) or when the engine refuses the utterance.
   */
  speak(text: string, locale: Locale = this.locale): boolean {
    if (!this.supported || !text.trim()) return false;
    // Re-read on every call: some browsers populate getVoices() asynchronously after a
    // `voiceschanged` event, so a later user action sees the voice.
    const voice = pickVoiceForLocale(this.voices, locale);
    if (!voice) return false;
    const synth = this.synth!;
    let utterance: UtteranceLike;
    try {
      utterance = this.makeUtterance!(text);
    } catch {
      return false;
    }
    utterance.lang = voice.lang || (locale === 'en' ? 'en-US' : 'es-ES');
    utterance.rate = FALLBACK_SPEECH_RATE;
    utterance.voice = voice;
    try {
      synth.speak(utterance as SpeechSynthesisUtterance);
      return true;
    } catch {
      return false;
    }
  }

  cancel(): void {
    try {
      this.synth?.cancel();
    } catch {
      // Ignore a closed engine.
    }
  }
}

export function createSpanishSpeechFallback(locale: Locale = 'es'): SpanishSpeechFallback {
  return new SpanishSpeechFallback(null, null, locale);
}
