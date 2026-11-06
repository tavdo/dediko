export const ideaCategories = [
  {id:'pregnant',label:'ორსულობა'}, {id:'mother',label:'ახალბედა დედობა'},
  {id:'reminders',label:'შეხსენებები'}, {id:'lessons',label:'ვიდეოები'}, {id:'other',label:'სხვა'}
];
export const ideaStatuses = [
  {id:'reviewing',label:'განხილვაშია'}, {id:'planned',label:'დაგეგმილია'},
  {id:'inprogress',label:'ვმუშაობთ'}, {id:'completed',label:'დაემატა'}
];
export function normalizeIdeaTitle(title) { return String(title).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ka-GE'); }
export function validateIdea(input) {
  if (!input || typeof input !== 'object' || input.publish !== true || input.website) return {error:'დაადასტურე, რომ იდეის საჯაროდ გამოჩენა გსურს.'};
  const fields = [['title',8,100],['description',20,1000],['benefit',10,400]];
  for (const [field,min,max] of fields) {
    if (typeof input[field] !== 'string' || input[field].trim().length < min || input[field].trim().length > max) return {error:'შეავსე სათაური (8–100 სიმბოლო), აღწერა (20–1000) და სარგებელი (10–400).'};
  }
  if (!ideaCategories.some(item=>item.id===input.category)) return {error:'აირჩიე იდეის კატეგორია.'};
  return {value:{title:input.title.trim(),description:input.description.trim(),benefit:input.benefit.trim(),category:input.category}};
}
export function filterIdeas(ideas,{category='all',status='all',search='',sort='popular',mine=false}={}) {
  const query=normalizeIdeaTitle(search);
  return ideas.filter(idea=>(category==='all'||idea.category===category)&&(status==='all'||idea.status===status)&&(!mine||idea.mine)&&normalizeIdeaTitle(`${idea.title} ${idea.description} ${idea.benefit}`).includes(query))
    .sort((a,b)=>sort==='newest'?b.createdAt.localeCompare(a.createdAt):b.votes-a.votes||b.createdAt.localeCompare(a.createdAt));
}
