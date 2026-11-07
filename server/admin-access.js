import { db } from './db.js';
import { HttpError } from './http.js';

export async function hasAdminAccess(user) {
  if (user?.emailVerified !== true) return false;
  const [result] = await db()`select exists (
    select 1 from dediko.admins where user_id = ${user.id}
  ) as allowed`;
  return result.allowed;
}

export async function requireAdmin(user) {
  if (await hasAdminAccess(user)) return;
  throw new HttpError(403, user.emailVerified
    ? 'ამ ანგარიშს მართვის პანელზე წვდომა არ აქვს.'
    : 'მართვის პანელისთვის დაადასტურე ელფოსტა Dediko-ს პროფილიდან.');
}
