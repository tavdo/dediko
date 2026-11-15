import { api,bodyJSON,json,sameOrigin,HttpError } from '../server/http.js';
import { sessionFor,withCookies } from '../server/auth.js';
import { createOffersService,offerActor } from '../server/offers-service.js';
export function createOffersHandler(service=createOffersService(),authenticate=sessionFor) {
  return api(async request=>{
    let cookies=[];
    if (request.method==='GET') {
      let userId=null;
      if (new URL(request.url).searchParams.get('member')==='1') {const session=await authenticate(request);userId=session.user.id;cookies=session.cookies;}
      const actor=offerActor(request,true),response=withCookies(json(await service.catalog(userId)),cookies);
      if (actor.setCookie) response.headers.append('Set-Cookie',actor.setCookie);return response;
    }
    if (request.method!=='POST') throw new HttpError(405,'მეთოდი მიუწვდომელია.');
    sameOrigin(request);const input=await bodyJSON(request,12000);
    if (input?.action==='event') {
      const {actor}=offerActor(request);let userId=null;
      if (request.headers.has('x-dediko-account')) {const session=await authenticate(request);userId=session.user.id;cookies=session.cookies;}
      return withCookies(json(await service.event(actor,input,userId)),cookies);
    }
    const session=await authenticate(request);
    return withCookies(json(await service.member(session.user.id,input)),session.cookies);
  });
}
const handler=createOffersHandler();export const GET=handler;export const POST=handler;
