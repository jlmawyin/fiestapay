import type { OutboundEmail } from './types.js';

export function recoveryEmail(purpose: 'verify' | 'recover', origin: string, to: string, token: string): OutboundEmail {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error('token de recuperacion invalido');
  const link = `${origin.replace(/\/+$/, '')}/recover#t=${token}`;
  if (purpose === 'verify') {
    return {
      to,
      subject: 'Confirma tu correo en FiestaPay',
      text: [
        'Confirma el correo opcional de recuperacion de tu fiesta.',
        'El enlace caduca en 15 minutos y funciona una sola vez.',
        'Abrir el enlace no confirma nada: tienes que pulsar el boton en la pagina.',
        link,
        'Si no pediste esto, ignora el mensaje.',
      ].join('\n\n'),
    };
  }
  return {
    to,
    subject: 'Recupera tu enlace de organizador en FiestaPay',
    text: [
      'Puedes crear un enlace de organizador nuevo para tu fiesta.',
      'El enlace anterior dejara de servir. Este caduca en 15 minutos y funciona una sola vez.',
      'Abrir el enlace no cambia la clave: tienes que pulsar el boton en la pagina.',
      link,
      'Si no pediste esto, ignora el mensaje.',
    ].join('\n\n'),
  };
}
