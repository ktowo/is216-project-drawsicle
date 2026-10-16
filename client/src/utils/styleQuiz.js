// Find your style quiz: answers kept in this browser until they're saved to a profile.
// Works without an account; "Sign up to save" sets pendingSave so the quiz page saves them
// after the first login.
import { artistTagsOf, tasteOf, hasTaste } from '@shared/taste.mjs';

const KEY = 'drawsicle-style-quiz';
export const QUIZ_STEPS = 5;

export const emptyAnswers = () => ({ makes: [], themes: [], wants: [], activity: '', cardColor: '' });

// Only known values survive (old or hand-edited storage can't break the quiz)
export function cleanAnswers(raw = {}) {
  const taste = tasteOf(raw);
  const { cardColor } = artistTagsOf(raw);
  return { makes: taste.makes, themes: taste.themes, wants: taste.wants, activity: taste.activity, cardColor };
}

export function loadQuiz(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null') || {};
    const step = Number.isInteger(saved.step) && saved.step >= 0 && saved.step <= QUIZ_STEPS ? saved.step : 0;
    return { answers: cleanAnswers(saved.answers), step, pendingSave: Boolean(saved.pendingSave) };
  } catch {
    return { answers: emptyAnswers(), step: 0, pendingSave: false };
  }
}

export function saveQuiz(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the quiz still works, it just won't survive a reload
  }
}

export function clearQuiz(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

export const hasAnswers = (answers) => hasTaste(tasteOf(answers)) || Boolean(answers.activity || answers.cardColor);

// The PATCH /profile body for these answers. copyDefaults also fills the private sign-up
// defaults (what you can make, what you'd like) so future sign-up forms start filled in.
export function profileUpdateFrom(answers, { copyDefaults = false } = {}) {
  const a = cleanAnswers(answers);
  const body = { artistTags: { makes: a.makes, themes: a.themes, activity: a.activity, cardColor: a.cardColor } };
  if (copyDefaults) body.defaultForm = { canCreate: a.makes, wantsTypes: a.wants };
  return body;
}

// Same tags as saved ones? (saving would change nothing)
export function sameTags(answers, tags) {
  const a = profileUpdateFrom(answers).artistTags;
  const b = artistTagsOf(tags);
  return JSON.stringify(a) === JSON.stringify(b);
}

// Query string values describing this taste, for recommendations without an account
// (GET /discover/recommendations and Discover's Recommended sort)
export function tasteQuery(answers) {
  const a = cleanAnswers(answers);
  return {
    tasteMakes: a.makes.join(','),
    tasteWants: a.wants.join(','),
    tasteThemes: a.themes.join(','),
    tasteActivity: a.activity,
  };
}
