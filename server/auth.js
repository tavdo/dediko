import { createAuthServer, extractNeonAuthCookies, serializeSetCookie, handleAuthProxyRequest } from '@neondatabase/auth/server';
import { HttpError, sameOrigin, bodyJSON } from './http.js';

function config() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.AUTH_COOKIE_SECRET) throw new HttpError(503, 'ანგარიშების სერვისი ჯერ მზად არ არის.');
  return { baseUrl: process.env.NEON_AUTH_BASE_URL, cookieSecret: process.env.AUTH_COOKIE_SECRET, sessionDataTtl: 60, sameSite: 'lax' };
}
export async function sessionFor(request) {
  const cookies = [];
  const auth = createAuthServer({ ...config(), context: () => ({
    getCookies: () => extractNeonAuthCookies(request.headers.get('cookie') || ''),
    setCookie: (name, value, options) => cookies.push(serializeSetCookie({ name, value, ...options })),
    getHeader: name => name.startsWith('x-neon-') ? null : request.headers.get(name),
    getOrigin: () => process.env.APP_ORIGIN || new URL(request.url).origin,
    getFramework: () => 'dediko-web'
  }) });
  // Check upstream on every protected request, including after sign-out/revocation.
  const result = await auth.getSession({ query: { disableCookieCache: 'true' } });
  if (result.error) throw new HttpError(503, 'ანგარიშის შემოწმება ვერ მოხერხდა.');
  if (!result.data?.user?.id) throw new HttpError(401, 'გთხოვ, შედი შენს ანგარიშში.');
  const expected = request.headers.get('x-dediko-account');
  if ((expected && expected !== result.data.user.id) || (request.method !== 'GET' && expected !== result.data.user.id)) throw new HttpError(401, 'ამ ბრაუზერში ანგარიში შეიცვალა. ხელახლა შედი შენს ანგარიშში.');
  return { user: result.data.user, cookies };
}
export function withCookies(response, cookies) {
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie);
  return response;
}
// Only email/password flows are exposed. No admin or arbitrary upstream proxy.
const routes = new Map([
  ['get-session', 'GET'], ['sign-up/email', 'POST'], ['sign-in/email', 'POST'], ['sign-out', 'POST'],
  ['request-password-reset', 'POST'], ['reset-password', 'POST'],
  ['email-otp/send-verification-otp', 'POST'], ['email-otp/verify-email', 'POST']
]);
export async function proxyAuth(request) {
  const url = new URL(request.url);
  const path = url.pathname.startsWith('/api/auth/') ? url.pathname.slice(10) : url.searchParams.get('path');
  if (routes.get(path) !== request.method) throw new HttpError(404, 'მისამართი ვერ მოიძებნა.');
  if (request.method === 'POST') {
    sameOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > 16000) throw new HttpError(413, 'მოთხოვნა ძალიან დიდია.');
  }
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith('x-neon-')) headers.delete(name);
  let body;
  if (request.method === 'POST') {
    const input = await bodyJSON(request, 16000);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'არასწორი მოთხოვნა.');
    const password = path === 'reset-password' ? input.newPassword : path === 'sign-up/email' ? input.password : null;
    if (password !== null && (typeof password !== 'string' || password.length < 12 || password.length > 128)) throw new HttpError(400, 'პაროლი 12–128 სიმბოლოს უნდა შეიცავდეს.');
    body = JSON.stringify(input); headers.delete('content-length');
  }
  const clean = new Request(request, { headers, ...(body ? { body } : {}) });
  const response = await handleAuthProxyRequest({ ...config(), request: clean, path });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
