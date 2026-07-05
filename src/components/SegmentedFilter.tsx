'use client';

import { useEffect, useRef, useState } from 'react';
import { useFilterSubmit } from './AutoSubmitForm';

interface SegmentedFilterProps {
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
}

export function SegmentedFilter({ name, options, defaultValue = '' }: SegmentedFilterProps) {
  const { submitNow } = useFilterSubmit();
  const [value, setValue] = useState(defaultValue);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    submitNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex flex-wrap gap-1" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-1)' }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`tab-btn${value === o.value ? ' active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setValue(o.value)}
        >
          {o.label}
        </button>
      ))}
      {value && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
