// A rough guide to how hard a password is to guess, for the meter under new-password fields.
// It only advises: the server's one rule is 8-128 characters.

export const PASSWORD_MIN = 8;

// Passwords that top every leaked-password list (and this site's name), checked whole or as the base
const COMMON = [
  'password',
  '12345678',
  '123456789',
  'qwertyui',
  'qwerty123',
  'iloveyou',
  'letmein1',
  'abcdefgh',
  'drawisicle',
  '11111111',
  'sunshine',
  'princess',
];

function looksCommon(password) {
  const lower = password.toLowerCase();
  const base = lower.replace(/[^a-z]+$/, '').replace(/^[^a-z]+/, '');
  return COMMON.some((word) => lower === word || base === word);
}

// Same character over and over, or a straight run like "abcd1234"
function isRepetitive(password) {
  if (/^(.)\1+$/.test(password)) return true;
  let runs = 0;
  for (let i = 1; i < password.length; i++) {
    if (password.charCodeAt(i) - password.charCodeAt(i - 1) === 1) runs++;
  }
  return runs >= password.length - 2;
}

// -> { score: 0-4, label, tip }. 0 means too short to use at all.
export function passwordStrength(password = '') {
  if (password.length < PASSWORD_MIN) {
    return { score: 0, label: 'Too short', tip: `Use at least ${PASSWORD_MIN} characters.` };
  }
  if (looksCommon(password) || isRepetitive(password)) {
    return { score: 1, label: 'Easy to guess', tip: 'This is a very common password. Try a few unrelated words.' };
  }

  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = 1;
  if (password.length >= 12) score++;
  if (kinds >= 3) score++;
  if (password.length >= 16 || (password.length >= 12 && kinds === 4)) score++;
  score = Math.min(score, 4);

  const labels = { 1: 'Weak', 2: 'Okay', 3: 'Good', 4: 'Strong' };
  const tip =
    score >= 3
      ? ''
      : password.length < 12
        ? 'Longer is better: 12 or more characters, or a short phrase.'
        : 'Mix in capitals, numbers or symbols, or make it a bit longer.';
  return { score, label: labels[score], tip };
}
