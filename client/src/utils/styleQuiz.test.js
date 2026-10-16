import { describe, expect, it } from 'vitest';
import { loadQuiz, saveQuiz, clearQuiz, profileUpdateFrom, sameTags, tasteQuery, hasAnswers, emptyAnswers } from './styleQuiz.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe('style quiz storage', () => {
  it('round-trips answers and cleans anything unknown', () => {
    const storage = memoryStorage();
    saveQuiz({ answers: { makes: ['art', 'clay'], themes: ['fantasy', 'nope'], wants: ['writing'], activity: 'x', cardColor: 'mint' }, step: 3, pendingSave: true }, storage);
    expect(loadQuiz(storage)).toEqual({
      answers: { makes: ['art'], themes: ['fantasy'], wants: ['writing'], activity: '', cardColor: 'mint' },
      step: 3,
      pendingSave: true,
    });
    clearQuiz(storage);
    expect(loadQuiz(storage)).toEqual({ answers: emptyAnswers(), step: 0, pendingSave: false });
  });

  it('survives broken or unavailable storage', () => {
    const broken = { getItem: () => '{nope', setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('no'); } };
    expect(loadQuiz(broken).step).toBe(0);
    expect(() => saveQuiz({ answers: emptyAnswers(), step: 1 }, broken)).not.toThrow();
    expect(() => clearQuiz(broken)).not.toThrow();
    expect(loadQuiz(undefined).answers).toEqual(emptyAnswers());
  });
});

describe('turning answers into a profile update', () => {
  const answers = { makes: ['art'], themes: ['cosy', 'spooky'], wants: ['writing'], activity: 'casual', cardColor: 'sky' };

  it('saves artist tags, and sign-up defaults only when asked', () => {
    expect(profileUpdateFrom(answers)).toEqual({
      artistTags: { makes: ['art'], themes: ['cosy', 'spooky'], activity: 'casual', cardColor: 'sky' },
    });
    expect(profileUpdateFrom(answers, { copyDefaults: true }).defaultForm).toEqual({ canCreate: ['art'], wantsTypes: ['writing'] });
  });

  it('knows when saved tags already match, and builds a taste query', () => {
    expect(sameTags(answers, { makes: ['art'], themes: ['cosy', 'spooky'], activity: 'casual', cardColor: 'sky' })).toBe(true);
    expect(sameTags(answers, { makes: [], themes: [], activity: '', cardColor: '' })).toBe(false);
    expect(tasteQuery(answers)).toEqual({ tasteMakes: 'art', tasteWants: 'writing', tasteThemes: 'cosy,spooky', tasteActivity: 'casual' });
    expect(hasAnswers(emptyAnswers())).toBe(false);
    expect(hasAnswers({ ...emptyAnswers(), cardColor: 'sky' })).toBe(true);
  });
});
