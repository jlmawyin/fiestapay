import {
  TEMPLATE_THEMES,
  type DraftEventProposal,
  type Locale,
  type MealKind,
  type TemplateKind,
  type ThemeKey,
} from '@fiestapay/shared';
import type { AgendaItem } from '../types';

export type InvitationCardStyle = 'reencuentro' | 'elegante' | 'retro' | 'festiva';

export interface PolaroidMemory {
  caption: string;
  yearTag: string;
  motif: 'group' | 'keepsake' | 'toast' | 'crest';
  tiltDeg: number;
}

export interface InvitationStyleMeta {
  key: InvitationCardStyle;
  name: Record<Locale, string>;
  badge: Record<Locale, string>;
  tagline: Record<Locale, string>;
}

export const INVITATION_STYLES: readonly InvitationStyleMeta[] = [
  {
    key: 'reencuentro',
    name: {
      es: 'Álbum del reencuentro',
      en: 'Reunion Album',
    },
    badge: {
      es: 'Azul marino · Dorado · Polaroids',
      en: 'Deep Navy · Gold · Polaroids',
    },
    tagline: {
      es: 'Inspirada en reencuentros de promoción con marco dorado y recuerdos fotográficos.',
      en: 'Inspired by class reunions with gold framing and Polaroid keepsakes.',
    },
  },
  {
    key: 'elegante',
    name: {
      es: 'Gala Esmeralda',
      en: 'Emerald Gala',
    },
    badge: {
      es: 'Verde bosque · Doble filete dorado',
      en: 'Forest Green · Double Gold Rule',
    },
    tagline: {
      es: 'Diseño editorial de gala con emblema superior y grilla 2×2 en líneas finas doradas.',
      en: 'Editorial gala card with crest emblem and fine gold 2×2 details grid.',
    },
  },
  {
    key: 'retro',
    name: {
      es: 'Pergamino Clásico',
      en: 'Classic Parchment',
    },
    badge: {
      es: 'Papel cálido · Tinta sepia · Ornamentos',
      en: 'Warm Parchment · Sepia Ink · Ornaments',
    },
    tagline: {
      es: 'Textura de papel antiguo con tipografía serif clásica, sello y divisores con rombo ◆.',
      en: 'Vintage paper texture with classic serif typography, seal and ◆ diamond dividers.',
    },
  },
  {
    key: 'festiva',
    name: {
      es: 'Celebración Festiva',
      en: 'Festive Celebration',
    },
    badge: {
      es: 'Coral y Ámbar · Moderna y vibrante',
      en: 'Coral & Amber · Modern & Vibrant',
    },
    tagline: {
      es: 'Ideal para cumpleaños, parrilladas, cenas de amigos y escapadas grupales.',
      en: 'Ideal for birthdays, BBQs, dinners with friends and group getaways.',
    },
  },
] as const;

const STYLE_SLOT_INDEX: Record<InvitationCardStyle, number> = {
  festiva: 0,
  reencuentro: 1,
  elegante: 2,
  retro: 3,
};

const SLOT_INDEX_STYLE: readonly InvitationCardStyle[] = [
  'festiva',
  'reencuentro',
  'elegante',
  'retro',
];

/** Maps a template + card style to the corresponding valid ThemeKey without DB migrations. */
export function themeForInvitationStyle(template: TemplateKind, style: InvitationCardStyle): ThemeKey {
  const list = TEMPLATE_THEMES[template];
  const idx = STYLE_SLOT_INDEX[style] ?? 0;
  return list[idx] ?? list[0];
}

