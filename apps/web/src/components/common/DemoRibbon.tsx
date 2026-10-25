import React from 'react';
import type { Capabilities } from '../../types';

interface DemoRibbonProps {
  capabilities: (Capabilities & { chat?: boolean; llmProvider?: 'openai' | 'gemini' }) | null;
}

export const DemoRibbon: React.FC<DemoRibbonProps> = ({ capabilities }) => {
  const chatAvailable = Boolean(capabilities?.chat ?? capabilities?.gemini);

  return (
    <div className="demo-ribbon" role="region" aria-label="Aviso de modo sandbox y pagos de prueba">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="demo-ribbon-badge">PAGO DE PRUEBA</span>
        <span>
          PayPal sandbox · Sin dinero real
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.775rem', opacity: 0.9 }}>
        <span>PayPal: {capabilities?.paypal ? 'Configurado' : 'No configurado'}</span>
        <span>•</span>
        <span>Chat: {chatAvailable ? 'Configurado' : 'Desactivado'}</span>
      </div>
    </div>
  );
};
