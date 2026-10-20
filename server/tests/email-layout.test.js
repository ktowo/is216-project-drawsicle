// The one Drawsicle email layout (services/email-layout.js): branded HTML plus a plain-text twin.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderEmail } = require('../services/email-layout.js');

const sample = () =>
  renderEmail({
    preheader: 'Sign-ups close in 2 days',
    heading: 'Moth & Lantern <Exchange> closes soon',
    paragraphs: ['Sign-ups close on 24 Oct.', 'Don\'t miss it!'],
    button: { label: 'See the event', url: 'https://drawsicle.app/events/1?a=1&b=2' },
    footer: { text: 'You get these because you watch this event.', linkLabel: 'Email settings', url: 'https://drawsicle.app/notifications' },
  });

test('the HTML is branded and escapes everything people can type', () => {
  const { html } = sample();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, />drawsicle</); // the wordmark, as on the site
  assert.match(html, /Moth &amp; Lantern &lt;Exchange&gt; closes soon/);
  assert.doesNotMatch(html, /<Exchange>/);
  assert.match(html, /Don&#39;t miss it!/);
  assert.match(html, /href="https:\/\/drawsicle\.app\/events\/1\?a=1&amp;b=2"[^>]*>See the event</);
  assert.match(html, /color-scheme/); // readable in dark mode
  assert.match(html, /Sign-ups close in 2 days/); // inbox preview text
});

test('the plain-text twin says the same thing, with the links written out', () => {
  const { text } = sample();
  assert.match(text, /^Moth & Lantern <Exchange> closes soon\n/);
  assert.match(text, /Sign-ups close on 24 Oct\.\n\nDon't miss it!/);
  assert.match(text, /See the event: https:\/\/drawsicle\.app\/events\/1\?a=1&b=2/);
  assert.match(text, /You get these because you watch this event\.\nEmail settings: https:\/\/drawsicle\.app\/notifications/);
  assert.doesNotMatch(text, /&amp;|<a |<p|<\/?(table|td|h1)/); // no HTML left in the text version
});

test('button and footer are optional', () => {
  const { html, text } = renderEmail({ heading: 'Hi', paragraphs: ['Just text.'] });
  assert.doesNotMatch(html, /class="button"/);
  assert.match(text, /^Hi\n\nJust text\.\n/);
});