/** Infers the best visual card style from text keywords and template. */
export function inferStyleFromText(text: string, template: TemplateKind): InvitationCardStyle {
  const lower = text.toLowerCase();
  if (/promoci[oó]n|academia|naval|colegio|graduaci[oó]n|36\s*a[nñ]os|\bxx\b|curso|fima|recuerdo/.test(lower)) {
    return 'reencuentro';
  }
  if (/pergamino|retro|cl[aá]sic[oa]|tertulia|bodas|antiguo|tradicional|historia/.test(lower)) {
    return 'retro';
  }
  if (/reencuentro|asociaci[oó]n|extrabajadores|compa[nñ]eros|gala|anual|confraternidad|aniversario|ejecutiv/.test(lower)) {
    return 'elegante';
  }
  if (template === 'evento') {
    return 'elegante';
  }
  return 'festiva';
}

/** Resolves the active InvitationCardStyle from the stored ThemeKey and event text. */
export function resolveInvitationStyle(
  template: TemplateKind,
  theme: ThemeKey,
  title = '',
  description = '',
): InvitationCardStyle {
  const list: readonly ThemeKey[] = TEMPLATE_THEMES[template];
  const slotIdx = list.indexOf(theme);
  if (slotIdx >= 1 && slotIdx < SLOT_INDEX_STYLE.length) {
    return SLOT_INDEX_STYLE[slotIdx]!;
  }
  const combined = `${title} ${description}`.trim();
  if (combined.length > 0) {
    const inferred = inferStyleFromText(combined, template);
    if (inferred !== 'festiva') return inferred;
  }
  return SLOT_INDEX_STYLE[slotIdx >= 0 ? slotIdx : 0] ?? 'festiva';
}

function nextSaturdayDate(offsetWeeks = 1): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilSat = ((6 - day + 7) % 7) || 7;
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSat + (offsetWeeks - 1) * 7);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface InvitationReferenceBlueprint {
  id: string;
  style: InvitationCardStyle;
  chipLabel: Record<Locale, string>;
  occasionBadge: Record<Locale, string>;
  sentence: Record<Locale, string>;
  organizerName: Record<Locale, string>;
  description: Record<Locale, string>;
  foodStyle?: Record<Locale, string>;
  agenda?: Record<Locale, AgendaItem[]>;
  proposal: (locale: Locale) => DraftEventProposal;
}

