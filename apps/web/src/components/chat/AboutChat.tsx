import React from 'react';

interface AboutChatProps {
  title: string;
  children: React.ReactNode;
}

/**
 * The single folding line that holds every notice (info strip, privacy,
 * voice caveats), so the message list keeps the panel height. Collapsed
 * by default; the full text stays one tap away.
 */
export const AboutChat: React.FC<AboutChatProps> = ({ title, children }) => (
  <details className="fp-about-chat" data-testid="about-chat">
    <summary>{title}</summary>
    <div className="fp-about-chat__body">{children}</div>
  </details>
);
