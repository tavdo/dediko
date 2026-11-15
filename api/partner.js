import {api,bodyJSON,json,sameOrigin,HttpError} from '../server/http.js';
import {sessionFor,withCookies} from '../server/auth.js';
import {createOffersService} from '../server/offers-service.js';
export function createPartnerHandler(service=createOffersService(),authenticate=sessionFor) {
  return api(async request=>{
    if (!['GET','POST'].includes(request.method)) throw new HttpError(405,'მეთოდი მიუწვდომელია.');
    if (request.method==='POST') sameOrigin(request);
    const {user,cookies}=await authenticate(request);
    const result=request.method==='GET'?await service.partnerData(user.id):await service.partnerWrite(user,await bodyJSON(request,18000));
    return withCookies(json(result),cookies);
  });
}
const handler=createPartnerHandler();export const GET=handler;export const POST=handler;
