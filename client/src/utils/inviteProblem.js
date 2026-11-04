// Turns the server's invite-code errors into the message shown under the Invite code field on Register.
// The server decides whether a code is needed (admins sign up without one), so the page never checks it first.

const MESSAGES = {
  INVITE_REQUIRED: 'Enter the invite code you were given.',
  INVITE_INVALID: "That invite code isn't valid. Check for typos.",
  INVITE_FULL: 'This invite code has been used up. Ask for a new one.',
};

// Codes are compared the way the server stores them: trimmed and upper case
export const normInvite = (code) => String(code ?? '').trim().toUpperCase();

// The code that was turned down and why, or null when the error isn't about the invite code
export function rejectInvite(errorCode, typedCode) {
  const message = MESSAGES[errorCode];
  return message ? { code: normInvite(typedCode), message } : null;
}

// The message to show while the field still holds the turned-down code; empty once it's been changed
export function inviteFieldError(rejected, typedCode) {
  return rejected && normInvite(typedCode) === rejected.code ? rejected.message : '';
}