export const INVITATION_REFERENCES: readonly InvitationReferenceBlueprint[] = [
  {
    id: 'reencuentro-promocion',
    style: 'reencuentro',
    chipLabel: {
      es: '🎓 Reencuentro de Promoción (Álbum)',
      en: '🎓 Class Reunion (Album)',
    },
    occasionBadge: {
      es: 'Promoción · Álbum de recuerdos',
      en: 'Class Reunion · Keepsake Album',
    },
    sentence: {
      es: 'Reencuentro de promoción en Master Buffet (Kennedy Norte) para 30 compañeros a $30 por persona con almuerzo buffet, brindis y recuerdo conmemorativo',
      en: 'Class reunion at Master Buffet (Kennedy Norte) for 30 classmates at $30 per person with buffet lunch, toast and commemorative keepsake',
    },
    organizerName: {
      es: 'Comité Organizador · Promoción',
      en: 'Organizing Committee · Alumni Class',
    },
    description: {
      es: 'Estimados compañeros: ¡Los años pasan, pero la amistad sigue intacta! Nos volvemos a reunir para celebrar nuestra historia, revivir las mejores anécdotas de promoción y brindar juntos. Reserva tu cupo con anticipación.',
      en: 'Dear classmates: Years go by, but our friendship remains intact! We are gathering again to celebrate our history, relive our best class memories and raise a glass together. Reserve your spot early.',
    },
    agenda: {
      es: [
        { time: '14:15', title: 'Recepción de compañeros y entrega de recuerdo conmemorativo' },
        { time: '15:00', title: 'Almuerzo buffet y brindis de honor de la promoción' },
        { time: '16:00', title: 'Fotografía oficial del reencuentro y anécdotas' },
      ],
      en: [
        { time: '14:15', title: 'Classmate reception and commemorative keepsake handout' },
        { time: '15:00', title: 'Buffet lunch and class honor toast' },
        { time: '16:00', title: 'Official reunion photo and stories' },
      ],
    },
    proposal: (locale: Locale): DraftEventProposal => ({
      template: 'evento',
      title:
        locale === 'en'
          ? '36 Years Later, Friendship Remains Intact! · Class Reunion'
          : '¡36 años después, la amistad sigue intacta! · Reencuentro',
      date: nextSaturdayDate(2),
      startTime: '14:15',
      durationMinutes: 180,
      location:
        locale === 'en'
          ? 'Master Buffet (Kennedy Norte) · Reserved Hall'
          : 'Master Buffet (Kennedy Norte) · Salón Reservado',
      includes:
        locale === 'en'
          ? [
              'Full buffet & honor toast',
              'Commemorative reunion keepsake',
              'Reserved table & official photo',
            ]
          : [
              'Buffet completo y brindis de honor',
              'Recuerdo conmemorativo del reencuentro',
              'Mesa reservada y fotografía oficial',
            ],
      headcount: 30,
      budgetCents: 90_000,
      perPersonCents: 3_000,
      suggested: [
        'template',
        'title',
        'date',
        'startTime',
        'durationMinutes',
        'location',
        'includes',
        'headcount',
        'budgetCents',
      ],
      source: 'ai',
    }),
  },
  {
    id: 'reencuentro-gala-esmeralda',
    style: 'elegante',
    chipLabel: {
      es: '✨ Cena de Compañeros (Gala Esmeralda)',
      en: '✨ Colleagues Dinner (Emerald Gala)',
    },
    occasionBadge: {
      es: 'Gala Esmeralda · Reencuentro anual',
      en: 'Emerald Gala · Annual Reunion',
    },
    sentence: {
      es: 'Cena de reencuentro anual de compañeros en Master Buffet el sábado a las 18:00 para 28 personas a $25 cada uno con buffet, brindis y sorpresas',
      en: 'Annual colleagues reunion dinner at Master Buffet on Saturday at 18:00 for 28 people at $25 each with buffet, toast and surprises',
    },
    organizerName: {
      es: 'Comité Organizador · Asociación de Compañeros',
      en: 'Organizing Committee · Colleagues Association',
    },
    description: {
      es: 'Estimados compañeros: Reciban un afectuoso saludo. El tiempo ha pasado, pero la amistad que nació entre nosotros sigue intacta. Los invitamos a nuestra reunión anual para recordar anécdotas y compartir agradables momentos. ¡No falten, habrá bonitas sorpresas!',
      en: 'Dear colleagues: Warmest greetings. Time has passed, yet the friendship we built remains intact. We invite you to our annual gathering to share stories and wonderful moments together. Do not miss it, lovely surprises await!',
    },
    foodStyle: {
      es: 'Cena buffet especial y brindis de confraternidad',
      en: 'Special buffet dinner and fellowship toast',
    },
    proposal: (locale: Locale): DraftEventProposal => ({
      template: 'comida',
      meal: 'cena',
      title:
        locale === 'en'
          ? 'The Most Awaited Reunion of the Year · Colleagues Gala'
          : 'El reencuentro más esperado del año · Cena de Compañeros',
      date: nextSaturdayDate(2),
      startTime: '18:00',
      durationMinutes: 180,
      location:
        locale === 'en'
          ? 'Master Buffet · Kennedy Norte, Main Hall'
          : 'Master Buffet · Kennedy Norte, Salón Principal',
      includes:
        locale === 'en'
          ? [
              'Full buffet dinner & welcome drink',
              'Private air-conditioned lounge',
              'Fellowship toast & special surprises',
            ]
          : [
              'Cena buffet completa y bebida de bienvenida',
              'Salón privado climatizado',
              'Brindis de confraternidad y sorpresas',
            ],
      headcount: 28,
      budgetCents: 70_000,
      perPersonCents: 2_500,
      suggested: [
        'template',
        'title',
        'meal',
        'date',
        'startTime',
        'durationMinutes',
        'location',
        'includes',
        'headcount',
        'budgetCents',
      ],
      source: 'ai',
    }),
  },
  {
    id: 'reencuentro-pergamino-retro',
    style: 'retro',
    chipLabel: {
      es: '📜 Amigos de Toda la Vida (Pergamino)',
      en: '📜 Lifelong Friends (Parchment)',
    },
    occasionBadge: {
      es: 'Pergamino Clásico · Edición de gala',
      en: 'Classic Parchment · Heritage Edition',
    },
    sentence: {
      es: 'Gran reencuentro clásico de amigos de toda la vida para 24 personas a $25 por persona con cena servida, brindis y música del recuerdo',
      en: 'Classic lifelong friends reunion for 24 people at $25 per person with plated dinner, toast and classic music',
    },
    organizerName: {
      es: 'Comité Organizador · Amigos de Toda la Vida',
      en: 'Organizing Committee · Lifelong Friends',
    },
    description: {
      es: 'Compañeros y amigos de toda la vida: Volvamos a reunirnos para ponernos al día, revivir nuestras mejores historias y celebrar décadas de amistad sincera. Los esperamos con mucho cariño en una velada inolvidable.',
      en: 'Lifelong friends and companions: Let us gather once again to catch up, relive our favorite stories and celebrate decades of sincere friendship. We look forward to welcoming you warmly.',
    },
    foodStyle: {
      es: 'Cena clásica en mesa reservada y brindis de honor',
      en: 'Classic dinner at reserved table and honor toast',
    },
    proposal: (locale: Locale): DraftEventProposal => ({
      template: 'comida',
      meal: 'cena',
      title:
        locale === 'en'
          ? 'Grand Reunion of Lifelong Friends & Companions'
          : 'Gran Reencuentro de Amigos de Toda la Vida',
      date: nextSaturdayDate(3),
      startTime: '18:30',
      durationMinutes: 180,
      location:
        locale === 'en'
          ? 'Master Buffet Classic Hall · Kennedy Norte'
          : 'Salón Clásico Master Buffet · Kennedy Norte',
      includes:
        locale === 'en'
          ? [
              'Reserved honor table & full dinner',
              'Classic fellowship toast',
              'Commemorative keepsake & music',
            ]
          : [
              'Mesa de honor reservada y cena completa',
              'Brindis clásico de confraternidad',
              'Recuerdo conmemorativo y música',
            ],
      headcount: 24,
      budgetCents: 60_000,
      perPersonCents: 2_500,
      suggested: [
        'template',
        'title',
        'meal',
        'date',
        'startTime',
        'durationMinutes',
        'location',
        'includes',
        'headcount',
        'budgetCents',
      ],
      source: 'ai',
    }),
  },
  {
    id: 'parrillada-cumple-festiva',
    style: 'festiva',
    chipLabel: {
      es: '🔥 Parrillada y Cumpleaños (Festiva)',
      en: '🔥 Birthday Grill & Party (Festive)',
    },
    occasionBadge: {
      es: 'Celebración Festiva · Parrilla y amigos',
      en: 'Festive Celebration · Grill & Friends',
    },
    sentence: {
      es: 'Parrillada de cumpleaños el sábado a las 13:30 para 16 amigos a $18 por persona con cortes al carbón, bebidas frías y torta',
      en: 'Birthday BBQ on Saturday at 13:30 for 16 friends at $18 per person with charcoal grill cuts, cold drinks and cake',
    },
    organizerName: {
      es: 'Anfitrión de la Celebración',
      en: 'Celebration Host',
    },
    description: {
      es: '¡A celebrar a lo grande! Preparamos una tarde espectacular de parrillada al carbón, bebidas bien frías, música y excelente compañía. Confirma tu asistencia y asegura tu cuota con PayPal para tener todo listo.',
      en: 'Let us celebrate in style! We are setting up an amazing afternoon with charcoal grill cuts, ice-cold drinks, music and great company. Confirm your attendance and lock in your share with PayPal.',
    },
    foodStyle: {
      es: 'Cortes seleccionados a la parrilla, guarniciones y picadas',
      en: 'Selected charcoal grill cuts, sides and appetizers',
    },
    proposal: (locale: Locale): DraftEventProposal => ({
      template: 'comida',
      meal: 'almuerzo',
      title:
        locale === 'en'
          ? 'Birthday Charcoal Grill & Friends Gathering'
          : 'Gran Parrillada de Cumpleaños entre Amigos',
      date: nextSaturdayDate(1),
      startTime: '13:30',
      durationMinutes: 240,
      location:
        locale === 'en'
          ? 'Main Terrace & Grill Garden · Confirmed Venue'
          : 'Terraza y Quincho Principal · Jardín Social',
      includes:
        locale === 'en'
          ? [
              'Charcoal grill cuts & sides',
              'Cold drinks, ice & mixers',
              'Birthday cake & appetizers',
            ]
          : [
              'Cortes seleccionados al carbón y guarniciones',
              'Bebidas frías, hielo y coctelería',
              'Torta de celebración y picadas',
            ],
      headcount: 16,
      budgetCents: 28_800,
      perPersonCents: 1_800,
      suggested: [
        'template',
        'title',
        'meal',
        'date',
        'startTime',
        'durationMinutes',
        'location',
        'includes',
        'headcount',
        'budgetCents',
      ],
      source: 'ai',
    }),
  },
] as const;

