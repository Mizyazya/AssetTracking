import { redirect } from 'next/navigation';
import { ensureBootstrapUser, getCurrentUser } from '@/lib/session';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  await ensureBootstrapUser();

  const currentUser = await getCurrentUser();
  if (currentUser) redirect('/');

  const params = await searchParams;
  const terminated = params.reason === 'terminated';

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm card padded space-y-6">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: 'var(--tracking-tight)' }}>Вхід</h1>
        {terminated && (
          <div className="alert danger">
            Сесію завершено адміністратором або з іншого пристрою.
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
