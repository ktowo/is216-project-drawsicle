// Starting points for the "Create an event" page. A template only fills in the form:
// the organiser can change everything before saving, and nothing here is stored on the event.
//
//   applyTemplate(EVENT_TEMPLATES[0], new Date())
//   -> { name, theme, season, description, rules, tags, allowedTypes, minParticipants,
//        maxParticipants, requireApproval, signupDeadline, submissionDeadline }
//
// Deadlines come back as datetime-local strings ('2026-11-02T23:59'), which is what the form edits.
import { toLocalInput } from '@/utils/format';

// season: 'current' picks the season the gifts are due in (see seasonFor below).
// Dates: sign-ups close signupDays from today and gifts are due giftDays after that, or, for
// templates tied to a day of the year (dueOn, month 0-11), gifts are due on its next occurrence.
export const EVENT_TEMPLATES = [
  {
    id: 'secret-santa',
    name: 'Secret Santa',
    icon: 'Gift',
    blurb: 'The classic. Everyone draws for a secret giftee and the gifts are revealed together at the end.',
    season: 'christmas',
    theme: 'Cosy winter gifts',
    description:
      "Our yearly Secret Santa! Sign up with the characters you'd love to receive art of, and you'll be matched " +
      'with a secret giftee. Make them something festive, submit it before the deadline, and everyone opens ' +
      'their gifts on reveal day.',
    rules:
      '- SFW only.\n' +
      '- At least a clean sketch with flat colours, please.\n' +
      "- Keep your giftee a secret until the reveal.\n" +
      "- If you can't finish, tell the organisers early so we can find a pinch hitter.",
    tags: ['secret santa', 'sfw', 'oc friendly'],
    allowedTypes: ['art', 'writing', 'adoptable'],
    minParticipants: 3,
    maxParticipants: 60,
    requireApproval: false,
    // Gifts due a few days before Christmas, so there is time to post them
    dueOn: { month: 11, day: 20 },
    giftDays: 35,
  },
  {
    id: 'valentine-swap',
    name: 'Valentine swap',
    icon: 'Heart',
    blurb: 'A short, sweet exchange of love letters, ship art and cute doodles.',
    season: 'valentine',
    theme: 'Love letters',
    description:
      'Spread some love! Draw or write something sweet for your match: couples, best friends, a character ' +
      'and their favourite snack, anything goes as long as it is wholesome.',
    rules:
      '- SFW only, keep it wholesome.\n' +
      "- Check your match's likes and \"please avoid\" list before you start.\n" +
      '- Sketches, chibis and short poems all count.',
    tags: ['valentine', 'sfw', 'wholesome'],
    allowedTypes: ['art', 'writing'],
    minParticipants: 2,
    maxParticipants: 40,
    requireApproval: false,
    dueOn: { month: 1, day: 14 },
    giftDays: 18,
  },
  {
    id: 'seasonal-trade',
    name: 'Seasonal art trade',
    icon: 'Leaf',
    blurb: 'A relaxed trade themed on the season the gifts are due in.',
    season: 'current',
    theme: '',
    description:
      'A laid-back seasonal trade. Sign up, get matched with another artist and draw their characters ' +
      'enjoying the season. Backgrounds and props are welcome but never required.',
    rules:
      '- SFW only.\n' +
      '- Any finish is fine, from sketch to fully rendered.\n' +
      '- Please include a little nod to the season.',
    tags: ['seasonal', 'art trade', 'sfw'],
    allowedTypes: ['art'],
    minParticipants: 3,
    maxParticipants: 50,
    requireApproval: false,
    signupDays: 14,
    giftDays: 28,
  },
  {
    id: 'character-trade',
    name: 'Character art trade',
    icon: 'Palette',
    blurb: 'Draw OCs for each other. Sign-ups are reviewed so every reference is ready to use.',
    season: 'other',
    theme: 'Draw my OC',
    description:
      'Bring your original characters! Offer up to five characters with clear references and get a piece ' +
      'of art of one of them from your match. Great for filling out a character gallery.',
    rules:
      '- Every offered character needs at least one clear reference link.\n' +
      '- Draw one of the characters your match offered (more is a bonus).\n' +
      '- Respect the "can\'t draw" and "please avoid" lists.\n' +
      '- Credit your match when you post the piece.',
    tags: ['oc', 'character art', 'art trade'],
    allowedTypes: ['art', 'adoptable'],
    minParticipants: 4,
    maxParticipants: 30,
    requireApproval: true,
    signupDays: 10,
    giftDays: 28,
  },
  {
    id: 'writing-exchange',
    name: 'Writing exchange',
    icon: 'PenLine',
    blurb: 'Short stories, poems and drabbles about each other\'s characters.',
    season: 'other',
    theme: 'Tell their story',
    description:
      "A writing exchange for character lovers. Write a short piece about your match's characters: a slice " +
      'of life, a missing scene, a poem or a letter. Shorter pieces are just as welcome as long ones.',
    rules:
      '- At least 500 words, or a poem of any length.\n' +
      '- Share your piece as a link (Google Docs, AO3, Toyhou.se and so on).\n' +
      '- Mark any content warnings at the top.',
    tags: ['writing', 'fic', 'prose'],
    allowedTypes: ['writing'],
    minParticipants: 3,
    maxParticipants: 40,
    requireApproval: false,
    signupDays: 14,
    giftDays: 28,
  },
];

export function findTemplate(id) {
  return EVENT_TEMPLATES.find((t) => t.id === id) || null;
}

// Northern hemisphere seasons, since that is where most of our communities are
export function seasonFor(date) {
  const month = new Date(date).getMonth();
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

const SEASON_NAMES = { winter: 'Winter', spring: 'Spring', summer: 'Summer', autumn: 'Autumn' };

function endOfDayIn(from, days) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d;
}

// Leaves at least this many days for sign-ups before the gift window starts
const MIN_SIGNUP_DAYS = 7;

function templateDates(template, now) {
  if (!template.dueOn) {
    const signup = endOfDayIn(now, template.signupDays);
    return { signup, submission: endOfDayIn(signup, template.giftDays) };
  }
  const earliest = endOfDayIn(now, MIN_SIGNUP_DAYS);
  for (let year = new Date(now).getFullYear(); ; year++) {
    const submission = new Date(year, template.dueOn.month, template.dueOn.day, 23, 59, 0, 0);
    const signup = endOfDayIn(submission, -template.giftDays);
    if (signup >= earliest) return { signup, submission };
  }
}

export function applyTemplate(template, now = new Date()) {
  if (!template) return {};
  const { signup, submission } = templateDates(template, now);
  const season = template.season === 'current' ? seasonFor(submission) : template.season;
  const year = submission.getFullYear();

  let name = `${template.name} ${year}`;
  let theme = template.theme;
  if (template.season === 'current') {
    name = `${SEASON_NAMES[season]} art trade ${year}`;
    theme = theme || `${SEASON_NAMES[season]} days`;
  }

  return {
    name,
    theme,
    season,
    description: template.description,
    rules: template.rules,
    tags: [...template.tags],
    allowedTypes: [...template.allowedTypes],
    minParticipants: template.minParticipants,
    maxParticipants: template.maxParticipants,
    requireApproval: template.requireApproval,
    signupDeadline: toLocalInput(signup),
    submissionDeadline: toLocalInput(submission),
  };
}
