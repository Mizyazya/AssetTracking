'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { addAsset } from '@/lib/asset-actions';

export function AddAssetModal() {
  const [type, setType] = useState<'active' | 'component'>('active');

  return (
    <Modal triggerLabel="Додати майно" triggerClassName="btn primary" title="Додати майно">
      <form action={addAsset} className="space-y-4">
        <div className="field">
          <label className="field-label">Тип</label>
          <div className="flex flex-wrap gap-4">
            <label className="type-radio-label">
              <input
                type="radio" name="type" value="active"
                checked={type === 'active'}
                onChange={() => setType('active')}
              />
              <span>Активне майно</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                одиничний предмет
              </span>
            </label>
            <label className="type-radio-label">
              <input
                type="radio" name="type" value="component"
                checked={type === 'component'}
                onChange={() => setType('component')}
              />
              <span>Компонент</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-subtle)' }}>
                кількісний облік
              </span>
            </label>
          </div>
        </div>

        <div className="field">
          <label className="field-label">
            Назва <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            name="name" type="text" required className="input"
            placeholder={type === 'active' ? 'Ноутбук Dell E6440' : 'Мишка бездротова'}
          />
        </div>

        <div className="field">
          <label className="field-label">Серійний номер</label>
          <input
            name="serial" type="text" className="input"
            placeholder={type === 'component' ? 'Необов\'язково — авто якщо порожньо' : 'SN-12345'}
          />
        </div>

        {type === 'component' && (
          <div className="field">
            <label className="field-label">
              Кількість <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input name="quantity" type="number" min="1" defaultValue="1" required className="input" />
          </div>
        )}

        <div className="field">
          <label className="field-label">Коментар</label>
          <textarea name="comments" rows={2} className="input" />
        </div>

        <button type="submit" className="btn primary block">Додати</button>
      </form>
    </Modal>
  );
}
