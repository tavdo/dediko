const nhsGuide = 'https://www.nhs.uk/best-start-in-life/pregnancy/week-by-week-guide-to-pregnancy/';
const whoChart = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5261648/#pmed.1002220.t011';

// Length in millimetres and visual comparisons from the NHS weekly guide.
// Weight in grams, where available, is the median in WHO's Table 11.
const weeks = [
  [2, 'ყაყაჩოს მარცვალი', 'poppy'],                  // 4
  [2, 'სეზამის მარცვალი', 'sesame'],
  [6, 'ბარდის მარცვალი', 'pea'],
  [10, 'ყურძნის მარცვალი', 'grape'],
  [16, 'ჟოლო', 'raspberry'],
  [22, 'მარწყვი', '🍓'],
  [30, 'პატარა გარგარი', 'apricot'],
  [41, 'ლეღვი', 'fig'],
  [54, 'ქლიავი', 'plum'],
  [74, 'ატამი', '🍑'],
  [85, 'კივი', '🥝', 90],                            // 14
  [101, 'ვაშლი', '🍎', 114],
  [116, 'ავოკადო', '🥑', 144],
  [120, 'ბროწეული', 'pomegranate', 179],
  [142, 'ბულგარული წიწაკა', 'pepper', 222],
  [153, 'დიდი პომიდორი', '🍅', 272],
  [256, 'ბანანი', '🍌', 330],                         // 20
  [267, 'სტაფილო', '🥕', 398],
  [278, 'ტკბილი კარტოფილი', '🍠', 476],
  [289, 'დიდი მანგო', '🥭', 565],
  [300, 'სიმინდის ტარო', '🌽', 665],
  [346, 'ყაბაყი', 'courgette', 778],
  [356, 'კიტრი', '🥒', 902],
  [366, 'ყვავილოვანი კომბოსტო', 'cauliflower', 1039],
  [376, 'ბადრიჯანი', '🍆', 1189],
  [386, 'მსხლისებრი გოგრა', 'squash', 1350],
  [399, 'კომბოსტო', 'cabbage', 1523],
  [411, 'ქოქოსი', '🥥', 1707],
  [424, 'ნიახურის კონა', 'celery', 1901],
  [437, 'ანანასი', '🍍', 2103],
  [450, 'კანტალუპის ნესვი', 'cantaloupe', 2312],
  [462, 'თაფლისფერი ნესვი', '🍈', 2527],
  [474, 'რომაული სალათა', '🥬', 2745],
  [486, 'პრასი', 'leek', 2966],
  [498, 'რევანდის ღერო', 'rhubarb', 3186],
  [507, 'საზამთრო', '🍉', 3403],
  [512, 'გოგრა', 'pumpkin', 3617]                    // 40
];

export const firstGrowthWeek = 1;
export const lastGrowthWeek = weeks.length + 3;
const number = new Intl.NumberFormat('ka-GE', { maximumFractionDigits:1 });
const earlyNotes = [
  'ორსულობის ვადას ბოლო მენსტრუაციის პირველი დღიდან ითვლიან. ამ ეტაპზე ემბრიონი ჯერ არ არის განვითარებული.',
  'ორსულობის ვადის დათვლა უკვე დაწყებულია. ამ ეტაპზე ზომისა და წონის შედარება ჯერ ნაადრევია.',
  'თუ განაყოფიერება მოხდა, განვითარება ახლა იწყება. კვირის ზომის ილუსტრაციები მე-4 კვირიდან ჩანს.'
];

export function growthWeekContent(week) {
  if (!Number.isInteger(week) || week < firstGrowthWeek || week > lastGrowthWeek) return '';
  if (week < 4) {
    return `<div class="growth-art" aria-hidden="true"><span>🌱</span></div>
      <div class="growth-copy"><p class="growth-kicker">ორსულობის დასაწყისი</p>
        <h3>კვირა ${week}</h3><p>${earlyNotes[week - 1]}</p>
        <a href="https://www.111.wales.nhs.uk/livewell/pregnancy/4to8weeks/" target="_blank" rel="noopener noreferrer">NHS · პირველი კვირები ↗</a>
      </div>`;
  }
  const [lengthMm, comparison, art, weight] = weeks[week - 4];
  const trimester = week < 13 ? '1st' : week < 28 ? '2nd' : '3rd';
  const method = week < 7 ? 'ემბრიონის სიგრძე' : week < 20 ? 'თავიდან საჯდომამდე' : 'თავიდან ქუსლამდე';
  const length = lengthMm < 10 ? `${lengthMm} მმ` : `${number.format(lengthMm / 10)} სმ`;
  const artwork = /^[a-z]+$/.test(art)
    ? `<svg viewBox="0 0 96 96"><use href="/assets/growth-comparisons.svg#${art}"></use></svg>`
    : `<span>${art}</span>`;
  return `<div class="growth-art" aria-hidden="true">${artwork}</div>
    <div class="growth-copy">
      <p class="growth-kicker">კვირა ${week} · ზომის შედარება</p>
      <h3>${comparison}</h3>
      <dl class="growth-metrics">
        <div><dt>სიგრძე · ${method}</dt><dd>≈ ${length}</dd></div>
        ${weight ? `<div><dt>საორიენტაციო წონა</dt><dd>≈ ${number.format(weight)} გ</dd></div>` : ''}
      </dl>
      <p class="growth-note">${weight ? 'სიგრძე და წონა საორიენტაციოა.' : 'სიგრძე საორიენტაციოა. წონის მონაცემები მე-14 კვირიდან ჩანს.'} ინდივიდუალური ზრდის შეფასება ექიმთან შეგიძლია.</p>
      <div class="growth-sources">
        <a href="${nhsGuide}${trimester}-trimester/week-${week}/" target="_blank" rel="noopener noreferrer">NHS · სიგრძე ↗</a>
        ${weight ? `<a href="${whoChart}" target="_blank" rel="noopener noreferrer">WHO · წონის მედიანა ↗</a>` : ''}
      </div>
    </div>`;
}

export function pregnancyGrowthCard(age) {
  const current = Math.min(lastGrowthWeek, Math.max(firstGrowthWeek, age?.weeks ?? firstGrowthWeek));
  const progress = !age ? 'ვადის გამოსათვლელად გადაამოწმე პროფილში მითითებული თარიღი.'
    : age.weeks > 42 ? 'პროფილში მითითებული სავარაუდო მშობიარობის თარიღი გასულია.'
    : `${age.weeks} კვირა და ${age.days} დღე`;
  const options = Array.from({ length:lastGrowthWeek }, (_, index) => {
    const week = index + firstGrowthWeek;
    return `<option value="${week}" ${week === current ? 'selected' : ''}>კვირა ${week}</option>`;
  }).join('');
  return `<section class="pregnancy-growth" aria-labelledby="growth-heading">
    <header class="growth-header">
      <div><p class="growth-kicker">კვირიდან კვირამდე</p>
        <h2 id="growth-heading">როგორ იზრდება პატარა</h2>
        <p class="growth-age">${progress}${age && age.weeks <= 42 ? ' · პროფილის თარიღის მიხედვით' : ''}</p>
      </div>
      <label class="growth-picker">აირჩიე კვირა
        <select name="growthWeek" aria-controls="growth-content">${options}</select>
      </label>
    </header>
    <div id="growth-content" class="growth-content" aria-live="polite">${growthWeekContent(current)}</div>
  </section>`;
}
