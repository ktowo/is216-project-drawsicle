// Questions for the Help page, grouped. An answer is a list of blocks:
//   'text'                       a paragraph
//   { list: ['a', 'b'] }         bullet points
//   { links: [{ to, label }] }   "Related" links under the answer
// Each group's `id` is also its anchor on the page (/help#matching), and each question's `id`
// is an anchor too (/help#faq-late-gift opens and scrolls to it).

export const FAQ_GROUPS = [
  {
    id: 'artists',
    title: 'For artists',
    intro: 'Joining events, keeping your characters and sending in your gift.',
    items: [
      {
        id: 'faq-need-account',
        q: 'Do I need an account to look around?',
        a: [
          "No. Anyone can browse public events and read their rules. You need an account to sign up for an event, keep a character library or organise your own.",
          { links: [{ to: '/events', label: 'Browse events' }, { to: '/register', label: 'Create an account' }] },
        ],
      },
      {
        id: 'faq-join-event',
        q: 'How do I join an event?',
        a: [
          "Open the event, read the rules and press Sign up while sign-ups are open. The form asks for your community username, what you can make (art, adoptable or writing), what you'd like to receive, which characters you offer, and your likes, things to avoid and anything you can't draw.",
          'Some events need an organiser to approve you. You will see "pending" until they do, and you get a notification when they decide.',
        ],
      },
      {
        id: 'faq-characters',
        q: 'What is the character library?',
        a: [
          "A private list of your characters with references, species, tags and notes for artists. Add a character once, then offer it in any event without pasting links again. You can also add a new character while signing up and save it for later.",
          'Characters that were offered in an event can be archived instead of deleted, so old events still make sense.',
          { links: [{ to: '/characters', label: 'Your character library' }] },
        ],
      },
      {
        id: 'faq-form-terms',
        q: 'What do "can draw", "wants", "likes", "avoid" and "can\'t draw" mean?',
        a: [
          { list: [
            'Can create: the kinds of gift you are happy to make.',
            'Wants: the kinds of gift you would like to receive.',
            'Likes: themes, colours or ideas you would love to see.',
            'Avoid: things you would rather not receive. Artists read these, so be specific.',
            "Can't draw: species or tags you won't draw. Matching never gives you a character with one of these.",
          ] },
          'You can save your answers as defaults in your profile so the next sign-up starts filled in.',
        ],
      },
      {
        id: 'faq-change-application',
        q: 'Can I change or withdraw my sign-up?',
        a: [
          "Yes, while sign-ups are open. Open the event and choose Edit your sign-up to change your answers, or Withdraw to leave. After sign-ups close, ask the organiser if you can't take part.",
        ],
      },
      {
        id: 'faq-find-match',
        q: 'Where do I find out who I am making a gift for?',
        a: [
          'Once the organiser publishes the matches the event becomes active, and you get a notification. Your match page shows your recipient, their characters, what they like and what to avoid.',
          { links: [{ to: '/my-events', label: 'My events' }, { to: '/dashboard', label: 'Dashboard' }] },
        ],
      },
      {
        id: 'faq-submit',
        q: 'How do I submit my gift?',
        a: [
          'Open the event while it is active and choose Submit your gift. Add a title, an optional message, and up to 4 images (PNG, JPG, WebP or GIF, 5 MB each) or links, for example to a longer story or a song. You can replace or remove your submission while the event is still active.',
        ],
      },
      {
        id: 'faq-late-gift',
        q: 'What if I miss the deadline?',
        a: [
          "You can still submit, but the gift is marked as late and organisers can see that. If you know you'll be late, tell the organiser as early as you can. They can often help.",
          { links: [{ to: '/guidelines#deadlines', label: 'Guidelines on deadlines' }] },
        ],
      },
      {
        id: 'faq-reveal',
        q: 'When do I find out who made my gift?',
        a: [
          'When the organiser completes the event. Until then nobody, including your giver, can see that you are paired. After the reveal both of you can see the gift on the results page.',
        ],
      },
    ],
  },
  {
    id: 'organisers',
    title: 'For organisers',
    intro: 'Setting up, running and wrapping up an exchange.',
    items: [
      {
        id: 'faq-create-event',
        q: 'How do I create an event?',
        a: [
          "Choose Create an event, pick a starting template if you like (Secret Santa, Valentine swap, seasonal trade or art trade) and fill in the theme, rules, deadlines, number of participants and the platform where your community talks. The event starts as a draft that only you can see. Press Publish when it's ready to take sign-ups.",
          { links: [{ to: '/events/new', label: 'Create an event' }] },
        ],
      },
      {
        id: 'faq-stages',
        q: 'What do the event stages mean?',
        a: [
          { list: [
            'Draft: only you can see it. Edit as much as you like.',
            'Open: taking sign-ups.',
            'Matching: sign-ups are closed and you generate and review matches.',
            'Active: matches are published and artists are making gifts.',
            'Completed: gifts are revealed and the event stays in everyone\'s history.',
          ] },
          'An open event moves to matching on its own when the sign-up deadline passes. You can also close sign-ups early.',
        ],
      },
      {
        id: 'faq-private',
        q: 'What is the difference between public and private events?',
        a: [
          'Public events show up in the event list and can be found by search. Private events never appear in the list. They can only be opened with the invite link from the event page, or by people who already have a role or sign-up in them.',
          'You can make a new invite code at any time if a link gets shared more widely than you meant.',
        ],
      },
      {
        id: 'faq-approval',
        q: 'Can I approve sign-ups before people are in?',
        a: [
          'Yes. Turn on "require approval" and new sign-ups wait as pending until you accept or reject them from the manage page. Only accepted people are matched. You can change this setting while the event is a draft or open.',
        ],
      },
      {
        id: 'faq-generate',
        q: 'How do I generate and publish matches?',
        a: [
          'When sign-ups have closed and enough artists have been accepted, press Generate matches on the manage page. Look through the list, swap pairs that you want to change and generate again if you like. Nobody sees anything until you press Publish, which starts the gift-making phase and notifies everyone.',
          { links: [{ to: '/help#matching', label: 'How matching works' }] },
        ],
      },
      {
        id: 'faq-co-organisers',
        q: 'Can other people help me organise?',
        a: [
          'Yes. On the manage page you can add another organiser by their email address or username. Organisers can all manage applications, matches and submissions. An event always keeps at least one organiser.',
        ],
      },
      {
        id: 'faq-reuse',
        q: 'Can I reuse an event I ran before?',
        a: [
          'Yes. Duplicate an event to get a new draft with the same settings, description, rules, tags and banner. You pick the new name and dates, and the people are not copied.',
        ],
      },
      {
        id: 'faq-delete-event',
        q: 'Can I delete an event?',
        a: [
          "Yes, from the manage page. This deletes the event with all of its applications, matches and submissions for good, so use it carefully. If an event is simply over, mark it completed instead so everyone keeps their gifts.",
        ],
      },
    ],
  },
  {
    id: 'matching',
    title: 'How matching works',
    intro: 'In plain words: who can be paired, and how the site picks the best pairs.',
    items: [
      {
        id: 'faq-matching-rules',
        q: 'What are the rules every pair has to follow?',
        a: [
          'These are hard rules. If a pair breaks one, it is never made, whatever the score.',
          { list: [
            'Nobody is matched with themselves.',
            'The giver can make at least one kind of gift (art, adoptable or writing) that the recipient wants.',
            "If the recipient offered characters, at least one of them has no species or tag that the giver listed under \"can't draw\".",
          ] },
        ],
      },
      {
        id: 'faq-matching-scores',
        q: 'How are pairs scored?',
        a: [
          'Among the pairs that follow the rules, a higher score means a better fit. A pair scores more when:',
          { list: [
            'more of the kinds of gift the giver can make are ones the recipient wants,',
            'more of the recipient\'s characters are ones the giver is happy to draw,',
            'the giver and recipient share interests in what they like.',
          ] },
          'Scores are only used to choose between possible pairs. They are not a rating of anyone.',
        ],
      },
      {
        id: 'faq-matching-loops',
        q: 'Does everyone give once and receive once?',
        a: [
          'Yes. The site looks for one big loop, where each artist gives to the next and the last gives back to the first, so everyone makes exactly one gift and gets exactly one. It avoids two people just swapping with each other whenever it can.',
          "If one loop isn't possible, it settles for several smaller ones. When it can't place someone at all, it tells the organiser who that was and why, so they can adjust and generate again.",
        ],
      },
      {
        id: 'faq-matching-organiser',
        q: 'Can organisers change the result?',
        a: [
          'Yes. Before publishing, an organiser can swap recipients between two pairs, or generate again for a different arrangement. Each result comes from a seed number, and the same seed always gives the same result, so a re-run is predictable.',
          "Organisers can see every pairing so they can run the event. Artists only see their own recipient, and never who is making their gift.",
        ],
      },
      {
        id: 'faq-matching-fair',
        q: 'Why did I get a particular match?',
        a: [
          "Because your recipient wants something you can make, and none of the characters they offered all clash with things you said you can't draw. Beyond that, the site prefers pairs with more in common. Listing more of what you can create, and being specific about what you can't draw, helps it find a better fit for you.",
        ],
      },
    ],
  },
  {
    id: 'deadlines',
    title: 'Deadlines and reminders',
    intro: 'What happens when, and who gets nudged.',
    items: [
      {
        id: 'faq-reminders',
        q: 'Which reminders are sent?',
        a: [
          { list: [
            'Organisers get a heads-up 48 hours before sign-ups close.',
            'Artists who have not submitted a gift are reminded 72 hours and 24 hours before the submission deadline.',
            'Once the submission deadline passes, organisers are told how many gifts are missing.',
          ] },
          'Each reminder is sent once. Reminders always show in your notification bell. Emails follow your notification settings.',
          { links: [{ to: '/notification', label: 'Notifications' }, { to: '/profile', label: 'Email settings' }] },
        ],
      },
      {
        id: 'faq-deadline-passes',
        q: 'What happens when the sign-up deadline passes?',
        a: [
          'The event moves to matching on its own. You can no longer sign up, edit or withdraw there. The organiser then reviews applications and generates matches.',
        ],
      },
      {
        id: 'faq-calendar',
        q: 'Can I put the deadlines in my calendar?',
        a: [
          'Yes. Event pages have an add to calendar option that downloads a calendar file with the sign-up and submission deadlines, which most calendar apps can open.',
        ],
      },
      {
        id: 'faq-timezone',
        q: 'Which time zone are deadlines in?',
        a: [
          "Dates and times are shown in your device's own time zone. A deadline is the same moment for everybody, it just reads differently depending on where you are, so double-check it if you're travelling.",
        ],
      },
    ],
  },
  {
    id: 'privacy-faq',
    title: 'Privacy of characters and applications',
    intro: 'Short answers. The privacy page has the full list.',
    items: [
      {
        id: 'faq-who-sees-characters',
        q: 'Who can see my characters?',
        a: [
          "Only you can see your library. When you offer a character in an event, the organisers and the one artist making your gift can see it, for that event only. Nobody else can.",
        ],
      },
      {
        id: 'faq-who-sees-application',
        q: 'Who can see my sign-up?',
        a: ['You and the organisers of that event. It is never shown on your public profile.'],
      },
      {
        id: 'faq-who-gifting',
        q: 'Can anyone tell who is making my gift?',
        a: [
          'Not until the event is completed. Organisers see all pairings, because they need them, but they are asked to keep that to themselves until the reveal.',
        ],
      },
      {
        id: 'faq-public-profile',
        q: 'What is on my public profile?',
        a: [
          'Your display name, username, picture, bio, social handles, the month you joined and the public events you organised. Your email address is never shown. You decide what to fill in.',
          { links: [{ to: '/privacy', label: 'Read the privacy page' }, { to: '/profile', label: 'Edit your profile' }] },
        ],
      },
      {
        id: 'faq-delete-account',
        q: 'How do I download or delete my data?',
        a: [
          'In account settings you can download a copy of your data and deactivate your account. Deactivated accounts are anonymised after 30 days.',
          { links: [{ to: '/settings/account', label: 'Account settings' }] },
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    intro: "When something won't work.",
    items: [
      {
        id: 'faq-cant-signup',
        q: "I can't sign up for an event",
        a: [
          'Check these, in order:',
          { list: [
            'Are you logged in? Sign-up needs an account.',
            'Have sign-ups closed? Once the sign-up deadline passes the form is locked.',
            'Is the event full? When it reaches its maximum number of artists, nobody else can join.',
            'Is it private? Private events only open with the organiser\'s invite link. Ask them for it.',
            'Is it still a draft? Drafts are only visible to organisers, so the link will say it was not found.',
            'Was your earlier sign-up rejected? An organiser can change that if it was a mistake.',
          ] },
          'If none of these fit, ask the organiser. They can see your application and its status.',
        ],
      },
      {
        id: 'faq-forgot-password',
        q: 'I forgot my password',
        a: [
          'Use "Forgot password" on the log-in page and enter your email. We send a link that works for one hour. If you usually sign in with Google or Discord, use that button instead.',
          { links: [{ to: '/forgot-password', label: 'Reset my password' }] },
        ],
      },
      {
        id: 'faq-no-reset-email',
        q: "The reset email hasn't arrived",
        a: [
          'Give it a few minutes and look in your spam folder. Check that you used the same address you signed up with. Links expire after an hour, so request a fresh one if it has been a while.',
        ],
      },
      {
        id: 'faq-upload-fails',
        q: "My image won't upload",
        a: [
          'Images must be PNG, JPG, WebP or GIF, up to 5 MB each, with at most 4 per gift. If a photo is too big, export a smaller version first. Other file types are not accepted.',
        ],
      },
      {
        id: 'faq-logged-out',
        q: 'I keep getting logged out',
        a: [
          'Logins last 7 days. Changing your password logs you out on other devices. If it happens more often, check that your browser allows cookies for this site.',
        ],
      },
      {
        id: 'faq-deactivated',
        q: 'I deactivated my account by mistake',
        a: [
          'Log in again within 30 days and your account is restored. Sign-ups that were withdrawn while it was deactivated are not brought back, so join those events again if they are still open.',
          { links: [{ to: '/login', label: 'Log in' }] },
        ],
      },
      {
        id: 'faq-something-else',
        q: "Something else is wrong",
        a: [
          'For anything about a particular event, talk to its organisers first. For a problem with the site, contact the Drawsicle team through whoever shared the link with you, and mention what you were doing and what you saw.',
          { links: [{ to: '/guidelines#reporting', label: 'Reporting a problem' }] },
        ],
      },
    ],
  },
];

// All words in a question, answer and group title, lower case, for the search box
export function searchText(group, item) {
  const parts = [group.title, item.q];
  for (const block of item.a) {
    if (typeof block === 'string') parts.push(block);
    else if (block.list) parts.push(...block.list);
    else if (block.links) parts.push(...block.links.map((l) => l.label));
  }
  return parts.join(' ').toLowerCase();
}

// Groups with only the questions containing every search word
export function filterFaqs(groups, query) {
  const terms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const text = searchText(group, item);
        return terms.every((t) => text.includes(t));
      }),
    }))
    .filter((group) => group.items.length);
}
