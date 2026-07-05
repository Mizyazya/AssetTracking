'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type FilterSubmitContextValue = {
  submitNow: () => void;
  submitDebounced: () => void;
};

const FilterSubmitContext = createContext<FilterSubmitContextValue | null>(null);

export function useFilterSubmit(): FilterSubmitContextValue {
  const ctx = useContext(FilterSubmitContext);
  if (!ctx) throw new Error('useFilterSubmit must be used inside an AutoSubmitForm');
  return ctx;
}

export function AutoSubmitForm({
  children,
  delay = 350,
  action,
  ...props
}: React.ComponentProps<'form'> & { delay?: number }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const submitNow = useCallback(() => {
    const form = ref.current;
    if (!form) return;
    clearTimeout(timerRef.current);
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string' && v !== '') params.append(k, v);
    }
    const target = typeof action === 'string' && action ? action : pathname;
    const qs = params.toString();
    router.replace(qs ? `${target}?${qs}` : target, { scroll: false });
  }, [router, pathname, action]);

  const submitDebounced = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(submitNow, delay);
  }, [submitNow, delay]);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    function handle(e: Event) {
      const t = e.target as HTMLElement;
      if (t.tagName === 'SELECT') submitNow();
      else submitDebounced();
    }

    form.addEventListener('change', handle);
    form.addEventListener('input', handle);
    return () => {
      form.removeEventListener('change', handle);
      form.removeEventListener('input', handle);
      clearTimeout(timerRef.current);
    };
  }, [submitNow, submitDebounced]);

  return (
    <FilterSubmitContext.Provider value={{ submitNow, submitDebounced }}>
      <form
        ref={ref}
        {...props}
        onSubmit={e => {
          e.preventDefault();
          submitNow();
        }}
      >
        {children}
      </form>
    </FilterSubmitContext.Provider>
  );
}
