export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'მოთხოვნა ამ საიტიდან უნდა გაიგზავნოს.');
}
export async function bodyJSON(request, limit = 160000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'საჭიროა JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'ცარიელი მოთხოვნა.');
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, 'მონაცემები ძალიან დიდია.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'მონაცემები ვერ წაიკითხა.'); }
}
export function api(handler) {
  return async request => {
    try { return await handler(request); }
    catch (error) {
      if (!error.status) console.error('Dediko API failed', { name: error.name, code: error.code });
      return json({ error: error.status ? error.message : 'სერვერთან კავშირი ვერ მოხერხდა. სცადე ხელახლა.' }, error.status || 503);
    }
  };
}
