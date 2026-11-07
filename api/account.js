import { api, json, sameOrigin, bodyJSON } from '../server/http.js';
import { sessionFor, withCookies } from '../server/auth.js';
import { getAccount, putAccount } from '../server/accounts.js';
import { flushSchedules } from '../server/push.js';
import { hasAdminAccess } from '../server/admin-access.js';

export const GET = api(async request => {
  const { user, cookies } = await sessionFor(request);
  const [account, admin] = await Promise.all([getAccount(user.id), hasAdminAccess(user)]);
  return withCookies(json({ user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified, admin }, ...account }), cookies);
});
export const PUT = api(async request => {
  sameOrigin(request);
  const { user, cookies } = await sessionFor(request);
  const revision = await putAccount(user.id, await bodyJSON(request));
  let scheduled = true;
  try { await flushSchedules(user.id); } catch { scheduled = false; console.error('Reminder queue publish pending'); }
  return withCookies(json({ revision, scheduled }), cookies);
});
