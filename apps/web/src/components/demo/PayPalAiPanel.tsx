import React from 'react';
import {
  BellRing,
  BookCheck,
  ClipboardList,
  CreditCard,
  Github,
  MessageSquareText,
  MessagesSquare,
  Mic,
  MousePointerClick,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useMessages } from '../../i18n/I18nContext';
import { paypalAiCatalog } from '../../i18n/messages/demoPaypalAi';

const REPO_URL = 'https://github.com/jlmawyin/fiestapay';

/**
 * Judges-demo explainer: how FiestaPay uses PayPal and AI. Every claim is
 * sourced from the production code and docs; see the catalog header.
 */
export const PayPalAiPanel: React.FC = () => {
  const m = useMessages(paypalAiCatalog);
  const paypalSteps = [
    { icon: ClipboardList, text: m.paypalStep1 },
    { icon: MousePointerClick, text: m.paypalStep2 },
    { icon: ShieldCheck, text: m.paypalStep3 },
    { icon: BellRing, text: m.paypalStep4 },
    { icon: BookCheck, text: m.paypalStep5 },
  ];
  const aiSteps = [
    { icon: Mic, text: m.aiStep1 },
    { icon: MessagesSquare, text: m.aiStep2 },
    { icon: Sparkles, text: m.aiStep3 },
    { icon: MessageSquareText, text: m.aiStep4 },
    { icon: Palette, text: m.aiStep5 },
    { icon: CreditCard, text: m.aiStep6 },
  ];
  return (
    <section
      className="panel"
      aria-label={m.title}
      data-testid="paypal-ai-panel"
      data-guide="paypalAiPanel"
      data-guide-step="paypal-ai"
    >
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{m.title}</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', maxWidth: '720px', marginBottom: '1rem' }}>
        {m.lead}
      </p>
      <div className="fp-payai-grid">
        <div className="fp-payai-col">
          <h3 className="fp-payai-coltitle">{m.paypalTitle}</h3>
          <ol className="fp-payai-steps">
            {paypalSteps.map((step, index) => (
              <li key={index} className="fp-payai-step">
                <step.icon size={18} aria-hidden="true" className="fp-payai-icon" />
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="fp-payai-note">
            <Users size={16} aria-hidden="true" className="fp-payai-icon" />
            <span>{m.paypalNote}</span>
          </p>
        </div>
        <div className="fp-payai-col">
          <h3 className="fp-payai-coltitle">{m.aiTitle}</h3>
          <ol className="fp-payai-steps">
            {aiSteps.map((step, index) => (
              <li key={index} className="fp-payai-step">
                <step.icon size={18} aria-hidden="true" className="fp-payai-icon" />
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <p className="fp-payai-repo">
        <Github size={16} aria-hidden="true" className="fp-payai-icon" />
        <span>
          {m.repoNote}{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            {m.repoLabel}: {REPO_URL.replace('https://', '')}
          </a>
        </span>
      </p>
    </section>
  );
};
