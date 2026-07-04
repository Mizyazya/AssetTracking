'use server';

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { DB_PATH, BACKUP_DIR } from '@/db';
import { setFlash } from '@/lib/flash';

export async function backupDatabase(formData: FormData) {
  await requireAdmin();

  const returnTo = (formData.get('return_to') as string) || '/';

  try {
    const ts = new Date()
      .toISOString()
      .replace(/[-:T]/g, (m) => (m === 'T' ? '_' : m))
      .slice(0, 15); // YYYYMMDD_HHMMSS
    const dest = path.join(BACKUP_DIR, `assets_backup_${ts}.db`);
    fs.copyFileSync(DB_PATH, dest);
    await setFlash(`Резервну копію збережено: ${path.basename(dest)}`);
  } catch (err) {
    await setFlash(`Помилка резервної копії: ${String(err)}`, 'error');
  }

  redirect(returnTo);
}
