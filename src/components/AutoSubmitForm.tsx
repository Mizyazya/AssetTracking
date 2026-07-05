'use client';
import { useRef, useEffect } from 'react';

export function AutoSubmitForm({
  children,
  delay = 350,
  ...props
}: React.ComponentProps<'form'> & { delay?: number }) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout>;

    function handle(e: Event) {
      const t = e.target as HTMLElement;
      clearTimeout(timer);
      if (t.tagName === 'SELECT') {
        form!.requestSubmit();
      } else {
        timer = setTimeout(() => form!.requestSubmit(), delay);
      }
    }

    form.addEventListener('change', handle);
    form.addEventListener('input', handle);
    return () => {
      form.removeEventListener('change', handle);
      form.removeEventListener('input', handle);
      clearTimeout(timer);
    };
  }, [delay]);

  return (
    <form ref={ref} {...props}>
      {children}
    </form>
  );
}
