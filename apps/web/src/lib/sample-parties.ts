import type { ThemeKey } from '@fiestapay/shared';
import type { TemplateKind } from '../types';

/**
 * Fixed fictional sample parties for /demo. No database, no fetch: the
 * judges see guests, attendance, and cent amounts from the first second.
 * Names, attendance, and amounts are invented and always labeled fictional
 * at the call site. Paid numbers are NOT real PayPal captures.
 */
export interface SampleGuest {
  id: string;
  name: string;
  attendance: 'yes' | 'maybe' | 'no';
  companions: number;
  paidCents: number;
  dueCents: number;
}

export interface SampleParty {
  id: string;
  title: string;
  template: TemplateKind;
  themeKey: ThemeKey;
  priceCents: number;
  goalCents: number;
  minimumCents: number;
  guests: SampleGuest[];
}

export const SAMPLE_PARTIES: SampleParty[] = [
  {
    id: 'asado-domingo',
    title: 'Asado del Domingo',
    template: 'comida',
    themeKey: 'fogata',
    priceCents: 2000,
    goalCents: 16000,
    minimumCents: 8000,
    guests: [
      { id: 'asado-1', name: 'Lucía Fernández', attendance: 'yes', companions: 1, paidCents: 4000, dueCents: 0 },
      { id: 'asado-2', name: 'Marco Ruiz', attendance: 'yes', companions: 0, paidCents: 2000, dueCents: 0 },
      { id: 'asado-3', name: 'Elena Torres', attendance: 'yes', companions: 2, paidCents: 2000, dueCents: 4000 },
      { id: 'asado-4', name: 'Diego Paz', attendance: 'yes', companions: 0, paidCents: 0, dueCents: 2000 },
      { id: 'asado-5', name: 'Carmen Vega', attendance: 'yes', companions: 0, paidCents: 2000, dueCents: 0 },
      { id: 'asado-6', name: 'Jorge Medina', attendance: 'maybe', companions: 0, paidCents: 0, dueCents: 0 },
    ],
  },
  {
    id: 'cumple-sofia',
    title: 'Cumpleaños de Sofía',
    template: 'casa',
    themeKey: 'patio',
    priceCents: 1500,
    goalCents: 15000,
    minimumCents: 6000,
    guests: [
      { id: 'sofia-1', name: 'Paula Ríos', attendance: 'yes', companions: 1, paidCents: 3000, dueCents: 0 },
      { id: 'sofia-2', name: 'Andrés León', attendance: 'yes', companions: 0, paidCents: 1500, dueCents: 0 },
      { id: 'sofia-3', name: 'Valeria Cruz', attendance: 'yes', companions: 0, paidCents: 1500, dueCents: 0 },
      { id: 'sofia-4', name: 'Tomás Aguirre', attendance: 'yes', companions: 0, paidCents: 0, dueCents: 1500 },
      { id: 'sofia-5', name: 'Daniela Mora', attendance: 'yes', companions: 1, paidCents: 0, dueCents: 3000 },
    ],
  },
  {
    id: 'playa-escapada',
    title: 'Escapada a la Playa',
    template: 'viaje',
    themeKey: 'costa',
    priceCents: 5000,
    goalCents: 30000,
    minimumCents: 20000,
    guests: [
      { id: 'playa-1', name: 'Carla Núñez', attendance: 'yes', companions: 0, paidCents: 5000, dueCents: 0 },
      { id: 'playa-2', name: 'Bruno Salas', attendance: 'yes', companions: 0, paidCents: 5000, dueCents: 0 },
      { id: 'playa-3', name: 'Irene Bravo', attendance: 'maybe', companions: 1, paidCents: 0, dueCents: 0 },
      { id: 'playa-4', name: 'Hugo Campos', attendance: 'maybe', companions: 0, paidCents: 0, dueCents: 0 },
    ],
  },
];

export function samplePartyById(id: string): SampleParty {
  return SAMPLE_PARTIES.find((party) => party.id === id) ?? SAMPLE_PARTIES[0];
}

export function sampleCollectedCents(party: SampleParty): number {
  return party.guests.reduce((sum, guest) => sum + guest.paidCents, 0);
}
