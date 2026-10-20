// The one Drawsicle email layout (docs/specs/supabase-auth-email.md, ticket 07): branded HTML that
// survives email apps (tables, inline styles, no images to block), plus a plain-text twin.
//
//   const { html, text } = renderEmail({
//     preheader: 'Shown as the inbox preview',
//     heading: 'You have been matched!',
//     paragraphs: ['Open Drawsicle to see who you are making a gift for.'],
//     button: { label: 'See your match', url },
//     footer: { text: 'Why they got this email.', linkLabel: 'Email settings', url: settingsUrl },
//   });

const INK = '#2f2d2b';
const MUTED = '#6f645b';
const PINK = '#d9467a';
const CREAM = '#fffaf3';
const PAGE = '#f6eee4';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderEmail({ preheader = '', heading, paragraphs = [], button = null, footer = null }) {
  const body = paragraphs
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${INK}" class="body-text">${escapeHtml(p)}</p>`)
    .join('\n');
  const buttonHtml = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="border-radius:12px;background:${PINK}">
<a class="button" href="${escapeHtml(button.url)}" style="display:inline-block;padding:13px 22px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(button.label)}</a>
</td></tr></table>`
    : '';
  const footerHtml = footer
    ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED}" class="muted">${escapeHtml(footer.text)}${
        footer.url ? ` <a href="${escapeHtml(footer.url)}" style="color:${MUTED};text-decoration:underline">${escapeHtml(footer.linkLabel || footer.url)}</a>` : ''
      }</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(heading)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .page { background:#1c1a1f !important; }
    .card { background:#2a262d !important; }
    .body-text, .heading { color:#f3eee8 !important; }
    .muted, .muted a { color:#b3a99e !important; }
  }
  @media (max-width: 520px) { .card { padding:24px 20px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE}" class="page">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${PAGE}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 6px 14px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;color:${PINK}">drawsicle</td></tr>
<tr><td class="card" style="background:${CREAM};border-radius:18px;padding:32px 30px;font-family:Arial,Helvetica,sans-serif">
<h1 class="heading" style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${escapeHtml(heading)}</h1>
${body}
${buttonHtml}
</td></tr>
<tr><td style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif">${footerHtml}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    '',
    ...paragraphs.filter(Boolean).flatMap((p) => [p, '']),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...(footer ? ['--', footer.text, ...(footer.url ? [`${footer.linkLabel || 'Link'}: ${footer.url}`] : [])] : []),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');

  return { html, text };
}

module.exports = { renderEmail, escapeHtml };
