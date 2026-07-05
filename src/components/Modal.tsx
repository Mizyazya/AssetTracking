'use client';

import { useRef } from 'react';

interface ModalProps {
  triggerLabel: React.ReactNode;
  triggerClassName?: string;
  title: string;
  children: React.ReactNode;
}

export function Modal({ triggerLabel, triggerClassName = 'btn primary', title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog
        ref={ref}
        onClick={e => { if (e.target === ref.current) ref.current?.close(); }}
        className="modal-dialog"
      >
        <div className="modal-inner">
          <div className="modal-header">
            <span className="modal-title">{title}</span>
            <button type="button" className="btn ghost sm modal-close" onClick={() => ref.current?.close()}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            {children}
          </div>
        </div>
      </dialog>
    </>
  );
}
