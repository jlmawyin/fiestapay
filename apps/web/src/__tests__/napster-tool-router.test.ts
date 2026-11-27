/**
 * NAP-F3 — router de tools del público: listas cerradas, validación estricta y
 * ejecución por la app. Sin red hacia Napster; los eventos y la navegación se
 * inyectan.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { createAvatarToolRouter } from '../components/avatar/toolRouter';
import type { PortalListedEvent } from '../api/client';

function sampleEvent(slug: string, index: number): PortalListedEvent {
  return {
    slug,
    title: `Evento ${index}`,
    startsAt: '2026-12-01T18:00:00.000Z',
    endsAt: '2026-12-01T22:00:00.000Z',
    location: 'Quito',
    siteSlug: `sitio-${index}`,
    siteName: `Sitio ${index}`,
    url: `https://sitio-${index}.somospanas.com/e/${slug}`,
    listingKind: 'live',
  };
}

describe('createAvatarToolRouter (NAP-F3, público)', () => {
  const fetchEvents = vi.fn();
  const navigate = vi.fn();
  const highlight = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchEvents.mockReset();
    navigate.mockReset();
    highlight.mockReset();
    document.body.innerHTML = [
      '<section id="portal-section-compositor">',
      '<input id="portal-slug" value="" />',
      '<input id="portal-display-name" value="" />',
      '</section>',
      '<section id="portal-section-eventos-publicos"></section>',
      '<section id="portal-section-hero"></section>',
    ].join('');
    Element.prototype.scrollIntoView = vi.fn();
    fetchEvents.mockResolvedValue({ events: [] });
    highlight.mockResolvedValue({ ok: true });
  });

  function router() {
    return createAvatarToolRouter({ visitor: 'public', fetchEvents, navigate, highlight });
  }

  it('rechaza una tool desconocida sin efectos', async () => {
    const output = await router().route({ call_id: 'c1', name: 'delete_everything', arguments: {} });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
    expect(fetchEvents).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(highlight).not.toHaveBeenCalled();
  });

  it('rechaza una tool de otro visitante (creador)', async () => {
    const output = await router().route({
      call_id: 'c2',
      name: 'fill_event_draft',
      arguments: { title: 'Fiesta', startsAt: '2026-12-01T18:00' },
    });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('rechaza argumentos extra aunque la tool exista', async () => {
    const output = await router().route({
      call_id: 'c3',
      name: 'list_open_events',
      arguments: { url: 'https://evil.example.com' },
    });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
    expect(fetchEvents).not.toHaveBeenCalled();
  });

  it('list_open_events guarda los 5 primeros con ref 1..5 y sin URLs', async () => {
    fetchEvents.mockResolvedValue({
      events: [1, 2, 3, 4, 5, 6, 7].map((i) => sampleEvent(`evento-${i}`, i)),
    });
    const output = await router().route({ call_id: 'c4', name: 'list_open_events', arguments: {} });
    expect(output).toEqual({
      events: [1, 2, 3, 4, 5].map((i) => ({
        ref: i,
        title: `Evento ${i}`,
        startsAt: '2026-12-01T18:00:00.000Z',
        place: 'Quito',
        siteName: `Sitio ${i}`,
      })),
    });
    expect(JSON.stringify(output)).not.toContain('http');
  });

  it('open_event navega a la URL que dio el servidor para ese ref', async () => {
    fetchEvents.mockResolvedValue({ events: [1, 2, 3].map((i) => sampleEvent(`evento-${i}`, i)) });
    const tool = router();
    await tool.route({ call_id: 'c5', name: 'list_open_events', arguments: {} });
    const output = await tool.route({ call_id: 'c6', name: 'open_event', arguments: { ref: 2 } });
    expect(output).toEqual({ ok: true, ref: 2 });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://sitio-2.somospanas.com/e/evento-2');
  });

  it('open_event rechaza refs fuera de la lista sin navegar', async () => {
    fetchEvents.mockResolvedValue({ events: [1, 2].map((i) => sampleEvent(`evento-${i}`, i)) });
    const tool = router();
    await tool.route({ call_id: 'c7', name: 'list_open_events', arguments: {} });
    // Ref válido por esquema (1..5) pero ausente de la última lista.
    const output = await tool.route({ call_id: 'c8', name: 'open_event', arguments: { ref: 5 } });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
    // Ref inválido por esquema.
    const bad = await tool.route({ call_id: 'c9', name: 'open_event', arguments: { ref: 9 } });
    expect(bad).toEqual({ ok: false, error: 'not_allowed' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('open_event sin lista previa no navega', async () => {
    const output = await router().route({ call_id: 'c10', name: 'open_event', arguments: { ref: 1 } });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('start_new_space lleva al compositor, lo rellena y no crea el sitio', async () => {
    const create = vi.spyOn(api, 'createSiteSpace');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const output = await router().route({
      call_id: 'c11',
      name: 'start_new_space',
      arguments: { slug: 'mi-grupo', name: 'Mi grupo' },
    });
    expect(output).toEqual({ ok: true });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect((document.getElementById('portal-slug') as HTMLInputElement).value).toBe('mi-grupo');
    expect((document.getElementById('portal-display-name') as HTMLInputElement).value).toBe('Mi grupo');
    expect(create).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('start_new_space rechaza un slug inválido por contrato sin tocar el formulario', async () => {
    const output = await router().route({
      call_id: 'c12',
      name: 'start_new_space',
      arguments: { slug: 'MAL slug!' },
    });
    expect(output).toEqual({ ok: false, error: 'not_allowed' });
    expect((document.getElementById('portal-slug') as HTMLInputElement).value).toBe('');
  });

  it('start_new_space omite el slug que pasa el contrato pero no la gramática', async () => {
    // '-ab' cumple ^[a-z0-9-]{3,40}$ pero no la etiqueta DNS (empieza en guion).
    const output = await router().route({
      call_id: 'c13',
      name: 'start_new_space',
      arguments: { slug: '-ab', name: 'Grupo guion' },
    });
    expect(output).toEqual({ ok: true });
    expect((document.getElementById('portal-slug') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('portal-display-name') as HTMLInputElement).value).toBe('Grupo guion');
  });

  it('start_new_space omite un slug reservado', async () => {
    const output = await router().route({
      call_id: 'c14',
      name: 'start_new_space',
      arguments: { slug: 'admin' },
    });
    expect(output).toEqual({ ok: true });
    expect((document.getElementById('portal-slug') as HTMLInputElement).value).toBe('');
  });

  it('show_on_screen con id raíz resalta su sección de la portada', async () => {
    const output = await router().route({
      call_id: 'c15',
      name: 'show_on_screen',
      arguments: { target: 'eventos-publicos' },
    });
    expect(output).toEqual({ ok: true, target: 'eventos-publicos' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(highlight).not.toHaveBeenCalled();
  });

  it('show_on_screen rechaza ids fuera de la lista y claves extra', async () => {
    const unknown = await router().route({
      call_id: 'c16',
      name: 'show_on_screen',
      arguments: { target: 'boton-pago' },
    });
    expect(unknown).toEqual({ ok: false, error: 'not_allowed' });
    const extra = await router().route({
      call_id: 'c17',
      name: 'show_on_screen',
      arguments: { target: 'eventos-publicos', selector: '#x' },
    });
    expect(extra).toEqual({ ok: false, error: 'not_allowed' });
    const longCaption = await router().route({
      call_id: 'c18',
      name: 'show_on_screen',
      arguments: { target: 'eventos-publicos', caption: 'x'.repeat(61) },
    });
    expect(longCaption).toEqual({ ok: false, error: 'not_allowed' });
    expect(highlight).not.toHaveBeenCalled();
  });

  it('show_on_screen delega los ids legados en showOnScreen', async () => {
    const output = await router().route({
      call_id: 'c19',
      name: 'show_on_screen',
      arguments: { target: 'myInvitations', caption: 'Tus invitaciones' },
    });
    expect(output).toEqual({ ok: true, target: 'myInvitations' });
    expect(highlight).toHaveBeenCalledWith({ target: 'myInvitations', caption: 'Tus invitaciones' });
  });

  it('una tool lenta responde antes del plazo de 10 s', async () => {
    const hanging = () => new Promise<{ events: PortalListedEvent[] }>(() => undefined);
    const tool = createAvatarToolRouter({ visitor: 'public', fetchEvents: hanging, timeoutMs: 20 });
    const output = await tool.route({ call_id: 'c20', name: 'list_open_events', arguments: {} });
    expect(output).toEqual({ ok: false, error: 'failed' });
  });

  it('acepta arguments como JSON en texto y rechaza texto inválido', async () => {
    fetchEvents.mockResolvedValue({ events: [sampleEvent('evento-1', 1)] });
    const tool = router();
    const output = await tool.route({ call_id: 'c21', name: 'list_open_events', arguments: '{}' });
    expect(output).toEqual({
      events: [{ ref: 1, title: 'Evento 1', startsAt: '2026-12-01T18:00:00.000Z', place: 'Quito', siteName: 'Sitio 1' }],
    });
    const bad = await tool.route({ call_id: 'c22', name: 'list_open_events', arguments: '{no-json' });
    expect(bad).toEqual({ ok: false, error: 'not_allowed' });
  });
});
