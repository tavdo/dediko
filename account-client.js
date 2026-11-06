import { createAuthClient } from '@neondatabase/auth';

export const auth = createAuthClient(`${location.origin}/api/auth`);
let expectedOwner = null;
export const setAccountOwner = userId => { expectedOwner = userId; };
export async function accountRequest(path, method = 'GET', body) {
  let response;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
  try { response = await fetch(`/api/${path}`, { method, signal:controller.signal, credentials: 'same-origin', cache: 'no-store', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(expectedOwner ? { 'X-Dediko-Account':expectedOwner } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new Error('ინტერნეტთან კავშირი ვერ მოხერხდა. ცვლილებები ჯერ ანგარიშში არ შენახულა.'); }
  finally { clearTimeout(timeout); }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'მოთხოვნა ვერ შესრულდა.'), { status: response.status });
  return result;
}
const messages = {
  INVALID_EMAIL_OR_PASSWORD: 'ელფოსტა ან პაროლი არასწორია.',
  USER_ALREADY_EXISTS: 'ეს ელფოსტა უკვე რეგისტრირებულია. სცადე შესვლა.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'ეს ელფოსტა უკვე რეგისტრირებულია. სცადე შესვლა.',
  PASSWORD_TOO_SHORT: 'პაროლი მინიმუმ 12 სიმბოლოს უნდა შეიცავდეს.',
  EMAIL_NOT_VERIFIED: 'გთხოვ, ელფოსტა კოდით დაადასტურე.',
  INVALID_OTP: 'კოდი არასწორია ან ვადაგასულია.',
  TOO_MANY_REQUESTS: 'ძალიან ბევრი მცდელობაა. ცოტა ხანში სცადე.',
  INVALID_ORIGIN: 'ანგარიშების სერვისში საიტის მისამართი დასამატებელია.'
};
export async function authCall(method, values) {
  const fn = method.split('.').reduce((current, key) => current[key], auth);
  const result = await fn(values);
  if (result.error) throw new Error(messages[result.error.code] || 'მოქმედება ვერ შესრულდა. გადაამოწმე მონაცემები და სცადე ხელახლა.');
  if (['signUp.email','signIn.email','signOut'].includes(method)) expectedOwner = null;
  return result.data;
}
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tbilisi';

export function pushSupport() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (ios && !standalone) return 'iphone-install';
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'supported' : 'unsupported';
}
let worker;
export async function serviceWorkerReady() {
  if (!worker) worker = navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
  return worker;
}
export async function currentSubscription() {
  if (pushSupport() !== 'supported') return null;
  return (await serviceWorkerReady()).pushManager.getSubscription();
}
export async function enablePush(publicKey) {
  // Permission request runs directly inside the user's button gesture (iOS requirement).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('შეტყობინებების ნებართვა არ არის ჩართული. შეცვალე ბრაუზერის პარამეტრებში.');
  const registration = await serviceWorkerReady();
  const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(publicKey.length / 4) * 4, '=')), c => c.charCodeAt(0));
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  try { return { subscription, ...await accountRequest('push', 'POST', { action: 'subscribe', subscription: subscription.toJSON() }) }; }
  catch (error) { await subscription.unsubscribe(); throw error; }
}
export async function disablePush() {
  const subscription = await currentSubscription();
  if (subscription) {
    await accountRequest('push', 'POST', { action: 'unsubscribe', endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
}
