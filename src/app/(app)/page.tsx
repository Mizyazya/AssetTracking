import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { user } = await requireUser();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-gray-900">
        Ласкаво просимо, {user.username}
      </h1>
      <p className="text-gray-600">Модулі переносяться.</p>
    </div>
  );
}
