import { randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { HttpError } from './http.js';
import { demoOffers, safeOfferURL, validateOffer, validatePreferences } from '../offers.js';

export function offerId(id) {
  if (typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400,'შეთავაზების ნომერი არასწორია.');
  return id;
}
const fail = message => {throw new HttpError(400,message);};
export function offerActor(request, mint=false) {
  const secret=process.env.AUTH_COOKIE_SECRET;
  if (!secret) throw new HttpError(503,'შეთავაზებების სერვისი ჯერ მზად არ არის.');
  const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
  const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('dediko.offers='))?.slice(14) || '';
  let [nonce,signature]=cookie.split('.');
  const expected=typeof nonce==='string' && /^[0-9a-f-]{36}$/.test(nonce)?sign(nonce):'';
  const valid=signature && /^[A-Za-z0-9_-]{43}$/.test(signature) && expected && signature.length===expected.length && timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
  let setCookie;
  if (!valid) {
    if (!mint) throw new HttpError(403,'განაახლე შეთავაზებების გვერდი და სცადე ხელახლა.');
    nonce=randomUUID(); signature=sign(nonce);
    setCookie=`dediko.offers=${nonce}.${signature}; Path=/api/offers; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol==='https:'?'; Secure':''}`;
  }
  return {actor:sign(`${nonce}:${new Date().toISOString().slice(0,10)}`),setCookie};
}
export function publicOffer(row,pro=false) {
  const content=row.content, locked=content.pro && !pro;
  return {id:row.id,...content,partner:row.partner,featured:row.featured,sponsored:row.sponsored,locked,
    code:locked?null:content.code,url:locked?null:content.url,revision:row.revision};
}
function cents(value,max=10000000) {
  const n=Number(value);if (!Number.isFinite(n)||n<0||n>max||Math.abs(n*100-Math.round(n*100))>.00001) fail('თანხა მიუთითე ლარებში, მაქსიმუმ ორი ათწილადით.');
  return Math.round(n*100);
}
export function createOffersService(sql) {
  const query=()=>sql||db();
  async function entitlement(userId) {
    if (!userId) return false;
    const [row]=await query()`select exists(select 1 from dediko.offer_entitlements where user_id=${userId} and expires_at>now()) as active`;
    return row.active;
  }
  async function active(id) {
    offerId(id);
    const [row]=await query()`select o.*,p.name as partner from dediko.offers o join dediko.partners p on p.id=o.partner_id
      where o.id=${id} and o.status='approved' and p.status='approved' and o.starts_at<=now() and o.ends_at>now()`;
    if (!row) throw new HttpError(404,'შეთავაზება დასრულდა ან აღარ არის ხელმისაწვდომი.');
    return row;
  }
  async function catalog(userId=null) {
    const [rows,pro,saved,prefs]=await Promise.all([
      query()`select o.id,o.content,o.featured,o.sponsored,o.revision,p.name as partner from dediko.offers o join dediko.partners p on p.id=o.partner_id
        where o.status='approved' and p.status='approved' and o.starts_at<=now() and o.ends_at>now()
        order by o.featured desc,o.published_at desc,o.id limit 300`,
      entitlement(userId),
      userId?query()`select offer_id from dediko.offer_saved where user_id=${userId}`:[],
      userId?query()`select enabled,categories,stage,city from dediko.offer_preferences where user_id=${userId}`:[]
    ]);
    return {offers:rows.map(row=>publicOffer(row,pro)),saved:saved.map(x=>x.offer_id),pro,
      preferences:prefs[0]||{enabled:false,categories:[],stage:'all',city:''}};
  }
  async function member(userId,input) {
    if (input?.action==='save') {
      offerId(input.id); if (typeof input.saved!=='boolean') fail('შენახვის მოთხოვნა არასწორია.');
      if (input.saved) {
        if (!demoOffers.some(x=>x.id===input.id)) await active(input.id);
        await query()`insert into dediko.offer_preferences(user_id) values(${userId}) on conflict do nothing`;
        const results=await query().transaction([
          query()`select user_id from dediko.offer_preferences where user_id=${userId} for update`,
          query()`insert into dediko.offer_saved(user_id,offer_id) select ${userId},${input.id}::uuid
            where (select count(*) from dediko.offer_saved where user_id=${userId})<500
              or exists(select 1 from dediko.offer_saved where user_id=${userId} and offer_id=${input.id}::uuid)
            on conflict(user_id,offer_id) do update set offer_id=excluded.offer_id returning offer_id`
        ]);
        if (!results[1].length) throw new HttpError(409,'შენახულია 500 შეთავაზება. ჯერ წაშალე რომელიმე.');
      } else await query()`delete from dediko.offer_saved where user_id=${userId} and offer_id=${input.id}::uuid`;
      return {saved:input.saved};
    }
    if (input?.action==='preferences') {
      const result=validatePreferences(input);if (result.error) fail(result.error);const p=result.value;
      if (p.enabled) {
        const [device]=await query()`select exists(select 1 from dediko.push_subscriptions where user_id=${userId}) as connected`;
        if (!device.connected) fail('ჯერ ჩართე მოწყობილობის შეტყობინებები პროფილიდან.');
      }
      await query()`insert into dediko.offer_preferences(user_id,enabled,categories,stage,city)
        values(${userId},${p.enabled},${JSON.stringify(p.categories)}::jsonb,${p.stage},${p.city})
        on conflict(user_id) do update set enabled=excluded.enabled,categories=excluded.categories,stage=excluded.stage,city=excluded.city,
          enabled_at=now(),last_notified=now(),digest_key=null,digest_cutoff=null,queued_at=null`;
      return {preferences:p};
    }
    fail('მოქმედება არასწორია.');
  }
  async function event(actor,input,userId=null) {
    offerId(input?.id);if (!['view','click','copy'].includes(input.kind)) fail('მოვლენა არასწორია.');
    if (demoOffers.some(x=>x.id===input.id)) return {demo:true};
    const row=await active(input.id);
    if (input.kind!=='view' && row.content.pro && !await entitlement(userId)) throw new HttpError(403,'ეს კოდი დადასტურებული Pro წვდომისთვისაა.');
    if (input.kind==='copy'&&!row.content.code) fail('ამ შეთავაზებას პრომოკოდი არ აქვს.');
    const [record]=await query()`insert into dediko.offer_events(id,offer_id,kind,actor,commission_bps)
      select ${randomUUID()},${input.id}::uuid,${input.kind},${actor},${row.commission_bps}
      where (select count(*) from dediko.offer_events where actor=${actor} and day=current_date)<500
        or exists(select 1 from dediko.offer_events where offer_id=${input.id}::uuid and kind=${input.kind} and actor=${actor} and day=current_date)
      on conflict(offer_id,kind,actor,day) do update set offer_id=excluded.offer_id returning id`;
    if (!record) throw new HttpError(429,'დღიური ლიმიტი ამოიწურა.');
    if (input.kind==='view') return {ok:true};
    if (input.kind==='copy') return {code:row.content.code};
    const url=new URL(row.content.url);url.searchParams.set('utm_source','dediko');url.searchParams.set('utm_medium','partner_offer');url.searchParams.set('dediko_ref',record.id);
    return {url:url.href,reference:record.id};
  }
  async function partnerFor(userId,approved=false) {
    const [partner]=await query()`select * from dediko.partners where user_id=${userId}`;
    if (!partner || approved&&partner.status!=='approved') throw new HttpError(403,'პარტნიორის დამტკიცებული ანგარიშია საჭირო.');
    return partner;
  }
  async function partnerData(userId) {
    const [partner]=await query()`select id,name,website,contact,description,status,note from dediko.partners where user_id=${userId}`;
    if (!partner) return {partner:null,offers:[],sales:[],charges:[]};
    const [offers,sales,charges]=await Promise.all([
      query()`select o.*,
        (select count(*)::integer from dediko.offer_events e where e.offer_id=o.id and kind='view') as views,
        (select count(*)::integer from dediko.offer_events e where e.offer_id=o.id and kind='click') as clicks,
        (select count(*)::integer from dediko.offer_events e where e.offer_id=o.id and kind='copy') as copies
        from dediko.offers o where partner_id=${partner.id} order by created_at desc limit 100`,
      query()`select s.id,s.offer_id,s.amount,s.commission,s.status,s.note,s.created_at,o.content->>'title' as title
        from dediko.offer_sales s join dediko.offers o on o.id=s.offer_id where s.partner_id=${partner.id} order by s.created_at desc limit 200`,
      query()`select id,offer_id,amount,description,status,receipt,created_at from dediko.offer_charges where partner_id=${partner.id} order by created_at desc limit 200`
    ]);
    // Never expose click actors, account identifiers or customer data to partners.
    return {partner,offers:offers.map(({partner_id,...offer})=>offer),sales,charges};
  }
  async function partnerWrite(user,input) {
    if (!input || typeof input!=='object') fail('მოთხოვნა არასწორია.');
    if (user.emailVerified!==true) throw new HttpError(403,'პარტნიორის კაბინეტისთვის დაადასტურე ელფოსტა პროფილიდან.');
    if (input.action==='apply') {
      const {name,contact,description,website}=input;
      if (typeof name!=='string'||name.trim().length<2||name.length>100||typeof contact!=='string'||contact.trim().length<5||contact.length>160||typeof description!=='string'||description.length>800||!safeOfferURL(website)) fail('შეავსე კომპანიის სახელი, საკონტაქტო ინფორმაცია და სწორი საიტის ბმული.');
      const rows=await query()`insert into dediko.partners(id,user_id,name,website,contact,description)
        values(${randomUUID()},${user.id},${name.trim()},${safeOfferURL(website)},${contact.trim()},${description.trim()})
        on conflict(user_id) do update set name=excluded.name,website=excluded.website,contact=excluded.contact,description=excluded.description,
          status=case when partners.status='suspended' then 'suspended' else 'pending' end returning id`;
      return {id:rows[0].id};
    }
    const partner=await partnerFor(user.id,true);
    if (input.action==='offer') {
      const result=validateOffer(input);if (result.error) fail(result.error);const content=result.value;
      if (input.id) {
        offerId(input.id);if (!Number.isSafeInteger(input.revision)) fail('შეთავაზების ვერსია არასწორია.');
        const rows=await query()`update dediko.offers set content=${JSON.stringify(content)}::jsonb,status=${input.submit?'pending':'draft'},revision=revision+1,
          starts_at=${content.start}::timestamptz,ends_at=${content.end}::timestamptz,featured=false,sponsored=false,updated_at=now(),review_note=''
          where id=${input.id}::uuid and partner_id=${partner.id} and revision=${input.revision} returning id`;
        if (!rows.length) throw new HttpError(409,'შეთავაზება შეიცვალა ან ამ პარტნიორს არ ეკუთვნის. განაახლე გვერდი.');
      } else {
        const rows=await query()`insert into dediko.offers(id,partner_id,content,status,starts_at,ends_at)
          select ${randomUUID()},${partner.id},${JSON.stringify(content)}::jsonb,${input.submit?'pending':'draft'},${content.start}::timestamptz,${content.end}::timestamptz
          where (select count(*) from dediko.offers where partner_id=${partner.id})<100 returning id`;
        if (!rows.length) throw new HttpError(409,'შეთავაზებების ლიმიტი შევსებულია.');
      }
      return {ok:true};
    }
    if (input.action==='pause') {
      offerId(input.id);
      const rows=await query()`update dediko.offers set status='paused',revision=revision+1,updated_at=now() where id=${input.id}::uuid and partner_id=${partner.id} returning id`;
      if (!rows.length) throw new HttpError(404,'შეთავაზება ვერ მოიძებნა.');return {ok:true};
    }
    if (input.action==='sale') {
      const clickId=offerId(input.reference);
      if (typeof input.order!=='string'||input.order.trim().length<2||input.order.length>100) fail('მიუთითე შეკვეთის ნომერი; მომხმარებლის მონაცემები არ ჩაწერო.');
      const amount=cents(input.amount);if (!amount) fail('შეკვეთის თანხა ნულზე მეტი უნდა იყოს.');
      const hash=createHash('sha256').update(input.order.trim()).digest('hex');
      const rows=await query()`insert into dediko.offer_sales(id,partner_id,offer_id,click_id,order_hash,amount,commission)
        select ${randomUUID()},${partner.id},e.offer_id,e.id,${hash},${amount},round(${amount}*e.commission_bps/10000.0)::integer
        from dediko.offer_events e join dediko.offers o on o.id=e.offer_id
        where e.id=${clickId}::uuid and e.kind='click' and o.partner_id=${partner.id} and e.created_at>now()-interval '30 days'
        on conflict(partner_id,order_hash) do nothing returning id`;
      if (!rows.length) throw new HttpError(409,'რეფერენსი არასწორია, 30 დღე გავიდა ან შეკვეთა უკვე აღრიცხულია.');
      return {ok:true};
    }
    fail('მოქმედება არასწორია.');
  }
  async function adminData() {
    const [partners,offers,sales,charges,entitlements]=await Promise.all([
      query()`select id,name,website,contact,description,status,note from dediko.partners order by created_at desc limit 200`,
      query()`select o.*,p.name as partner from dediko.offers o join dediko.partners p on p.id=o.partner_id order by o.updated_at desc limit 300`,
      query()`select s.id,s.amount,s.commission,s.status,s.note,s.created_at,p.name as partner,o.content->>'title' as title from dediko.offer_sales s
        join dediko.partners p on p.id=s.partner_id join dediko.offers o on o.id=s.offer_id order by s.created_at desc limit 300`,
      query()`select c.*,p.name as partner from dediko.offer_charges c join dediko.partners p on p.id=c.partner_id order by c.created_at desc limit 300`,
      query()`select e.user_id,u.email,e.expires_at,e.note from dediko.offer_entitlements e join neon_auth."user" u on u.id::text=e.user_id order by e.expires_at desc limit 100`
    ]);return {partners,offers,sales,charges,entitlements};
  }
  async function adminWrite(adminId,input) {
    if (!input||typeof input!=='object') fail('მოთხოვნა არასწორია.');
    const note=typeof input.note==='string'?input.note.trim():'';if (note.length>800) fail('შენიშვნა ძალიან გრძელია.');
    if (input.action==='create-partner') {
      const email=String(input.email||'').trim().toLowerCase();
      const [user]=await query()`select id,"emailVerified" from neon_auth."user" where lower(email)=${email}`;
      if (!user?.emailVerified) fail('ჯერ საჭიროა პარტნიორის დადასტურებული ანგარიში Dediko-ში.');
      const [exists]=await query()`select id from dediko.partners where user_id=${user.id}`;
      if (exists) throw new HttpError(409,'ამ ანგარიშს უკვე აქვს პარტნიორის განაცხადი.');
      return partnerWrite(user,{...input,action:'apply'});
    }
    if (input.action==='admin-offer') {
      const id=offerId(input.partnerId);
      const [partner]=await query()`select user_id from dediko.partners where id=${id}::uuid and status='approved'`;
      if (!partner) fail('აირჩიე დამტკიცებული პარტნიორი.');
      return partnerWrite({id:partner.user_id,emailVerified:true},{...input,action:'offer'});
    }
    if (input.action==='entitlement') {
      const expiry=Date.parse(input.expires),email=String(input.email||'').trim().toLowerCase();
      if (!email||email.length>254||!note||!Number.isFinite(expiry)||expiry>Date.now()+366*86400000) fail('მიუთითე ანგარიშის ელფოსტა, ვადა და მინიჭების საფუძველი.');
      const rows=await query()`insert into dediko.offer_entitlements(user_id,expires_at,note,granted_by)
        select id::text,${new Date(expiry).toISOString()}::timestamptz,${note},${adminId} from neon_auth."user" where lower(email)=${email} and "emailVerified"=true
        on conflict(user_id) do update set expires_at=excluded.expires_at,note=excluded.note,granted_by=excluded.granted_by returning user_id`;
      if (!rows.length) fail('ამ ელფოსტაზე დადასტურებული ანგარიში ვერ მოიძებნა.');return {ok:true};
    }
    const id=offerId(input.id);
    if (input.action==='partner') {
      if (!['approved','pending','suspended'].includes(input.status)) fail('სტატუსი არასწორია.');
      const rows=await query()`update dediko.partners set status=${input.status},note=${note} where id=${id}::uuid returning id`;
      if (!rows.length) throw new HttpError(404,'პარტნიორი ვერ მოიძებნა.');return {ok:true};
    }
    if (input.action==='moderate') {
      if (!['approved','rejected','paused'].includes(input.status)||!Number.isSafeInteger(input.revision)||typeof input.featured!=='boolean'||typeof input.sponsored!=='boolean') fail('გადაამოწმე შეთავაზების სტატუსი და ვერსია.');
      const fee=cents(input.fee||0),extra=cents(input.featuredFee||0),rate=Number(input.commission||0);
      if (!Number.isFinite(rate)||rate<0||rate>50||Math.abs(rate*100-Math.round(rate*100))>.00001) fail('საკომისიო მიუთითე 0–50%-ის ფარგლებში.');
      if (extra>0 && !input.featured) fail('გამორჩეული პოზიციის საფასურისთვის ჩართე გამორჩეული პოზიცია.');
      const rows=await query()`with updated as (
        update dediko.offers o set status=${input.status},featured=${input.featured},sponsored=${input.sponsored||fee+extra>0||rate>0},commission_bps=${Math.round(rate*100)},
          review_note=${note},published_at=case when ${input.status}='approved' then now() else published_at end,updated_at=now()
          where o.id=${id}::uuid and revision=${input.revision} and (${input.status}<>'approved' or (o.ends_at>now() and exists(select 1 from dediko.partners p where p.id=o.partner_id and p.status='approved')))
          returning id,partner_id,revision
        ), charged as (
        insert into dediko.offer_charges(id,partner_id,offer_id,revision,amount,description)
          select ${randomUUID()},partner_id,id,revision,${fee+extra},${`განთავსება: ${fee/100} ₾ · გამორჩეული პოზიცია: ${extra/100} ₾`}
          from updated where ${input.status}='approved' and ${fee+extra}>0
          on conflict(offer_id,revision) do nothing returning id
        ) select id from updated`;
      if (!rows.length) throw new HttpError(409,'ვერსია შეიცვალა, პარტნიორი არ არის დამტკიცებული ან ვადა დასრულდა.');return {ok:true};
    }
    if (input.action==='sale') {
      if (!['confirmed','rejected','paid'].includes(input.status)) fail('შეკვეთის სტატუსი არასწორია.');
      const rows=await query()`update dediko.offer_sales set status=${input.status},note=${note} where id=${id}::uuid
        and ((${input.status}='paid' and status='confirmed') or (${input.status} in ('confirmed','rejected') and status='pending')) returning id`;
      if (!rows.length) throw new HttpError(409,'სტატუსი შეიცვალა. გადახდილად მხოლოდ დადასტურებული საკომისიო ინიშნება.');return {ok:true};
    }
    if (input.action==='charge') {
      if (!['paid','void'].includes(input.status)||!note) fail('აირჩიე სტატუსი და მიუთითე გადახდის ან გაუქმების საფუძველი.');
      const rows=await query()`update dediko.offer_charges set status=${input.status},receipt=${note} where id=${id}::uuid and status='pending' returning id`;
      if (!rows.length) throw new HttpError(409,'ანგარიშსწორების სტატუსი უკვე შეცვლილია.');return {ok:true};
    }
    fail('მოქმედება არასწორია.');
  }
  return {catalog,member,event,partnerData,partnerWrite,adminData,adminWrite,entitlement,active};
}
