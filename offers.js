export const offerCategories = [
  { id: 'hygiene', label: 'საფენები და ჰიგიენა', icon: '✿', photo: 0 },
  { id: 'baby-clothes', label: 'პატარას ტანსაცმელი', icon: '♡', photo: 1 },
  { id: 'maternity', label: 'დედის ტანსაცმელი', icon: '✧', photo: 2 },
  { id: 'pharmacy', label: 'აფთიაქი და მოვლა', icon: '✚', photo: 3 },
  { id: 'equipment', label: 'პატარას ნივთები', icon: '⌂', photo: 4 },
  { id: 'services', label: 'მომსახურებები', icon: '☕', photo: 5 }
];
export const offerStages = [{id:'all',label:'ყველასთვის'},{id:'pregnant',label:'ორსულებისთვის'},{id:'mother',label:'ახალბედა დედებისთვის'}];
export const offerModes = [{id:'both',label:'ონლაინ და ფილიალში'},{id:'online',label:'ონლაინ'},{id:'store',label:'ფილიალში'}];
export const partnerStatuses = { pending:'განხილვაშია', approved:'დამტკიცებულია', suspended:'შეჩერებულია' };
export const offerStatuses = { draft:'მონახაზი', pending:'განხილვაშია', approved:'დამტკიცებულია', rejected:'შესასწორებელია', paused:'შეჩერებულია' };
export const money = value => `${(Number(value || 0) / 100).toLocaleString('ka-GE', { maximumFractionDigits: 2 })} ₾`;
export function safeOfferURL(value, optional = false) {
  if (optional && !value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname === 'localhost' || url.hostname.endsWith('.local') || !url.hostname.includes('.') || /^\d[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || url.href.length > 1000) return null;
    return url.href;
  } catch { return null; }
}
export function validateOffer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {error:'შეთავაზება არასწორია.'};
  const text = (key, max, min = 0) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if ([...value].length < min || [...value].length > max) throw new Error('გადაამოწმე ტექსტების სიგრძე და აუცილებელი ველები.');
    return value;
  };
  try {
    const value = { title:text('title',100,5), description:text('description',1000,10), category:text('category',30), stage:text('stage',15),
      city:text('city',60,2), mode:text('mode',10), benefit:text('benefit',70,3), terms:text('terms',1500,10), branches:text('branches',500),
      code:text('code',60), image:text('image',1000), url:text('url',1000), start:text('start',40), end:text('end',40),
      pro:input.pro === true, originalPrice:null, price:null };
    if (!offerCategories.some(x=>x.id===value.category) || !offerStages.some(x=>x.id===value.stage) || !offerModes.some(x=>x.id===value.mode)) throw new Error('აირჩიე კატეგორია, აუდიტორია და შეძენის გზა.');
    value.url = safeOfferURL(value.url); value.image = safeOfferURL(value.image,true);
    if (value.url === null || value.image === null) throw new Error('ბმული უნდა იწყებოდეს https://-ით და მიუთითებდეს საჯარო საიტზე.');
    const start = Date.parse(value.start), end = Date.parse(value.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 366*86400000) throw new Error('აირჩიე მოქმედების სწორი პერიოდი, მაქსიმუმ ერთი წელი.');
    value.start=new Date(start).toISOString(); value.end=new Date(end).toISOString();
    for (const key of ['price','originalPrice']) if (input[key] !== '' && input[key] != null) {
      const amount=Number(input[key]); if (!Number.isFinite(amount) || amount<0 || amount>100000 || Math.abs(amount*100-Math.round(amount*100))>.00001) throw new Error('ფასი მიუთითე ლარებში, მაქსიმუმ ორი ათწილადით.');
      value[key]=Math.round(amount*100);
    }
    if ((value.price===null)!==(value.originalPrice===null) || value.price!==null && value.price>=value.originalPrice) throw new Error('ძველი და ახალი ფასი ერთად მიუთითე; ახალი ფასი ნაკლები უნდა იყოს.');
    if (value.mode==='store' && !value.branches) throw new Error('მიუთითე მონაწილე ფილიალი ან მისამართი.');
    return {value};
  } catch(error) {return {error:error.message};}
}
export function validatePreferences(input) {
  if (!input || typeof input.enabled!=='boolean' || !Array.isArray(input.categories) || input.categories.length>6 || !input.categories.every(id=>offerCategories.some(x=>x.id===id)) || !offerStages.some(x=>x.id===input.stage) || typeof input.city!=='string' || input.city.trim().length>60) return {error:'შეტყობინებების პარამეტრები არასწორია.'};
  if (input.enabled && !input.categories.length) return {error:'აირჩიე მინიმუმ ერთი საინტერესო კატეგორია.'};
  return {value:{enabled:input.enabled,categories:[...new Set(input.categories)],stage:input.stage,city:input.city.trim()}};
}
const demoTitles=['პატარას ყოველდღიური სიმსუბუქე','რბილი სამოსი პატარა ჩახუტებებისთვის','კომფორტი მოლოდინის დღეებში','მოვლის პატარა რიტუალები','პირველი გასეირნებები, ერთად','ცოტა დრო შენთვის'];
export const demoOffers=offerCategories.map((category,i)=>({id:`ded10000-0000-4000-8000-00000000000${i}`,demo:true,featured:i===0,pro:i===2,
  partner:'დემო პარტნიორი',title:demoTitles[i],description:'შეთავაზების საილუსტრაციო მაგალითი. DEDIKO-ს ამ ეტაპზე პარტნიორი კომპანიები არ ჰყავს.',
  category:category.id,stage:i===2?'pregnant':i===5?'all':'mother',city:'თბილისი',mode:i===5?'store':'both',benefit:['−20% მაგალითი','−15% მაგალითი','Pro შეთავაზების მაგალითი','−10% მაგალითი','−15% მაგალითი','სპეციალური შეთავაზება'][i],
  terms:'დემო — მოქმედი ფასდაკლება, პარტნიორობა ან გამოსაყენებელი პრომოკოდი არ არის.',branches:'საილუსტრაციო ფილიალი',image:'',url:null,code:null,price:null,originalPrice:null,start:null,end:null,locked:i===2}));
