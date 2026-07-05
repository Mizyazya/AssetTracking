'use client';

import { useState } from 'react';
import { PersonSearch, type PersonOption } from './PersonSearch';
import { assignAsset, returnAsset, addSupply } from '@/lib/asset-actions';

type Tab = 'issue' | 'return' | 'transfer' | 'supply';

interface ComponentActionsProps {
  assetId: number;
  stockQty: number;
  allPersons: PersonOption[];
  holders: PersonOption[];
}

export function ComponentActions({ assetId, stockQty, allPersons, holders }: ComponentActionsProps) {
  const hasStock = stockQty > 0;
  const hasHolders = holders.length > 0;

  const defaultTab: Tab = hasStock ? 'issue' : hasHolders ? 'return' : 'supply';
  const [tab, setTab] = useState<Tab>(defaultTab);

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'issue', label: 'Видати зі складу', show: true },
    { key: 'return', label: 'Повернути від особи', show: hasHolders },
    { key: 'transfer', label: 'Передати між особами', show: hasHolders },
    { key: 'supply', label: 'Поставка на склад', show: true },
  ];

  return (
    <section className="card space-y-4">
      <div className="tab-row">
        {tabs.filter(t => t.show).map(t => (
          <button
            key={t.key}
            type="button"
            className={`tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'issue' && (
        <form action={assignAsset} className="space-y-3">
          <input type="hidden" name="asset_id" value={assetId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="field-label">Кому</label>
              <PersonSearch persons={allPersons} name="person_id" required placeholder="Пошук особи..." />
            </div>
            <div className="field">
              <label className="field-label">
                Кількість
                <span className="ml-1" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                  (склад: {stockQty})
                </span>
              </label>
              <input name="quantity" type="number" min="1" max={stockQty} defaultValue="1" className="input" disabled={!hasStock} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Коментар</label>
            <input name="comment" type="text" placeholder="Необов'язково" className="input" />
          </div>
          <button type="submit" className="btn primary sm" disabled={!hasStock}>
            {hasStock ? 'Видати' : 'Немає на складі'}
          </button>
        </form>
      )}

      {tab === 'return' && (
        <form action={returnAsset} className="space-y-3">
          <input type="hidden" name="asset_id" value={assetId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="field-label">Від кого</label>
              <PersonSearch persons={holders} name="person_id" required placeholder="Вибрати держателя..." />
            </div>
            <div className="field">
              <label className="field-label">Кількість</label>
              <input name="quantity" type="number" min="1" defaultValue="1" className="input" />
            </div>
          </div>
          <button type="submit" className="btn secondary sm">Повернути на склад</button>
        </form>
      )}

      {tab === 'transfer' && (
        <form action={assignAsset} className="space-y-3">
          <input type="hidden" name="asset_id" value={assetId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="field-label">Від кого</label>
              <PersonSearch persons={holders} name="from_person_id" required placeholder="Вибрати держателя..." />
            </div>
            <div className="field">
              <label className="field-label">Кому</label>
              <PersonSearch persons={allPersons} name="person_id" required placeholder="Пошук особи..." />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Кількість</label>
            <input name="quantity" type="number" min="1" defaultValue="1" className="input" />
          </div>
          <button type="submit" className="btn primary sm">Передати</button>
        </form>
      )}

      {tab === 'supply' && (
        <form action={addSupply} className="space-y-3">
          <input type="hidden" name="asset_id" value={assetId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="field-label">Кількість</label>
              <input name="quantity" type="number" min="1" defaultValue="1" className="input" />
            </div>
            <div className="field">
              <label className="field-label">Коментар</label>
              <input name="comment" type="text" placeholder="Поставка" className="input" />
            </div>
          </div>
          <button type="submit" className="btn secondary sm">Додати на склад</button>
        </form>
      )}
    </section>
  );
}
