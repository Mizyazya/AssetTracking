'use client';

import { useState, useRef } from 'react';

export interface PersonOption {
  id: number;
  name: string;
  extra?: string;
}

interface PersonSearchProps {
  persons: PersonOption[];
  name: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: number;
}

export function PersonSearch({ persons, name, placeholder, required, defaultValue }: PersonSearchProps) {
  const defaultPerson = defaultValue != null ? persons.find(p => p.id === defaultValue) : null;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PersonOption | null>(defaultPerson ?? null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? persons.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    : persons;

  function select(p: PersonOption) {
    setSelected(p);
    setQuery('');
    setOpen(false);
    setFocused(-1);
  }

  function clear() {
    setSelected(null);
    setQuery('');
    setFocused(-1);
  }

  const displayValue = selected ? selected.name : query;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        autoComplete="off"
        className="input"
        placeholder={placeholder ?? 'Пошук особи...'}
        value={displayValue}
        onChange={e => { clear(); setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (!open && e.key !== 'Escape') setOpen(true);
          if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
          if (e.key === 'Enter' && focused >= 0 && filtered[focused]) {
            e.preventDefault();
            select(filtered[focused]);
          }
          if (e.key === 'Escape') { setOpen(false); setFocused(-1); }
        }}
      />
      <input type="hidden" name={name} value={selected?.id ?? ''} required={required} />

      {open && filtered.length > 0 && (
        <div className="person-search-dropdown">
          {filtered.map((p, i) => (
            <div
              key={p.id}
              className={`person-search-option${focused === i ? ' focused' : ''}`}
              onMouseDown={() => select(p)}
              onMouseEnter={() => setFocused(i)}
            >
              <span>{p.name}</span>
              {p.extra && (
                <span className="person-search-extra">{p.extra}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
