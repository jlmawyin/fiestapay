import type { Locale } from '@fiestapay/shared';

/** Bounded creation entry points. The URL carries only these values. */
export const CREATE_PATHS = ['sentence', 'interview', 'manual'] as const;
export type CreatePath = (typeof CREATE_PATHS)[number];
export const DEFAULT_CREATE_PATH: CreatePath = 'sentence';

export function parseCreatePath(value: string | null | undefined): CreatePath {
  return value === 'interview' || value === 'manual' || value === 'sentence'
    ? value
    : DEFAULT_CREATE_PATH;
}

export const INTERVIEW_QUESTION_KEYS = ['occasion', 'headcount', 'share', 'when'] as const;
export type InterviewQuestionKey = (typeof INTERVIEW_QUESTION_KEYS)[number];
export type InterviewAnswers = Record<InterviewQuestionKey, string>;

export const EMPTY_INTERVIEW_ANSWERS: InterviewAnswers = {
  occasion: '',
  headcount: '',
  share: '',
  when: '',
};

export interface ShareFact {
  kind: 'perPerson' | 'total';
  cents: number;
}

export interface InterviewFacts {
  headcount: number | null;
  share: ShareFact | null;
  when: string | null;
}

const HEADCOUNT_WORD =
  /(?:^|[^\d])(\d{1,3})\s*(?:people|persons?|friends?|guests?|personas?|amigos?|invitad[oa]s?|pax)\b/i;
const HEADCOUNT_FOR = /\b(?:for|para)\s+(\d{1,3})\b(?!\s*(?:dollars?|usd|each|person|persona))/i;
const BARE_COUNT = /^\s*(?:about|around|unos|unas|como|aprox\.?)?\s*(\d{1,3})\s*$/i;
const MONEY = /(?:\$|\busd\b)\s*(\d{1,6}(?:[.,]\d{1,2})?)(?!\d|[.,]\d)|(?<![\d.,-])(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:dollars?|d[oó]lares?|usd|bucks)\b/i;
const SHARE_UNIT = /\b(each|per person|per head|apiece|cada uno|cada una|por persona|por cabeza)\b/i;
const TOTAL = /\b(total|whole group|all together|en total|grupo completo|todos juntos|presupuesto total)\b/i;
const BARE_MONEY = /^\s*(\d{1,6}(?:[.,]\d{1,2})?)(?:\s+(?:each|per person|per head|apiece|cada uno|cada una|por persona|por cabeza|total|en total))?\s*$/i;

