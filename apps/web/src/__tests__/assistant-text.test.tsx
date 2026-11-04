import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantText, splitAssistantText } from '../components/chat/AssistantText';

afterEach(() => {
  cleanup();
});

describe('negritas seguras de los mensajes del asistente', () => {
  it('renderiza negritas multiples y multilinea sin exponer los asteriscos dobles', () => {
    const { container } = render(
      <AssistantText text={'**Hola** y **tu cuota**\n**otra linea\ncon salto** final'} />,
    );

    const strongs = Array.from(container.querySelectorAll('strong'));
    expect(strongs.map((node) => node.textContent)).toEqual([
      'Hola',
      'tu cuota',
      'otra linea\ncon salto',
    ]);
    expect(container.textContent).toBe('Hola y tu cuota\n' + 'otra linea\ncon salto final');
    expect(container.textContent).not.toContain('**');
  });

  it('muestra HTML y scripts como texto y nunca los ejecuta', () => {
    const { container } = render(
      <AssistantText text={'<script>alert(1)</script> y **<img src=x onerror=alert(1)>**'} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('strong')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('no expone un marcador incompleto como asteriscos dobles', () => {
    const { container } = render(<AssistantText text={'Precio **sin cerrar'} />);

    expect(container.textContent).toBe('Precio sin cerrar');
    expect(container.textContent).not.toContain('**');
    expect(container.querySelector('strong')).toBeNull();
  });

  it('separa segmentos sin dejar marcadores ni texto vacio', () => {
    expect(splitAssistantText('**a** **b**')).toEqual([
      { bold: true, text: 'a' },
      { bold: false, text: ' ' },
      { bold: true, text: 'b' },
    ]);
    expect(splitAssistantText('****')).toEqual([]);
    expect(splitAssistantText('texto plano')).toEqual([{ bold: false, text: 'texto plano' }]);
  });
});
