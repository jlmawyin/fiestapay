import React from 'react';
import { PRODUCT_TOUR, UI_LABELS, type Locale, type ProductTutorialTopic } from '@fiestapay/shared';
import { useI18n } from '../i18n/I18nContext';
import { startProductTour } from '../guide/showOnScreen';

const copy: Record<Locale, {
  intro: string;
  start: string;
  details: Record<ProductTutorialTopic, string>;
}> = {
  es: {
    intro: 'Recorre FiestaPay desde la primera idea hasta el día del evento. Pídele al Agente FiestaPay que te guíe por texto o voz. Los pagos del demo y de tus eventos propios usan PayPal Sandbox en esta versión.',
    start: 'Empezar recorrido',
    details: {
      tutorialDemo: 'En Demo para jueces puedes crear un borrador con una frase, explorar la tabla de invitados de ejemplo, probar el pago y abrir una demo privada con panel propio. Mis demos reúne las pruebas de este navegador. Reiniciar mis demos archiva esas pruebas.',
      tutorialCreate: 'Empieza con una frase, la entrevista guiada o el formulario. Revisa fecha, lugar, cupo, cuota y lo que incluye. Compara las tarjetas y pulsa Publicar invitación cuando los datos estén listos.',
      tutorialShare: 'En la invitación, Código QR / Compartir abre el enlace público para tus invitados. Pueden escanearlo con la cámara o abrir el enlace desde WhatsApp. Guarda el enlace y el QR de organizador en privado porque abren el panel.',
      tutorialGuest: 'Abre la invitación y únete con tu nombre. Si es privada, pide el código al organizador. Confirma asistencia y acompañantes, revisa el importe del servidor y aprueba en PayPal. FiestaPay muestra el pago cuando verifica la captura.',
      tutorialOrganizer: 'Desde Mis invitaciones abre el panel de tu evento. Puedes editar la invitación, revisar asistencia y cobros, filtrar pendientes, exportar la tabla y confirmar o cerrar el evento. Pide a la IA un borrador de recordatorio y envíalo tú por WhatsApp después de revisarlo.',
      tutorialAccess: 'Si perdiste el acceso al panel, abre el enlace privado que guardaste o usa otro navegador donde todavía tengas acceso. Si configuraste y verificaste el correo de recuperación y el servidor lo admite, usa Recuperar mi enlace con la invitación y ese correo. Si olvidaste el código de invitado, pídelo al organizador.',
    },
  },
  en: {
    intro: 'Go through FiestaPay from the first idea to the day of the event. Ask the FiestaPay agent to guide you by text or voice. Demo payments and payments for your own events use PayPal Sandbox in this version.',
    start: 'Start walkthrough',
    details: {
      tutorialDemo: 'In Judges demo you can draft an invitation from one sentence, explore the sample guest table, try a payment, and open a private demo with its own dashboard. My demos lists this browser’s examples. Reset my demos archives those examples.',
      tutorialCreate: 'Start with a sentence, the guided interview, or the form. Review the date, venue, capacity, share, and what it covers. Compare the cards and select Publish invitation when the details are ready.',
      tutorialShare: 'On the invitation, QR code / Share opens the public guest link. Guests can scan it with their camera or open the link from WhatsApp. Keep the organizer link and QR code private because they open the dashboard.',
      tutorialGuest: 'Open the invitation and join with your name. For a private invitation, ask the organizer for the access code. RSVP for yourself and your companions, review the server quote, and approve in PayPal. FiestaPay shows the payment once it verifies the capture.',
      tutorialOrganizer: 'Open your event dashboard from My invitations. You can edit the invitation, review RSVPs and payments, filter pending guests, export the table, and confirm or close the event. Ask AI for a reminder draft, then review and send it yourself in WhatsApp.',
      tutorialAccess: 'If you lost dashboard access, open your saved private link or use another browser that still has access. If you verified a recovery email and the server supports email recovery, use Recover my link with the invitation and that email. If you forgot a guest access code, ask the organizer.',
    },
  },
};

interface TutorialViewProps {
  onNavigateDemo: () => void;
  onNavigateCreate: () => void;
  onNavigateInvitations: () => void;
  onNavigateRecover: () => void;
}

export const TutorialView: React.FC<TutorialViewProps> = ({
  onNavigateDemo,
  onNavigateCreate,
  onNavigateInvitations,
  onNavigateRecover,
}) => {
  const { locale } = useI18n();
  const labels = UI_LABELS[locale];
  const m = copy[locale];
  const links: Partial<Record<ProductTutorialTopic, { label: string; open: () => void }>> = {
    tutorialDemo: { label: labels.judgesDemo, open: onNavigateDemo },
    tutorialCreate: { label: labels.createInvitation, open: onNavigateCreate },
    tutorialOrganizer: { label: labels.myInvitations, open: onNavigateInvitations },
    tutorialAccess: { label: labels.recoverLink, open: onNavigateRecover },
  };

  return (
    <div className="product-tutorial">
      <section className="panel product-tutorial__intro" aria-labelledby="product-tutorial-title">
        <h1 id="product-tutorial-title">{labels.productTutorial}</h1>
        <p>{m.intro}</p>
        <button type="button" className="btn btn-primary" onClick={startProductTour}>
          {m.start}
        </button>
      </section>
      <ol className="product-tutorial__topics">
        {PRODUCT_TOUR.map((topic) => {
          const link = links[topic];
          return (
            <li key={topic}>
              <section className="panel product-tutorial__topic" data-guide={topic} aria-labelledby={topic}>
                <h2 id={topic}>{labels[topic]}</h2>
                <p>{m.details[topic]}</p>
                {link ? (
                  <button type="button" className="btn btn-secondary" onClick={link.open}>
                    {link.label}
                  </button>
                ) : null}
              </section>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
