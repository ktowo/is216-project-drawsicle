// Questions a secret artist asks the person they're making a gift for ("do you prefer warm or
// cool colours?"). The recipient answers without ever learning who asked; the asker sees the
// answer. Shared by the server (match-router.js) and the demo so both check them the same way.
//
//   readQuestion('  Warm or cool colours? ')  -> { text: 'Warm or cool colours?' }
//   askingProblem(match.questions)            -> '' when another question may be asked

export const GIFT_QUESTIONS = {
  textMax: 300,
  answerMax: 600,
  perMatch: 10, // questions in all, for one gift
  waiting: 3, // unanswered at once
};

// Tidy what someone wrote: trimmed, no control characters, at most two blank lines in a row
function tidy(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function readQuestion(value) {
  const text = tidy(value);
  if (text.length < 3) return { error: 'Write your question first.' };
  if (text.length > GIFT_QUESTIONS.textMax) return { error: `Keep it under ${GIFT_QUESTIONS.textMax} characters.` };
  return { text };
}

export function readAnswer(value) {
  const text = tidy(value);
  if (!text) return { error: 'Write your answer first.' };
  if (text.length > GIFT_QUESTIONS.answerMax) return { error: `Keep it under ${GIFT_QUESTIONS.answerMax} characters.` };
  return { text };
}

// Why another question can't be asked yet ('' when it can)
export function askingProblem(questions = []) {
  if (questions.length >= GIFT_QUESTIONS.perMatch) {
    return `You've asked ${GIFT_QUESTIONS.perMatch} questions for this gift, which is the most there can be.`;
  }
  if (questions.filter((q) => !q.answer).length >= GIFT_QUESTIONS.waiting) {
    return `Wait for an answer first: ${GIFT_QUESTIONS.waiting} of your questions are still waiting.`;
  }
  return '';
}

// What either side sees: never who asked
export function questionJson(q) {
  return {
    id: String(q._id ?? q.id),
    text: q.text,
    askedAt: q.askedAt,
    answer: q.answer || '',
    answeredAt: q.answeredAt || null,
  };
}
