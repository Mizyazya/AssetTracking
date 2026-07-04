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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Вхід</h1>
        {terminated && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            Сесію завершено адміністратором або з іншого пристрою.
          </p>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
