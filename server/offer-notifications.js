import { send } from '@vercel/queue';
import { db } from './db.js';
import { deliver,topic } from './push.js';

// A separate, opt-in daily digest uses the existing Queue and push devices.
// Member stage/city preferences stay in Dediko; partners get no recipient list.
export async function queueOfferDigests({sql=db(),sendFn=send}={}) {
  const rows=await sql`update dediko.offer_preferences p set digest_key=coalesce(digest_key,gen_random_uuid()),
      digest_cutoff=coalesce(digest_cutoff,now())
    where p.enabled and (p.queued_at is null or p.queued_at<now()-interval '1 hour')
    and p.user_id in (select f.user_id from dediko.offer_preferences f where f.enabled and (f.last_notified=f.enabled_at or f.last_notified<now()-interval '20 hours')
      and exists(select 1 from dediko.push_subscriptions s where s.user_id=f.user_id)
      and exists(select 1 from dediko.offers o join dediko.partners b on b.id=o.partner_id
        where o.status='approved' and b.status='approved' and o.starts_at<=now() and o.ends_at>now()
        and greatest(o.published_at,o.starts_at)>greatest(f.last_notified,f.enabled_at)
        and f.categories ? (o.content->>'category')
        and (f.stage='all' or o.content->>'stage' in ('all',f.stage))
        and (f.city='' or o.content->>'city'=f.city or o.content->>'mode' in ('online','both'))
        and (not (o.content->>'pro')::boolean or exists(select 1 from dediko.offer_entitlements e where e.user_id=f.user_id and e.expires_at>now())))
      order by f.last_notified limit 50) returning user_id,digest_key`;
  for (const row of rows) {
    await sendFn(topic,{kind:'offer-digest',userId:row.user_id,key:row.digest_key},{region:'iad1',retentionSeconds:86400,idempotencyKey:`offers:${row.digest_key}:${Math.floor(Date.now()/3600000)}`});
    await sql`update dediko.offer_preferences set queued_at=now() where user_id=${row.user_id} and digest_key=${row.digest_key}::uuid`;
  }
  return rows.length;
}
export async function processOfferDigest(message,{sql=db(),deliverFn=(subscription,key)=>deliver(subscription,key,false,true)}={}) {
  const [pref]=await sql`select * from dediko.offer_preferences where user_id=${message.userId} and enabled and digest_key=${message.key}::uuid`;
  if (!pref) return;
  const [active]=await sql`select exists(select 1 from dediko.offers o join dediko.partners p on p.id=o.partner_id
    where o.status='approved' and p.status='approved' and o.starts_at<=now() and o.ends_at>now()
      and greatest(o.published_at,o.starts_at)>greatest(${pref.last_notified}::timestamptz,${pref.enabled_at}::timestamptz) and greatest(o.published_at,o.starts_at)<=${pref.digest_cutoff}::timestamptz
      and ${JSON.stringify(pref.categories)}::jsonb ? (o.content->>'category')
      and (${pref.stage}='all' or o.content->>'stage' in ('all',${pref.stage}))
      and (${pref.city}='' or o.content->>'city'=${pref.city} or o.content->>'mode' in ('online','both'))
      and (not (o.content->>'pro')::boolean or exists(select 1 from dediko.offer_entitlements e where e.user_id=${pref.user_id} and e.expires_at>now()))) as found`;
  if (active.found && new Date(pref.digest_cutoff).getTime()>Date.now()-86400000) {
    const devices=await sql`select endpoint_hash,subscription from dediko.push_subscriptions where user_id=${pref.user_id}`;
    for (const device of devices) {
      // Recheck opt-in between devices, including after a queued job was created.
      const [enabled]=await sql`select exists(select 1 from dediko.offer_preferences where user_id=${pref.user_id} and enabled and digest_key=${message.key}::uuid) as active`;
      if (!enabled.active) return;
      const occurrence=`offers:${message.key}`;
      const [claim]=await sql`insert into dediko.push_deliveries(endpoint_hash,occurrence,status,lease_until)
        values(${device.endpoint_hash},${occurrence},'sending',now()+interval '2 minutes')
        on conflict(endpoint_hash,occurrence) do update set lease_until=excluded.lease_until
        where push_deliveries.status='sending' and push_deliveries.lease_until<now() returning status`;
      if (!claim) {
        const [existing]=await sql`select status from dediko.push_deliveries where endpoint_hash=${device.endpoint_hash} and occurrence=${occurrence}`;
        if (existing?.status==='sending') throw new Error('Offer delivery is in progress');
        continue;
      }
      try {
        await deliverFn(device.subscription,occurrence);
        await sql`update dediko.push_deliveries set status='sent' where endpoint_hash=${device.endpoint_hash} and occurrence=${occurrence}`;
      } catch(error) {
        if ([404,410].includes(error.statusCode)) await sql`delete from dediko.push_subscriptions where endpoint_hash=${device.endpoint_hash}`;
        else {await sql`delete from dediko.push_deliveries where endpoint_hash=${device.endpoint_hash} and occurrence=${occurrence} and status='sending'`;throw new Error('Offer push provider unavailable');}
      }
    }
  }
  await sql`update dediko.offer_preferences set last_notified=digest_cutoff,digest_key=null,digest_cutoff=null,queued_at=null where user_id=${pref.user_id} and digest_key=${message.key}::uuid`;
}
