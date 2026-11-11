import React, { useEffect, useRef, useState } from 'react';
import { Check, Lock, Search } from 'lucide-react';
import { UI_LABELS } from '@fiestapay/shared';
import type {
  Capabilities,
  FiestaEvent,
  Guest,
  OrderResult,
  Quote,
  RsvpStatus,
} from '../../types';
import { useI18n, useMessages } from '../../i18n/I18nContext';
import { inviteCatalog } from '../../i18n/messages/invite';
import { JoinForm } from './JoinForm';
import { RsvpForm, visibleRsvpChoice } from './RsvpForm';
import { QuoteReviewCard } from './QuoteReviewCard';
import { PayPalSection } from './PayPalSection';
import { ASSISTANT_OPEN_EVENT } from '../assistant/AssistantOrb';

export type WizardStep = 1 | 2 | 3 | 4;

interface PaymentWizardProps {
  event: FiestaEvent;
  guest: Guest | null;
  quote: Quote | null;
  activeOrder: OrderResult | null;
  capabilities: Capabilities | null;
  isJoining: boolean;
  isSavingRsvp: boolean;
  isLoadingQuote: boolean;
  isCreatingOrder: boolean;
  isReconcilingOrder: boolean;
  /** True when the organizer closed activity or this session was revoked. */
  formsClosed: boolean;
  /** Human reason for formsClosed, already localized. Null when forms are open. */
  closedReason: string | null;
  sessionRevoked: boolean;
  paidOrCovered: boolean;
  onJoin: (name: string) => Promise<void>;
  onSaveRsvp: (status: RsvpStatus, companions: number) => Promise<void>;
  onCreateOrder: (quoteId: string) => Promise<void>;
  onRefreshQuote: () => Promise<void>;
  onReconcileOrder: () => Promise<void>;
  onDismissOrder: () => void;
  onCaptureSuccess: (orderId: string) => Promise<boolean>;
  onCancelOrError: (msg: string) => void;
}

function stepTitles(locale: 'es' | 'en'): Record<WizardStep, string> {
  const labels = UI_LABELS[locale];
  return {
    1: labels.stepJoin,
    2: labels.stepRsvp,
    3: labels.stepQuote,
    4: labels.stepPay,
  };
}

/**
 * «Tu camino al pago» as a step-by-step wizard. Each step explains and fills
 * its own reused form inside its own box, in order, with a single open step.
 * Future forms never render; past steps fold into one summary line.
 */