const DATE_WORD =
  /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(today|tomorrow|tonight|next week|this weekend|weekend)\b|\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|ma[nñ]ana|fin de semana)\b|\b(january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i;
const TIME_WORD =
  /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b\d{1,2}:\d{2}\b|\b(noon|midnight|mediod[ií]a|medianoche)\b/i;

function parseAmount(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function extractHeadcount(text: string): number | null {
  const bare = BARE_COUNT.exec(text);
  if (bare?.[1]) {
    const n = Number.parseInt(bare[1], 10);
    return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
  }
  const match = HEADCOUNT_WORD.exec(text) ?? HEADCOUNT_FOR.exec(text);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
}

/**
 * Reads a dollar amount and whether it is the total budget or the share each
 * person pays. `defaultKind` exists for the dedicated share question, where a
 * bare amount means the per-person share; earlier free text must state it.
 */
export function extractShare(text: string, defaultKind: 'perPerson' | 'total' | null = null): ShareFact | null {
  const currencyAmount = MONEY.exec(text);
  const bareAmount = defaultKind ? BARE_MONEY.exec(text) : null;
  const amount = currencyAmount?.[1] ?? currencyAmount?.[2] ?? bareAmount?.[1];
  if (amount === undefined) return null;
  const cents = parseAmount(amount);
  if (cents === null) return null;
  const perPerson = SHARE_UNIT.test(text);
  const total = TOTAL.test(text);
  if (perPerson && total) return null;
  const kind = perPerson ? 'perPerson' : total ? 'total' : defaultKind;
  return kind ? { kind, cents } : null;
}

export function hasDateTime(text: string): boolean {
  return DATE_WORD.test(text) && TIME_WORD.test(text);
}

/** Facts available from all answers so far, used to avoid asking what is already clear. */
export function interviewFacts(answers: InterviewAnswers): InterviewFacts {
  return {
    headcount: extractHeadcount(answers.headcount) ?? extractHeadcount(answers.occasion),
    share: extractShare(answers.share, 'perPerson') ?? extractShare(answers.occasion),
    when: answers.when.trim() || (hasDateTime(answers.occasion) ? answers.occasion.trim() : null),
  };
}

/**
 * Next question that is neither explicitly skipped nor already answered in
 * earlier text. Conservative: only a stated headcount, a stated per/total
 * amount, or a clear date+time lets a later question be skipped.
 */
export function nextInterviewQuestion(
  answers: InterviewAnswers,
  fromIndex: number,
  skipped: ReadonlySet<InterviewQuestionKey>,
): number | null {
  const facts = interviewFacts(answers);
  for (let index = Math.max(0, fromIndex); index < INTERVIEW_QUESTION_KEYS.length; index += 1) {
    const key = INTERVIEW_QUESTION_KEYS[index];
    if (!key || skipped.has(key)) continue;
    if (key === 'headcount' && facts.headcount !== null) continue;
    if (key === 'share' && facts.share !== null) continue;
    if (key === 'when' && facts.when !== null) continue;
    return index;
  }
  return null;
}

const moneyText = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const cleanOccasion = (value: string): string => value.trim().replace(/[.!?]+$/, '');

/**
 * Builds the single sentence sent to POST /api/ai/draft-event. The money clause
 * always says "total budget" (and the per-person share when known), so the
 * server never has to guess whether an amount was total or per person.
 */
export function composeInterviewSentence(answers: InterviewAnswers, locale: Locale): string {
  const facts = interviewFacts(answers);
  const occasion = cleanOccasion(answers.occasion);
  const fragments: string[] = [];
  if (occasion) fragments.push(occasion);

  if (facts.headcount !== null && !HEADCOUNT_WORD.test(occasion || '') && !HEADCOUNT_FOR.test(occasion || '')) {
    fragments.push(
      locale === 'es'
        ? `para ${facts.headcount} personas`
        : `for ${facts.headcount} people`,
    );
  }

  if (facts.headcount === null && answers.headcount.trim()) {
    fragments.push(locale === 'es' ? `asistentes: ${answers.headcount.trim()}` : `guest count: ${answers.headcount.trim()}`);
  }

  if (facts.share) {
    const perPerson = facts.share.kind === 'perPerson';
    const totalCents =
      facts.share.kind === 'total'
        ? facts.share.cents
        : facts.headcount !== null
          ? facts.share.cents * facts.headcount
          : null;
    if (totalCents !== null) {
      const total = moneyText(totalCents);
      if (perPerson) {
        const each = moneyText(facts.share.cents);
        fragments.push(
          locale === 'es'
            ? `con un presupuesto total de ${total} (${each} por persona)`
            : `with a total budget of ${total} (${each} per person)`,
        );
      } else {
        fragments.push(
          locale === 'es'
            ? `con un presupuesto total de ${total} para todo el grupo`
            : `with a total budget of ${total} for the whole group`,
        );
      }
    } else {
      const each = moneyText(facts.share.cents);
      fragments.push(
        locale === 'es'
          ? `con una cuota de ${each} por persona`
          : `at ${each} per person`,
      );
    }
  }

  if (facts.share === null && answers.share.trim()) {
    fragments.push(locale === 'es' ? `cuota o presupuesto: ${answers.share.trim()}` : `share or budget: ${answers.share.trim()}`);
  }

  const when = answers.when.trim();
  let sentence = fragments.join(' ').replace(/\s+/g, ' ').trim();
  if (when) {
    const whenClause = locale === 'es' ? when : `starting ${when}`;
    sentence = sentence ? `${sentence}, ${whenClause}` : whenClause;
  }
  if (!sentence) return '';
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (!/[.!?]$/.test(sentence)) sentence += '.';
  if (sentence.length > 400) sentence = `${sentence.slice(0, 399).trimEnd()}…`;
  return sentence;
}
