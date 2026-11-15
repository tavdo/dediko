export const communityTypes = [
  { id: 'question', label: 'კითხვა', symbol: '?' },
  { id: 'experience', label: 'ჩემი გამოცდილება', symbol: '♡' }
];
export const communityTopics = [
  { id: 'pregnancy', label: 'ორსულობა' },
  { id: 'motherhood', label: 'დედობა' },
  { id: 'baby', label: 'პატარაზე ზრუნვა' },
  { id: 'wellbeing', label: 'ჩემზე ზრუნვა' },
  { id: 'other', label: 'სხვა' }
];
export const communityReasons = [
  { id: 'medical', label: 'შეცდომაში შემყვანი სამედიცინო რჩევა' },
  { id: 'abuse', label: 'შეურაცხყოფა ან შევიწროება' },
  { id: 'privacy', label: 'პირადი მონაცემები' },
  { id: 'spam', label: 'სპამი ან რეკლამა' },
  { id: 'other', label: 'სხვა' }
];
export function validateCommunity(input, comment = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'მონაცემები არასწორია.' };
  const text = key => typeof input[key] === 'string' ? input[key].trim() : '';
  const length = value => [...value].length;
  const value = { author: text('author'), body: text('body') };
  if (length(value.author) < 2 || length(value.author) > 40) return { error: 'საჯარო სახელი 2–40 სიმბოლოს უნდა შეიცავდეს.' };
  if (length(value.body) < (comment ? 2 : 10) || length(value.body) > (comment ? 1500 : 4000)) return { error: comment ? 'კომენტარი 2–1500 სიმბოლოს უნდა შეიცავდეს.' : 'პოსტის ტექსტი 10–4000 სიმბოლოს უნდა შეიცავდეს.' };
  if (input.consent !== true) return { error: 'გამოქვეყნებამდე დაეთანხმე საზოგადოების წესებს.' };
  if (!comment) {
    value.title = text('title'); value.type = text('type'); value.topic = text('topic');
    if (length(value.title) < 5 || length(value.title) > 120) return { error: 'სათაური 5–120 სიმბოლოს უნდა შეიცავდეს.' };
    if (!communityTypes.some(item => item.id === value.type) || !communityTopics.some(item => item.id === value.topic)) return { error: 'აირჩიე პოსტის ტიპი და თემა.' };
  }
  return { value };
}
