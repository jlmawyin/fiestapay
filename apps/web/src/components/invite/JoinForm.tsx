import React, { useState } from 'react';

interface JoinFormProps {
  onJoin: (name: string) => Promise<void>;
  isLoading: boolean;
}

export const JoinForm: React.FC<JoinFormProps> = ({ onJoin, isLoading }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor ingresa un alias ficticio.');
      return;
    }
    setError(null);
    try {
      await onJoin(name.trim());
    } catch (err: any) {
      setError(err.message || 'Error al unirte a la fiesta.');
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-yellow-tint)',
        border: '1.5px solid var(--color-yellow)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.3rem' }}>👋</span>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--color-ink)' }}>¿Vienes a la fiesta?</h3>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
        Usa un alias ficticio para probar tu asistencia y tu cuota. No necesitas datos personales, contraseña ni registro previo.
      </p>

      {error && (
        <div
          style={{
            backgroundColor: 'var(--color-coral-tint)',
            color: 'var(--color-coral)',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            marginBottom: '0.75rem',
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: '180px' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Invitado Demo"
          aria-label="Alias del invitado"
          required
          disabled={isLoading}
        />
        <button type="submit" className="btn btn-primary" disabled={isLoading || !name.trim()}>
          {isLoading ? 'Entrando...' : 'Entrar a la fiesta'}
        </button>
      </form>
    </div>
  );
};
