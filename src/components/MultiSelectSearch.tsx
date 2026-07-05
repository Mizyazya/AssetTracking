'use client';

import { useEffect, useRef, useState } from 'react';
import { useFilterSubmit } from './AutoSubmitForm';

export interface MultiSelectOption {
  id: number;
  label: string;
  extra?: string;
}

interface MultiSelectSearchProps {
  options: MultiSelectOption[];
  name: string;
  placeholder?: string;
  defaultSelectedIds?: number[];
}

export function MultiSelectSearch({ options, name, placeholder, defaultSelectedIds }: MultiSelectSearchProps) {
  const { submitNow } = useFilterSubmit();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>(defaultSelectedIds ?? []);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(-1);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    submitNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(o: MultiSelectOption) {
    setSelectedIds(prev => (prev.includes(o.id) ? prev.filter(id => id !== o.id) : [...prev, o.id]));
    setQuery('');
    setFocused(-1);
  }

  const selectedOptions = options.filter(o => selectedIds.includes(o.id));

  return (
    <div style={{ position: 'relative' }}>
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1" style={{ marginBottom: 'var(--space-2)' }}>
          {selectedOptions.map(o => (
            <span key={o.id} className="chip">
              {o.label}
              <button
                type="button"
                className="chip-remove"
                onClick={() => toggle(o)}
                aria-label={`Прибрати ${o.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        autoComplete="off"
        className="input"
        placeholder={placeholder ?? 'Пошук...'}
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (!open && e.key !== 'Escape') setOpen(true);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocused(f => Math.min(f + 1, filtered.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocused(f => Math.max(f - 1, 0));
          }
          if (e.key === 'Enter' && focused >= 0 && filtered[focused]) {
            e.preventDefault();
            toggle(filtered[focused]);
          }
          if (e.key === 'Escape') {
            setOpen(false);
            setFocused(-1);
          }
        }}
      />

      {selectedIds.map(id => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {open && filtered.length > 0 && (
        <div className="person-search-dropdown">
          {filtered.map((o, i) => {
            const isSelected = selectedIds.includes(o.id);
            return (
              <div
                key={o.id}
                className={`person-search-option${focused === i ? ' focused' : ''}${isSelected ? ' selected' : ''}`}
                onMouseDown={() => toggle(o)}
                onMouseEnter={() => setFocused(i)}
              >
                <span>{o.label}</span>
                <span className="flex items-center gap-2">
                  {o.extra && <span className="person-search-extra">{o.extra}</span>}
                  {isSelected && <span style={{ color: 'var(--primary)' }}>✓</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
