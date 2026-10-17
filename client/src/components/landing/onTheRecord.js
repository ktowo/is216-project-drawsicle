// The "On the record" quote on the landing page: a real public post, quoted word for word.
// Shown in production only once the author has agreed (permission: true). Highlighted parts are
// wrapped in [[double brackets]].
export const ON_THE_RECORD = {
  permission: false,
  date: '2025-05-08',
  headline: "An exchange organiser on why they'll never run one again.",
  author: 'u/carceryvale',
  platform: 'Reddit',
  community: 'r/AO3',
  title: "Why I'm NEVER joining a secret Santa/art exchange AGAIN",
  url: 'https://www.reddit.com/r/AO3/comments/1khumsi/why_im_never_joining_a_secret_santaart_exchange/',
  paragraphs: [
    'I became the one reaching out to participants for partner assignments, [[dealing with those who dropped out, and finding others to step in.]]',
    'In the midst of all this—[[matching partners, tracking down participants, and keeping meticulous notes]] while juggling school—I received nothing in return.',
  ],
};

// "plain [[marked]] plain" → [{ text, mark }]
export function splitHighlights(paragraph) {
  return paragraph
    .split(/(\[\[.*?\]\])/)
    .filter(Boolean)
    .map((part) => (part.startsWith('[[') ? { text: part.slice(2, -2), mark: true } : { text: part, mark: false }));
}
