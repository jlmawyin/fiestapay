import React from 'react';
import { CreateInterviewView } from './CreateInterviewView';

interface CreateEventViewProps {
  onEventCreated: (slug: string) => void;
  onCancel: () => void;
  onShowToast: (type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string) => void;
  recoveryAvailable?: boolean;
}

/**
 * NAP-U3: /create es la entrevista con la avatar (la persona arma su reunión
 * conversando). El contrato de props no cambia para App.
 */
export const CreateEventView: React.FC<CreateEventViewProps> = ({
  onEventCreated,
  onCancel,
  onShowToast,
  recoveryAvailable = false,
}) => (
  <CreateInterviewView
    onDone={onEventCreated}
    onCancel={onCancel}
    onShowToast={onShowToast}
    recoveryAvailable={recoveryAvailable}
  />
);
