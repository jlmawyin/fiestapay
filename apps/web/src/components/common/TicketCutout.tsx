import React from 'react';

export const TicketCutout: React.FC = () => {
  return (
    <div className="ticket-divider-wrapper" aria-hidden="true">
      <div className="ticket-notch-left" />
      <div className="ticket-perforation" />
      <div className="ticket-notch-right" />
    </div>
  );
};
