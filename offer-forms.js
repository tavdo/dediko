import {offerCategories,offerStages,offerModes} from './offers.js';
export const offerEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const offerOptions=(items,value)=>items.map(x=>`<option value="${offerEscape(x.id)}" ${x.id===value?'selected':''}>${offerEscape(x.label)}</option>`).join('');
function localInput(value) {const d=new Date(value);if (!Number.isFinite(d.getTime())) return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export function offerFields(item) {
  const c=item?.content||{},start=c.start||new Date().toISOString(),end=c.end||new Date(Date.now()+30*86400000).toISOString();
  return `<label class="field">სათაური<input name="title" required minlength="5" maxlength="100" value="${offerEscape(c.title)}"></label>
  <div class="field-row"><label class="field">კატეგორია<select name="category">${offerOptions(offerCategories,c.category)}</select></label><label class="field">ვისთვისაა?<select name="stage">${offerOptions(offerStages,c.stage||'all')}</select></label></div>
  <label class="field">აღწერა<textarea name="description" required minlength="10" maxlength="1000" rows="3">${offerEscape(c.description)}</textarea></label>
  <label class="field">მოკლე სარგებელი / ფასდაკლება<input name="benefit" required minlength="3" maxlength="70" placeholder="მაგ. 15% შერჩეულ კოლექციაზე" value="${offerEscape(c.benefit)}"></label>
  <div class="field-row"><label class="field">ძველი ფასი, ₾ (არასავალდებულო)<input name="originalPrice" type="number" min="0" max="100000" step="0.01" value="${c.originalPrice!=null?c.originalPrice/100:''}"></label><label class="field">ახალი ფასი, ₾<input name="price" type="number" min="0" max="100000" step="0.01" value="${c.price!=null?c.price/100:''}"></label></div>
  <div class="field-row"><label class="field">იწყება<input name="start" type="datetime-local" required value="${localInput(start)}"></label><label class="field">სრულდება<input name="end" type="datetime-local" required value="${localInput(end)}"></label></div>
  <div class="field-row"><label class="field">ქალაქი<input name="city" required minlength="2" maxlength="60" value="${offerEscape(c.city||'თბილისი')}"></label><label class="field">შეძენის გზა<select name="mode">${offerOptions(offerModes,c.mode||'both')}</select></label></div>
  <label class="field">მონაწილე ფილიალები<textarea name="branches" maxlength="500" rows="2">${offerEscape(c.branches)}</textarea></label>
  <label class="field">შეთავაზების ბმული<input name="url" type="url" required maxlength="1000" placeholder="https://" value="${offerEscape(c.url)}"></label>
  <label class="field">ფოტოს ბმული (ცარიელი — კატეგორიის ფოტო)<input name="image" type="url" maxlength="1000" placeholder="https://" value="${offerEscape(c.image)}"></label>
  <label class="field">პრომოკოდი (არასავალდებულო)<input name="code" maxlength="60" value="${offerEscape(c.code)}"></label>
  <label class="field">გამოყენების სრული პირობები<textarea name="terms" required minlength="10" maxlength="1500" rows="4" placeholder="ვის ეხება, სად გამოიყენება, გამონაკლისები, მინიმალური შენაძენი…">${offerEscape(c.terms)}</textarea></label>
  <label class="offer-check"><input type="checkbox" name="pro" ${c.pro?'checked':''}> მხოლოდ დადასტურებული Pro წვდომისთვის</label>
  <p class="form-note">კოდის მიღება და მაღაზიაში გადასვლა Pro წვდომით შემოწმდება. პირობებსა და აღწერაში საიდუმლო კოდი არ ჩაწერო. ფოტოებზე გამოყენების უფლება უნდა გქონდეს.</p>`;
}
export function readOfferForm(form) {
  const values=Object.fromEntries(new FormData(form));values.pro=new FormData(form).has('pro');
  for (const key of ['start','end']) if (values[key]) values[key]=new Date(values[key]).toISOString();
  return values;
}
