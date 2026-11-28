import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useMessages } from '../i18n/I18nContext';
import { inviteCatalog } from '../i18n/messages/invite';

interface FreeAddressViewProps {
  label: string;
}

/** NAP-U4: una dirección de reunión que todavía no existe invita a crearla conversando. */
export const FreeAddressView: React.FC<FreeAddressViewProps> = ({ label }) => {
  const m = useMessages(inviteCatalog);
  const createUrl = `https://somospanas.com/create?subdominio=${encodeURIComponent(label)}`;
  return (
    <section className="free-address" aria-labelledby="free-address-title">
      <span className="free-address__label">{label}.somospanas.com</span>
      <h1 id="free-address-title">{m.freeTitle}</h1>
      <p>{m.freeBody(label)}</p>
      <a className="btn btn-primary free-address__cta" href={createUrl}>
        <MessageCircle size={18} aria-hidden="true" />
        <span>{m.freeCta}</span>
      </a>
      <p className="free-address__hint">{m.freeHint}</p>
    </section>
  );
};