export const PaymentWizard: React.FC<PaymentWizardProps> = ({
  event,
  guest,
  quote,
  activeOrder,
  capabilities,
  isJoining,
  isSavingRsvp,
  isLoadingQuote,
  isCreatingOrder,
  isReconcilingOrder,
  formsClosed,
  closedReason,
  sessionRevoked,
  paidOrCovered,
  onJoin,
  onSaveRsvp,
  onCreateOrder,
  onRefreshQuote,
  onReconcileOrder,
  onDismissOrder,
  onCaptureSuccess,
  onCancelOrError,
}) => {
  const { locale, formatMoney } = useI18n();
  const m = useMessages(inviteCatalog);
  const labels = UI_LABELS[locale];
  const titles = stepTitles(locale);
  const [rsvpEditing, setRsvpEditing] = useState(false);
  // The choice this wizard just saved. RsvpForm persists an explicit "maybe"
  // to sessionStorage only after the save resolves, which lands after React
  // already flushed the post-save render; without this, step 2 would stay
  // open until the next unrelated render. Server state always wins.
  const [savedRsvp, setSavedRsvp] = useState<{ guestId: string; choice: RsvpStatus } | null>(null);
  useEffect(() => {
    setSavedRsvp(null);
  }, [guest?.id]);

  const joined = guest !== null;
  const flaggedChoice = guest ? visibleRsvpChoice(guest) : null;
  const rsvpChoice =
    flaggedChoice ?? (guest && savedRsvp?.guestId === guest.id ? savedRsvp.choice : null);
  const rsvpAnswered = rsvpChoice !== null && !rsvpEditing;
  const rsvpYes = rsvpAnswered && rsvpChoice === 'yes';
  const quoteDone = activeOrder !== null || (quote !== null && quote.amountCents === 0);
  const payDone = paidOrCovered;

  let openStep: WizardStep | null = null;
  if (!joined) openStep = 1;
  else if (!rsvpAnswered) openStep = 2;
  else if (!rsvpYes) openStep = null;
  else if (!quoteDone) openStep = 3;
  else if (!payDone) openStep = 4;

  // When the open step advances, move focus to it with a smooth scroll and
  // announce it. The first render never steals focus.
  const stepRefs = useRef<Record<WizardStep, HTMLLIElement | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
  });
  const prevOpenRef = useRef<WizardStep | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = openStep;
    if (prev === undefined || prev === openStep || openStep === null) return;
    const element = stepRefs.current[openStep];
    element?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    element?.focus?.({ preventScroll: true });
  }, [openStep]);

  const openAssistantForStep = (step: WizardStep) => {
    document.dispatchEvent(
      new CustomEvent<{ step: WizardStep }>(ASSISTANT_OPEN_EVENT, { detail: { step } }),
    );
  };

  const askLink = (step: WizardStep) => (
    <button
      type="button"
      className="payment-wizard__ask"
      onClick={() => openAssistantForStep(step)}
    >
      {labels.askAboutStep}
    </button>
  );

  const lockedHint = (step: WizardStep) => {
    if ((step === 3 || step === 4) && rsvpAnswered && !rsvpYes) {
      return m.stepNeedsAttendance;
    }
    const prev = titles[(step - 1) as WizardStep];
    return m.stepLockedHint(prev);
  };

  const renderHeaderSummary = () => {
    if (!guest) return null;
    if (guest.paidCents > 0 && guest.dueCents === 0) {
      return (
        <span className="payment-wizard__summary" role="status">
          {m.wizardPaidDone}
        </span>
      );
    }
    return (
      <span className="payment-wizard__summary" role="status">
        {m.wizardPaidLead} <strong>{formatMoney(guest.paidCents)}</strong>
        {guest.dueCents > 0 ? (
          <>
            {' · '}
            {m.wizardDueLead} <strong>{formatMoney(guest.dueCents)}</strong>
          </>
        ) : null}
      </span>
    );
  };

  const renderStepBody = (step: WizardStep) => {
    switch (step) {
      case 1: {
        if (joined) {
          return (
            <p className="payment-wizard__done-line">
              <Check size={16} aria-hidden="true" style={{ color: 'var(--color-teal)', verticalAlign: '-3px', marginRight: '0.35rem' }} />
              {m.stepJoinedLead} <strong>{guest?.name}</strong>
            </p>
          );
        }
        if (formsClosed) {
          return <p className="payment-wizard__closed">{closedReason}</p>;
        }
        return (
          <>
            <p className="payment-wizard__explain">{m.stepJoinTodo}</p>
            <JoinForm onJoin={onJoin} isLoading={isJoining} template={event.template} />
            {askLink(1)}
          </>
        );
      }
      case 2: {
        if (!guest) return null;
        if (rsvpAnswered) {
          const summary =
            rsvpChoice === 'yes'
              ? m.stepRsvpSummary(guest.companions, guest.companions + 1)
              : rsvpChoice === 'maybe'
                ? m.stepRsvpMaybe
                : m.stepRsvpNo;
          return (
            <div className="payment-wizard__done-row">
              <p className="payment-wizard__done-line">{summary}</p>
              {formsClosed ? null : (
                <button
                  type="button"
                  className="btn btn-secondary payment-wizard__change"
                  onClick={() => setRsvpEditing(true)}
                >
                  {labels.changeStep}
                </button>
              )}
            </div>
          );
        }
        if (formsClosed) {
          return <p className="payment-wizard__closed">{closedReason}</p>;
        }
        return (
          <>
            <p className="payment-wizard__explain">{m.stepRsvpTodo}</p>
            <RsvpForm
              guest={guest}
              event={event}
              onSaveRsvp={async (status, companions) => {
                await onSaveRsvp(status, companions);
                setSavedRsvp({ guestId: guest.id, choice: status });
                setRsvpEditing(false);
              }}
              isLoading={isSavingRsvp}
            />
            {askLink(2)}
          </>
        );
      }
      case 3: {
        if (!rsvpYes) return null;
        if (quoteDone && quote) {
          return (
            <p className="payment-wizard__done-line">
              {m.stepQuoteDone(formatMoney(quote.amountCents))}
            </p>
          );
        }
        if (formsClosed) {
          return <p className="payment-wizard__closed">{closedReason}</p>;
        }
        return (
          <>
            <p className="payment-wizard__explain">{m.stepQuoteTodo}</p>
            <div data-payment-quote>
              <QuoteReviewCard
                quote={quote}
                isLoadingQuote={isLoadingQuote}
                onRefreshQuote={onRefreshQuote}
                onCreateOrder={onCreateOrder}
                isCreatingOrder={isCreatingOrder}
                template={event.template}
              />
            </div>
            {askLink(3)}
          </>
        );
      }
      case 4: {
        if (!rsvpYes || !quoteDone) return null;
        if (payDone) {
          return (
            <p className="payment-wizard__done-line">
              <Check size={16} aria-hidden="true" style={{ color: 'var(--color-teal)', verticalAlign: '-3px', marginRight: '0.35rem' }} />
              {m.stepPayDone}
            </p>
          );
        }
        if (!activeOrder) return null;
        return (
          <>
            <p className="payment-wizard__explain">{m.stepPayExplain}</p>
            <div
              style={{
                backgroundColor: 'var(--color-blue-tint)',
                border: '1.5px solid var(--color-blue)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{m.activeOrder}</span>
                <code>#{activeOrder.orderId.slice(0, 8)}</code>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => void onReconcileOrder()}
                  disabled={isReconcilingOrder}
                  className="btn btn-teal"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                >
                  {isReconcilingOrder ? (
                    m.orderChecking
                  ) : (
                    <>
                      <Search size={16} aria-hidden="true" />
                      <span>{labels.verifyStatus}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onDismissOrder}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                >
                  {m.orderDismiss}
                </button>
              </div>
            </div>
            {sessionRevoked ? null : (
              <div data-paypal-section style={{ minWidth: 0 }}>
                <PayPalSection
                  order={activeOrder}
                  capabilities={capabilities}
                  onCaptureSuccess={onCaptureSuccess}
                  onCancelOrError={onCancelOrError}
                />
              </div>
            )}
            {askLink(4)}
          </>
        );
      }
    }
  };

  const stepState = (step: WizardStep): 'done' | 'open' | 'locked' => {
    if (openStep === step) return 'open';
    const done =
      (step === 1 && joined) ||
      (step === 2 && rsvpAnswered) ||
      (step === 3 && rsvpYes && quoteDone && quote !== null) ||
      (step === 4 && payDone);
    return done ? 'done' : 'locked';
  };

  const steps: WizardStep[] = [1, 2, 3, 4];

  return (
    <section
      aria-label={m.stepperAria}
      data-testid="paypal-stepper"
      className="payment-wizard"
    >
      <div className="payment-wizard__header">
        <div className="payment-wizard__title-block">
          <h3 className="payment-wizard__title">{labels.paymentPathTitle}</h3>
          <p className="payment-wizard__sub">{m.stepperSub}</p>
        </div>
        {renderHeaderSummary()}
      </div>
      {payDone && guest && guest.paidCents > 0 && guest.dueCents === 0 ? (
        <p className="payment-wizard__done-line" role="status">
          {m.paymentVerified(formatMoney(guest.paidCents))}
        </p>
      ) : null}
      <p className="payment-wizard__live" role="status" aria-live="polite">
        {openStep === null ? '' : titles[openStep]}
      </p>
      <ol className="payment-wizard__steps">
        {steps.map((step) => {
          const state = stepState(step);
          return (
            <li
              key={step}
              ref={(element) => {
                stepRefs.current[step] = element;
              }}
              tabIndex={state === 'open' ? -1 : undefined}
              aria-current={state === 'open' ? 'step' : undefined}
              aria-disabled={state === 'locked' ? true : undefined}
              data-step-state={state}
              data-guide-step={`payment-${step}`}
              className={`payment-wizard__step payment-wizard__step--${state}`}
            >
              <div className="payment-wizard__step-head">
                <span aria-hidden="true" className="payment-wizard__badge">
                  {state === 'done' ? (
                    <Check size={14} aria-hidden="true" />
                  ) : state === 'locked' ? (
                    <Lock size={14} aria-hidden="true" />
                  ) : (
                    step
                  )}
                </span>
                <strong className="payment-wizard__step-title">{titles[step]}</strong>
              </div>
              {state === 'locked' ? (
                <p className="payment-wizard__locked-hint">{lockedHint(step)}</p>
              ) : (
                <div className="payment-wizard__step-body">{renderStepBody(step)}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};
