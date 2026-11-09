import React from 'react';
import { Download } from 'lucide-react';

export interface GridToolbarProps {
  /** Unique input id so the label stays associated on pages with one grid. */
  searchId: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  pendingOnly: boolean;
  onPendingOnlyChange: (value: boolean) => void;
  pendingOnlyLabel: string;
  onExport: () => void;
  exportLabel: string;
  searchTestId: string;
  pendingTestId: string;
  exportTestId: string;
}

/**
 * Shared AG Grid Community toolbar: quick search, a pending-only external
 * filter switch, and CSV export. Wraps to several lines under 375 px; the
 * grid itself keeps scrolling inside its own container.
 */
export const GridToolbar: React.FC<GridToolbarProps> = ({
  searchId,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  pendingOnly,
  onPendingOnlyChange,
  pendingOnlyLabel,
  onExport,
  exportLabel,
  searchTestId,
  pendingTestId,
  exportTestId,
}) => {
  return (
    <div className="fp-grid-toolbar">
      <label className="form-label fp-grid-toolbar__search" htmlFor={searchId}>
        <span>{searchLabel}</span>
        <input
          id={searchId}
          className="form-input"
          data-testid={searchTestId}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
        />
      </label>
      <label className="fp-grid-toolbar__check" htmlFor={`${searchId}-pending`}>
        <input
          id={`${searchId}-pending`}
          type="checkbox"
          data-testid={pendingTestId}
          checked={pendingOnly}
          onChange={(event) => onPendingOnlyChange(event.target.checked)}
        />
        <span>{pendingOnlyLabel}</span>
      </label>
      <button
        type="button"
        className="btn btn-secondary fp-grid-toolbar__export"
        data-testid={exportTestId}
        onClick={onExport}
      >
        <Download size={16} aria-hidden="true" />
        <span>{exportLabel}</span>
      </button>
    </div>
  );
};
