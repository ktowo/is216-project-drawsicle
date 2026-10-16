import { LIMITS, normalizeTags } from '@shared/constants.mjs';

// Helpers for the character form (CharacterFields) used by the library and the event sign-up page.

const URL_RE = /^https?:\/\/\S+$/i;

export function isHttpUrl(value) {
  return URL_RE.test(String(value ?? '').trim());
}

// Blank form value for <CharacterFields v-model="...">
export function emptyCharacter() {
  return { name: '', species: '', tags: [], description: '', referenceLinks: [], notesForArtists: '', contentWarnings: [] };
}

// Character from the API -> form value (copies arrays so edits don't touch the original)
export function characterToForm(character) {
  const c = character || {};
  return {
    name: c.name || '',
    species: c.species || '',
    tags: [...(c.tags || [])],
    description: c.description || '',
    referenceLinks: (c.referenceLinks || []).map((l) => ({ label: l.label || '', url: l.url || '' })),
    notesForArtists: c.notesForArtists || '',
    contentWarnings: [...(c.contentWarnings || [])],
  };
}

// Form value -> request body. Empty link rows are dropped.
export function characterPayload(form) {
  return {
    name: String(form.name || '').trim(),
    species: String(form.species || '').trim(),
    tags: normalizeTags(form.tags || []),
    description: String(form.description || '').trim(),
    referenceLinks: (form.referenceLinks || [])
      .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url || '').trim() }))
      .filter((l) => l.url || l.label),
    notesForArtists: String(form.notesForArtists || '').trim(),
    contentWarnings: [...new Set(form.contentWarnings || [])],
  };
}

// Returns { field: message } (empty object when valid). Link rows use keys like "referenceLinks.0".
export function validateCharacter(form) {
  const errors = {};
  const data = characterPayload(form);

  if (!data.name) errors.name = 'Give your character a name.';
  else if (data.name.length > LIMITS.characterName) errors.name = `Keep the name under ${LIMITS.characterName} characters.`;

  if (data.species.length > LIMITS.species) errors.species = `Keep this under ${LIMITS.species} characters.`;
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
    if (!url && !label) return;
    if (!url) errors[`referenceLinks.${i}`] = 'Add the link, or remove this row.';
    else if (!isHttpUrl(url)) errors[`referenceLinks.${i}`] = 'Links need to start with http:// or https://';
    else if (url.length > 500) errors[`referenceLinks.${i}`] = 'That link is too long.';
    else if (label.length > 60) errors[`referenceLinks.${i}`] = 'Keep the label under 60 characters.';
  });

  return errors;
}
