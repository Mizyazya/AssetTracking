'use client';
import { useActionState } from 'react';
import { login, type LoginState } from '@/lib/auth-actions';

const initialState: LoginState = {};

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="alert danger">{state.error}</div>
      )}
      <div className="field">
        <label htmlFor="username" className="field-label">Логін</label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          className="input"
        />
      </div>
      <div className="field">
        <label htmlFor="password" className="field-label">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>
      <button type="submit" disabled={pending} className="btn primary block">
        {pending ? 'Вхід…' : 'Увійти'}
      </button>
    </form>
  );
}
