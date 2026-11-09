import { describe, expect, it } from 'vitest';
import { LOCALES, UI_LABELS } from '@fiestapay/shared';
import { demoCatalog } from '../i18n/catalogs/demo';
import { paypalAiCatalog } from '../i18n/messages/demoPaypalAi';
import { voiceCatalog } from '../i18n/messages/voice';
import { createEventCatalog } from '../i18n/messages/organizerCreate';
import { dashboardCatalog } from '../i18n/messages/organizerDashboard';
import { gridCatalog } from '../i18n/messages/organizerGrid';

/**
 * The API program guide quotes UI_LABELS. These are the web catalog strings that render each
 * new control, so the assistant never says a label the page does not show (no drift).
 */
describe.each(LOCALES)('UI_LABELS matches the visible %s web catalogs', (locale) => {
  const labels = UI_LABELS[locale];
  const create = createEventCatalog[locale];
  const dashboard = dashboardCatalog[locale];
  const grid = gridCatalog[locale];
  const demo = demoCatalog[locale];
  const paypalAi = paypalAiCatalog[locale];
  const voice = voiceCatalog[locale];

  it('covers the one-sentence create step', () => {
    expect(create.draftTitle).toBe(labels.describeInvitation);
    expect(create.draftFill).toBe(labels.fillWithAi);
  });

  it('covers the organizer reminder drafts and tone options', () => {
    expect(dashboard.remindersTitle).toBe(labels.prepareReminders);
    expect(dashboard.remindersCta).toBe(labels.prepareReminders);
    expect(dashboard.remindersToneLabel).toBe(labels.reminderTone);
    expect(dashboard.remindersToneFriendly).toBe(labels.reminderToneFriendly);
    expect(dashboard.remindersToneFun).toBe(labels.reminderToneFun);
    expect(dashboard.remindersToneFormal).toBe(labels.reminderToneFormal);
    expect(dashboard.remindersCopy).toBe(labels.copy);
    expect(dashboard.remindersOpenWhatsapp).toBe(labels.openWhatsapp);
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

  it('covers the PayPal and AI explainer panel on /demo', () => {
    expect(paypalAi.title).toBe(labels.paypalAiPanel);
  });

  it('covers the guest agent "Approve in PayPal" card', () => {
    expect(voice.approveInPayPal('').trim()).toBe(labels.approveInPayPal);
    expect(paypalAi.aiStep6).toContain(labels.approveInPayPal);
  });
});