export interface EnrichedWizardExtras {
  organizerName: string;
  description: string;
  foodStyle: string;
  agenda: AgendaItem[];
  style: InvitationCardStyle;
  theme: ThemeKey;
}

/**
 * Generates rich, zero-blank-field defaults for organizerName, description, foodStyle,
 * agenda and theme whenever the user fills the wizard with AI from any sentence.
 */
export function enrichWizardExtrasForProposal(
  proposal: DraftEventProposal,
  rawSentence: string,
  locale: Locale,
  explicitStyle?: InvitationCardStyle,
): EnrichedWizardExtras {
  const combined = `${proposal.title} ${rawSentence} ${proposal.location ?? ''} ${(proposal.includes ?? []).join(' ')}`.trim();
  const style = explicitStyle ?? inferStyleFromText(combined, proposal.template);
  const theme = themeForInvitationStyle(proposal.template, style);
  const isReunion = style === 'reencuentro' || style === 'elegante' || style === 'retro';

  const organizerName =
    locale === 'en'
      ? isReunion
        ? 'Organizing Committee'
        : 'Event Host'
      : isReunion
        ? 'Comité Organizador'
        : 'Anfitrión del Evento';

  const incSummary =
    proposal.includes && proposal.includes.length > 0
      ? proposal.includes.slice(0, 3).join(', ').toLowerCase()
      : locale === 'en'
        ? 'food, drinks and everything needed'
        : 'comida, bebidas y todo lo necesario';

  let description: string;
  if (style === 'reencuentro') {
    description =
      locale === 'en'
        ? `Dear classmates and friends: Years go by, yet our friendship remains intact. Join us at ${proposal.location ?? 'our confirmed venue'} to celebrate together with ${incSummary}. Confirm your spot and complete your share with PayPal.`
        : `Estimados compañeros y amigos: Los años pasan, pero nuestra amistad sigue intacta. Nos reunimos en ${proposal.location ?? 'nuestro punto de encuentro'} para compartir juntos con ${incSummary}. Confirma tu asistencia y asegura tu cuota con PayPal.`;
  } else if (style === 'elegante') {
    description =
      locale === 'en'
        ? `Warmest greetings: We invite you to share an unforgettable gathering at ${proposal.location ?? 'our reserved hall'}, including ${incSummary}. Please confirm your attendance and complete your share so everything is ready on time.`
        : `Reciban un afectuoso saludo: Los invitamos a compartir un encuentro muy especial en ${proposal.location ?? 'nuestro salón reservado'}, que incluye ${incSummary}. Confirma tu asistencia y asegura tu cuota para dejar todo listo a tiempo.`;
  } else if (style === 'retro') {
    description =
      locale === 'en'
        ? `Dear lifelong friends: Let us gather once again at ${proposal.location ?? 'our reserved table'} to catch up, relive great memories and enjoy ${incSummary}. We look forward to welcoming you warmly.`
        : `Compañeros y amigos de toda la vida: Volvamos a reunirnos en ${proposal.location ?? 'nuestra mesa reservada'} para ponernos al día, recordar grandes momentos y disfrutar de ${incSummary}. Los esperamos con mucho cariño.`;
  } else {
    description =
      locale === 'en'
        ? `We are getting together for "${proposal.title}" at ${proposal.location ?? 'our confirmed spot'}! The share covers ${incSummary} so everyone can enjoy without hassle. Confirm your attendance and pay your share with PayPal.`
        : `¡Nos juntamos para "${proposal.title}" en ${proposal.location ?? 'nuestro punto de encuentro'}! La cuota cubre ${incSummary} para que todos disfrutemos sin complicaciones. Confirma tu asistencia y paga tu parte con PayPal.`;
  }

  let foodStyle = '';
  if (proposal.template === 'comida') {
    if (proposal.includes && proposal.includes.length > 0) {
      foodStyle = proposal.includes.slice(0, 2).join(' · ').slice(0, 120);
    } else {
      const mealKind: MealKind = proposal.meal ?? 'cena';
      foodStyle =
        locale === 'en'
          ? `Complete ${mealKind === 'desayuno' ? 'breakfast' : mealKind === 'almuerzo' ? 'lunch' : 'dinner'} menu & shared drinks`
          : `Menú completo de ${mealKind} y bebidas para compartir`;
    }
  }

  const start = proposal.startTime ?? '18:00';
  const [hhRaw] = start.split(':');
  const hh = Number.parseInt(hhRaw ?? '18', 10);
  const nextHour1 = `${String((Number.isFinite(hh) ? hh + 1 : 19) % 24).padStart(2, '0')}:00`;
  const nextHour2 = `${String((Number.isFinite(hh) ? hh + 2 : 20) % 24).padStart(2, '0')}:00`;

  const agenda: AgendaItem[] =
    proposal.template === 'evento'
      ? locale === 'en'
        ? [
            { time: start, title: 'Guest reception & welcome toast' },
            { time: nextHour1, title: 'Main gathering, meal & special moments' },
            { time: nextHour2, title: 'Group photo & closing celebration' },
          ]
        : [
            { time: start, title: 'Recepción de invitados y brindis de bienvenida' },
            { time: nextHour1, title: 'Encuentro principal, comida y momento especial' },
            { time: nextHour2, title: 'Foto grupal oficial y cierre de celebración' },
          ]
      : [
          { time: '', title: '' },
          { time: '', title: '' },
        ];

  return {
    organizerName,
    description,
    foodStyle,
    agenda,
    style,
    theme,
  };
}

export function polaroidsForEvent(_title: string, _organizerName: string, locale: Locale): PolaroidMemory[] {
  return [
    {
      caption: locale === 'en' ? 'School & friendship years' : 'Años de estudio y amistad',
      yearTag: locale === 'en' ? 'Class memories' : 'Recuerdos de promoción',
      motif: 'group',
      tiltDeg: -4,
    },
    {
      caption: locale === 'en' ? '1st Reunion Keepsake' : '1er reencuentro · Recuerdo',
      yearTag: locale === 'en' ? 'Friendship intact' : 'La amistad sigue intacta',
      motif: 'keepsake',
      tiltDeg: 2.5,
    },
    {
      caption: locale === 'en' ? 'Together again · Toast' : 'Juntos otra vez · Brindis',
      yearTag: locale === 'en' ? 'Special gathering' : 'Encuentro conmemorativo',
      motif: 'toast',
      tiltDeg: -2.5,
    },
  ];
}
