import React from 'react';
import { themeCssVars, type ThemeDefinition } from '../../lib/event-presentation';

interface ThemeScopeProps {
  theme: ThemeDefinition;
  children: React.ReactNode;
  className?: string;
}

/** Scoped palette for one invitation. Changing events replaces this node, not :root. */
export const ThemeScope: React.FC<ThemeScopeProps> = ({ theme, children, className }) => (
  <div className={className ? `theme-scope ${className}` : 'theme-scope'} data-theme={theme.key} style={themeCssVars(theme)}>
    {children}
  </div>
);
