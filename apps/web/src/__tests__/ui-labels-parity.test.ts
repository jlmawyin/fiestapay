import { describe, expect, it } from 'vitest';
import { LOCALES, UI_LABELS } from '@fiestapay/shared';
import { demoCatalog } from '../i18n/catalogs/demo';
import { dashboardCatalog } from '../i18n/messages/organizerDashboard';
import { gridCatalog } from '../i18n/messages/organizerGrid';

/**
 * La guía de programa del API cita UI_LABELS. Estos textos de catálogos web
 * dibujan cada control superviviente, para no nombrar etiquetas que la página
 * no muestra. NAP-F5b: el paso de una frase, el panel PayPal+IA y la tarjeta
 * de voz murieron con la IA propia; quedan títulos de tabla y recordatorios.
 */
describe.each(LOCALES)('UI_LABELS matches the visible %s web catalogs', (locale) => {
  const labels = UI_LABELS[locale];
  const dashboard = dashboardCatalog[locale];
  const grid = gridCatalog[locale];
  const demo = demoCatalog[locale];

  it('covers the organizer reminder drafts entry', () => {
    expect(dashboard.remindersTitle).toBe(labels.prepareReminders);
    expect(dashboard.remindersCta).toBe(labels.prepareReminders);
  });

  it('covers the organizer AG Grid toolbar and server totals row', () => {
    expect(grid.searchLabel).toBe(labels.searchGuests);
    expect(grid.pendingOnly).toBe(labels.pendingOnly);
    expect(grid.exportCsv).toBe(labels.exportCsv);
    expect(grid.totals).toBe(labels.totals);
  });

  it('covers the judges-demo AG Grid toolbar and fictional totals row', () => {
    expect(demo.filterLabel).toBe(labels.searchFictional);
    expect(demo.pendingOnly).toBe(labels.pendingOnly);
    expect(demo.exportCsv).toBe(labels.exportCsv);
    expect(demo.totals).toBe(labels.totalsFictional);
  });
});
