const sourceUrl = 'https://www.chelwest.nhs.uk/services/maternity/antenatal-education/additional-videos-and-resources';
const source = 'Chelsea and Westminster Hospital · NHS';

// Publicly embedded by the original publisher. Keep attribution and language visible.
export const publishedLessons = [
  { id: 'nhs-birth-preparation', stage: 'pregnant', category: 'preparation', title: 'მშობიარობისთვის მზადება', description: 'Getting Ready for Birth — მოსამზადებელი ვიდეოგაკვეთილი.', url: 'https://vimeo.com/408389494', language: 'ინგლისური', source, sourceUrl },
  { id: 'nhs-labour-birth', stage: 'pregnant', category: 'preparation', title: 'მშობიარობის პროცესის გაცნობა', description: 'Coping with Labour and Birth — ვიდეო მშობიარობის შესახებ.', url: 'https://vimeo.com/408390373', language: 'ინგლისური', source, sourceUrl },
  { id: 'nhs-breathing', stage: 'pregnant', category: 'wellbeing', title: 'სუნთქვა და მოდუნება', description: 'Breathing and Relaxation for Labour — სუნთქვისა და მოდუნების გაკვეთილი.', url: 'https://vimeo.com/409772888', language: 'ინგლისური', source, sourceUrl },
  { id: 'nhs-after-birth', stage: 'mother', category: 'selfcare', title: 'მშობიარობის შემდეგ', description: 'After the Birth — ახალი ეტაპის შესავალი.', url: 'https://vimeo.com/408391459', language: 'ინგლისური', source, sourceUrl },
  { id: 'nhs-early-days-one', stage: 'mother', category: 'newborn', title: 'პირველი დღეები პატარასთან · ნაწილი 1', description: 'Early Days, Part 1 — ახალბედა მშობლებისთვის.', url: 'https://vimeo.com/420675779', language: 'ინგლისური', source, sourceUrl },
  { id: 'nhs-early-days-two', stage: 'mother', category: 'newborn', title: 'პირველი დღეები პატარასთან · ნაწილი 2', description: 'Early Days, Part 2 — ვიდეოსერიის გაგრძელება.', url: 'https://vimeo.com/420677725', language: 'ინგლისური', source, sourceUrl }
];

export function lessonCategories(stage) {
  return stage === 'pregnant'
    ? [{ id: 'preparation', label: 'მომზადება' }, { id: 'wellbeing', label: 'ჩემზე ზრუნვა' }]
    : [{ id: 'newborn', label: 'პატარაზე ზრუნვა' }, { id: 'selfcare', label: 'ჩემზე ზრუნვა' }];
}

export function parseVideoUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1];
  }
  if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const match = (host === 'player.vimeo.com' ? /^\/video\/(\d{6,12})\/?$/ : /^\/(\d{6,12})(?:\/([a-zA-Z0-9]{6,64}))?\/?$/).exec(url.pathname);
    if (!match) return null;
    const hash = match[2] || url.searchParams.get('h');
    if (hash && !/^[a-zA-Z0-9]{6,64}$/.test(hash)) return null;
    const params = new URLSearchParams({ dnt: '1' });
    if (hash) params.set('h', hash);
    return { provider: 'vimeo', id: match[1], url: `https://vimeo.com/${match[1]}${hash ? '/' + hash : ''}`, embedUrl: `https://player.vimeo.com/video/${match[1]}?${params}` };
  }
  return null;
}

export function lessonsForStage(stage, personalLessons = []) {
  return [...publishedLessons, ...personalLessons].filter(lesson => lesson.stage === stage && parseVideoUrl(lesson.url));
}

export function migrateLessonState(saved) {
  return {
    ...saved,
    lessons: Array.isArray(saved.lessons) ? saved.lessons.filter(lesson => lesson && typeof lesson.id === 'string' && typeof lesson.title === 'string' && ['pregnant', 'mother'].includes(lesson.stage) && parseVideoUrl(lesson.url)) : [],
    completedLessons: Array.isArray(saved.completedLessons) ? saved.completedLessons.filter(id => typeof id === 'string') : []
  };
}
