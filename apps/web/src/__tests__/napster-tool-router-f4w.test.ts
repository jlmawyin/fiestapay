/**
 * NAP-F4w — tools de invitado y creador: validación, rellenos sin envío,
 * navegación interna y visitante fijado por el servidor. Sin red real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeGuideDraftProposal } from '../guide/showOnScreen';
import { createAvatarToolRouter } from '../components/avatar/toolRouter';
import { consumeAvatarReminderDraft } from '../components/avatar/reminderPrefill';
import { consumeCreateIntent } from '../components/avatar/sessionIntent';

describe('createAvatarToolRouter (NAP-F4w, invitado y creador)', () => {
  const navigateTo = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    navigateTo.mockReset();
    consumeCreateIntent();
    consumeAvatarReminderDraft();
    consumeGuideDraftProposal();
    sessionStorage.clear();
    document.body.innerHTML = [
      '<section id="portal-section-compositor">',
      '<input id="portal-slug" value="" />',
      '<input id="portal-display-name" value="" />',
      '</section>',
      '<div class="invite-facts"></div>',
      '<section class="reminder-drafts panel"></section>',
    ].join('');
    Element.prototype.scrollIntoView = vi.fn();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    sessionStorage.clear();
    consumeCreateIntent();
    consumeAvatarReminderDraft();
    consumeGuideDraftProposal();
  });

  it('un invitado no puede ejecutar fill_event_draft', async () => {
    const tool = createAvatarToolRouter({ visitor: 'guest', navigateTo });
    const output = await tool.route({
      call_id: 'g1',
      name: 'fill_event_draft',
      arguments: { title: 'Fiesta', startsAt: '2026-12-01T18:00' },
    });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
    expect(navigateTo).not.toHaveBeenCalled();
    expect(consumeGuideDraftProposal()).toBeNull();
  });

  it('el público no puede pedir show_event_details', async () => {
    const tool = createAvatarToolRouter({ visitor: 'public', navigateTo });
    const output = await tool.route({ call_id: 'p1', name: 'show_event_details', arguments: {} });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('show_event_details lleva a los datos logísticos de la invitación', async () => {
    const tool = createAvatarToolRouter({ visitor: 'guest', navigateTo });
    const output = await tool.route({ call_id: 'g2', name: 'show_event_details', arguments: {} });
    expect(output).toEqual({ ok: true });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('show_event_details informa no disponible sin la sección', async () => {
    document.querySelector('.invite-facts')?.remove();
    const tool = createAvatarToolRouter({ visitor: 'guest', navigateTo });
    const output = await tool.route({ call_id: 'g3', name: 'show_event_details', arguments: {} });
    expect(output).toEqual({ ok: false, error: 'unavailable' });
  });

  it('fill_event_draft prepara el borrador y abre el formulario sin enviarlo', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    const output = await tool.route({
      call_id: 'c1',
      name: 'fill_event_draft',
      arguments: {
        title: 'Asado pana',
        startsAt: '2026-12-01T18:30',
        place: 'Quito',
        description: 'Traigan hambre',
      },
    });
    expect(output).toEqual({ ok: true });
    expect(navigateTo).toHaveBeenCalledWith('/create');
    const proposal = consumeGuideDraftProposal();
    expect(proposal).toMatchObject({
      title: 'Asado pana',
      date: '2026-12-01',
      startTime: '18:30',
      location: 'Quito',
      source: 'rules',
    });
    expect((proposal as unknown as { description: string }).description).toBe('Traigan hambre');
    expect(proposal?.suggested).toEqual(expect.arrayContaining(['title', 'date', 'startTime', 'location']));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fill_event_draft rechaza fecha u hora irreales aunque pasen el patrón', async () => {
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    const badDate = await tool.route({
      call_id: 'c2',
      name: 'fill_event_draft',
      arguments: { title: 'X', startsAt: '2026-13-40T18:00' },
    });
    expect(badDate).toEqual({ ok: false, error: 'not_allowed' });
    const badTime = await tool.route({
      call_id: 'c3',
      name: 'fill_event_draft',
      arguments: { title: 'X', startsAt: '2026-12-01T99:99' },
    });
    expect(badTime).toEqual({ ok: false, error: 'not_allowed' });
    const extra = await tool.route({
      call_id: 'c4',
      name: 'fill_event_draft',
      arguments: { title: 'X', startsAt: '2026-12-01T18:00', publish: true },
    });
    expect(extra).toEqual({ ok: false, error: 'not_allowed' });
    expect(navigateTo).not.toHaveBeenCalled();
    expect(consumeGuideDraftProposal()).toBeNull();
  });

  it('draft_reminder deja el texto en la vista sin enviarlo', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    const output = await tool.route({
      call_id: 'c5',
      name: 'draft_reminder',
      arguments: { text: 'Recuerden el asado del sábado' },
    });
    expect(output).toEqual({ ok: true });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(consumeAvatarReminderDraft()).toBe('Recuerden el asado del sábado');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('draft_reminder no deja pendiente sin la sección y rechaza texto vacío', async () => {
    document.querySelector('.reminder-drafts')?.remove();
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    const output = await tool.route({ call_id: 'c6', name: 'draft_reminder', arguments: { text: 'Hola' } });
    expect(output).toEqual({ ok: false, error: 'unavailable' });
    expect(consumeAvatarReminderDraft()).toBeNull();
    const empty = await createAvatarToolRouter({ visitor: 'creator', navigateTo }).route({
      call_id: 'c7',
      name: 'draft_reminder',
      arguments: { text: '' },
    });
    expect(empty).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('open_avatar_settings navega a ajustes solo en subdominio de sitio', async () => {
    sessionStorage.setItem('fp_sp_host_override', 'site');
    const site = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    expect(await site.route({ call_id: 'c8', name: 'open_avatar_settings', arguments: {} })).toEqual({ ok: true });
    expect(navigateTo).toHaveBeenCalledWith('/settings');

    sessionStorage.setItem('fp_sp_host_override', 'somospanas-root');
    const root = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    expect(await root.route({ call_id: 'c9', name: 'open_avatar_settings', arguments: {} })).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });

  it('start_new_space fuera de la raíz no aplica, y en la raíz marca intent', async () => {
    document.getElementById('portal-section-compositor')?.remove();
    const away = createAvatarToolRouter({ visitor: 'creator', navigateTo });
    expect(
      await away.route({ call_id: 'c10', name: 'start_new_space', arguments: {} }),
    ).toEqual({ ok: false, error: 'unavailable' });
    expect(consumeCreateIntent()).toBe(false);
  });

  it('show_on_screen amarra el slug en página de evento', async () => {
    const highlight = vi.fn().mockResolvedValue({ ok: true });
    const tool = createAvatarToolRouter({ visitor: 'guest', navigateTo, highlight, inviteSlug: 'asado-1' });
    const output = await tool.route({
      call_id: 'g4',
      name: 'show_on_screen',
      arguments: { target: 'quoteReview' },
    });
    expect(output).toEqual({ ok: true, target: 'quoteReview' });
    expect(highlight).toHaveBeenCalledWith({ target: 'quoteReview' }, { inviteSlug: 'asado-1' });
  });

  it('setVisitor aplica la lista del servidor y descarta refs de otro contexto', async () => {
    const navigate = vi.fn();
    const tool = createAvatarToolRouter({
      visitor: 'public',
      navigate,
      navigateTo,
      fetchEvents: async () => ({
        events: [
          {
            slug: 'a',
            title: 'A',
            startsAt: '2026-12-01T18:00:00.000Z',
            endsAt: '2026-12-01T20:00:00.000Z',
            location: 'Quito',
            siteSlug: 's',
            siteName: 'S',
            url: 'https://s.somospanas.com/e/a',
            listingKind: 'live',
          },
        ],
      }),
    });
    await tool.route({ call_id: 's1', name: 'list_open_events', arguments: {} });
    tool.setVisitor('guest');
    const stale = await tool.route({ call_id: 's2', name: 'open_event', arguments: { ref: 1 } });
    expect(stale).toEqual({ ok: false, error: 'not_allowed' });
    expect(navigate).not.toHaveBeenCalled();
    // De vuelta a público con lista fresca: el mismo visitante la conserva.
    tool.setVisitor('public');
    await tool.route({ call_id: 's3', name: 'list_open_events', arguments: {} });
    tool.setVisitor('public');
    const fresh = await tool.route({ call_id: 's4', name: 'open_event', arguments: { ref: 1 } });
    expect(fresh).toEqual({ ok: true, ref: 1 });
  });

  it('la navegación interna usa pushState y avisa con popstate', async () => {
    const seen: string[] = [];
    const onPop = () => seen.push(window.location.pathname);
    window.addEventListener('popstate', onPop);
    try {
      const tool = createAvatarToolRouter({ visitor: 'creator' });
      const output = await tool.route({
        call_id: 'c11',
        name: 'fill_event_draft',
        arguments: { title: 'T', startsAt: '2026-12-01T18:00' },
      });
      expect(output).toEqual({ ok: true });
      expect(window.location.pathname).toBe('/create');
      expect(seen).toEqual(['/create']);
    } finally {
      window.removeEventListener('popstate', onPop);
    }
  });
});
