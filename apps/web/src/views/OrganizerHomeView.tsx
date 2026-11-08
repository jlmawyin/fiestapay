import React from 'react';
import type { FiestaEvent } from '../types';
import { LandingView } from './LandingView';

interface OrganizerHomeViewProps {
  events: FiestaEvent[];
  isLoading: boolean;
  /** A bounded read failure. Existing events stay visible. */
  eventsError?: string | null;
  onRetryEvents?: () => void;
  onNavigateCreate: () => void;
  onNavigateInvite: (slug: string) => void;
  onNavigateDashboard: (slug: string) => void;
  onCreateDemo: () => Promise<void>;
  /** Explicit payment demo. It never runs on render. */
  onStartPaymentDemo?: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  isResetting: boolean;
  /** Opens the read-only fictional AG Grid preview at /demo. */
  onNavigatePreview?: () => void;
  /** Opens the existing recovery route without weakening dashboard authorization. */
  onNavigateRecover?: () => void;
}

/**
 * Compatibility alias: `/` is the product landing now. The demo actions and
 * the demo reset moved to `/demo`, so the demo-only props are accepted and
 * ignored here; the preview navigation maps to the judges demo entry.
 */
export const OrganizerHomeView: React.FC<OrganizerHomeViewProps> = (props) => {
  return (
    <LandingView
      events={props.events}
      isLoading={props.isLoading}
      eventsError={props.eventsError}
      onRetryEvents={props.onRetryEvents}
      onNavigateCreate={props.onNavigateCreate}
      onNavigateInvite={props.onNavigateInvite}
      onNavigateDashboard={props.onNavigateDashboard}
      onNavigateDemo={props.onNavigatePreview ?? (() => undefined)}
      onNavigateRecover={props.onNavigateRecover ?? (() => undefined)}
    />
  );
};
