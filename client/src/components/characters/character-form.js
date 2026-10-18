import { LIMITS, normalizeTags, REFERENCE_URL_RE } from '@shared/constants.mjs';

// Helpers for the character form (CharacterFields) used by the library and the event sign-up page.

const URL_RE = /^https?:\/\/\S+$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export function emptyPet() {
  return { shown: false, kind: '', palette: '' };
}

export function isHttpUrl(value) {
  return URL_RE.test(String(value ?? '').trim());
}

// Web links, or the demo's own reference pictures
export function isReferenceUrl(value) {
  return REFERENCE_URL_RE.test(String(value ?? '').trim());
}

// Blank form value for <CharacterFields v-model="...">
export function emptyCharacter() {
  return {
    name: '',
    species: '',
    pronouns: '',
    tags: [],
    description: '',
    personality: '',
    colours: [],
    referenceLinks: [],
    notesForArtists: '',
    contentWarnings: [],
    folder: '',
    favourite: false,
    pet: emptyPet(),
  };
}

// Character from the API -> form value (copies arrays so edits don't touch the original)
export function characterToForm(character) {
  const c = character || {};
  return {
    name: c.name || '',
    species: c.species || '',
    pronouns: c.pronouns || '',
    tags: [...(c.tags || [])],
    description: c.description || '',
    personality: c.personality || '',
    colours: [...(c.colours || [])],
    referenceLinks: (c.referenceLinks || []).map((l) => ({ label: l.label || '', url: l.url || '', note: l.note || '' })),
    notesForArtists: c.notesForArtists || '',
    contentWarnings: [...(c.contentWarnings || [])],
    folder: c.folder || '',
    favourite: Boolean(c.favourite),
    pet: { ...emptyPet(), ...(c.pet || {}) },
  };
}

// Form value -> request body. Empty link rows are dropped; colours are lower-cased and de-duplicated.
export function characterPayload(form) {
  const pet = { ...emptyPet(), ...(form.pet || {}) };
  return {
    name: String(form.name || '').trim(),
    species: String(form.species || '').trim(),
    pronouns: String(form.pronouns || '').trim(),
    tags: normalizeTags(form.tags || []),
    description: String(form.description || '').trim(),
    personality: String(form.personality || '').trim(),
    colours: [...new Set((form.colours || []).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean))],
    referenceLinks: (form.referenceLinks || [])
      .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url || '').trim(), note: String(l.note || '').trim() }))
      .filter((l) => l.url || l.label || l.note),
    notesForArtists: String(form.notesForArtists || '').trim(),
    contentWarnings: [...new Set(form.contentWarnings || [])],
    folder: String(form.folder || '').trim(),
    favourite: Boolean(form.favourite),
    pet: { shown: Boolean(pet.shown), kind: pet.kind || '', palette: pet.palette || '' },
  };
}

// Returns { field: message } (empty object when valid). Link rows use keys like "referenceLinks.0".
export function validateCharacter(form) {
  const errors = {};
  const data = characterPayload(form);

  if (!data.name) errors.name = 'Give your character a name.';
  else if (data.name.length > LIMITS.characterName) errors.name = `Keep the name under ${LIMITS.characterName} characters.`;

  if (data.species.length > LIMITS.species) errors.species = `Keep this under ${LIMITS.species} characters.`;
  if (data.pronouns.length > LIMITS.pronouns) errors.pronouns = `Keep pronouns under ${LIMITS.pronouns} characters.`;
  if (data.folder.length > LIMITS.folder) errors.folder = `Keep the folder name under ${LIMITS.folder} characters.`;
  if (data.personality.length > LIMITS.personality) {
    errors.personality = `Personality is too long (max ${LIMITS.personality} characters).`;
  }
  if (data.colours.length > LIMITS.colours) errors.colours = `Up to ${LIMITS.colours} colours.`;
  else if (data.colours.some((c) => !HEX_RE.test(c))) errors.colours = 'Colours need to look like #f6a5c0.';
  if (data.description.length > LIMITS.characterDescription) {
    errors.description = `Description is too long (max ${LIMITS.characterDescription} characters).`;
  }
  if (data.notesForArtists.length > LIMITS.notesForArtists) {
    errors.notesForArtists = `Notes are too long (max ${LIMITS.notesForArtists} characters).`;
  }
  if ((form.tags || []).length > LIMITS.tags) errors.tags = `Up to ${LIMITS.tags} tags.`;

  if (data.referenceLinks.length > LIMITS.referenceLinks) {
    errors.referenceLinks = `Up to ${LIMITS.referenceLinks} reference links.`;
  }
  (form.referenceLinks || []).forEach((link, i) => {
    const url = String(link.url || '').trim();
    const label = String(link.label || '').trim();
    const note = String(link.note || '').trim();
    if (!url && !label && !note) return;
    if (!url) errors[`referenceLinks.${i}`] = 'Add the link, or remove this row.';
    else if (!isReferenceUrl(url)) errors[`referenceLinks.${i}`] = 'Links need to start with http:// or https://';
    else if (url.length > 500) errors[`referenceLinks.${i}`] = 'That link is too long.';
    else if (label.length > LIMITS.linkLabel) errors[`referenceLinks.${i}`] = `Keep the label under ${LIMITS.linkLabel} characters.`;
    else if (note.length > LIMITS.linkNote) errors[`referenceLinks.${i}`] = `Keep the comment under ${LIMITS.linkNote} characters.`;
  });

  return errors;
}
