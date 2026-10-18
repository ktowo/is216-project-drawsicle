import { CHARACTER_DETAILS, moreCharacters } from './demo-characters.mjs';
import { SIGNUP_RESPONSES } from './demo-signups.mjs';
// Demo accounts, characters and events. Used by server/scripts/seed.js (local database)
// and by the in-browser mock API (client/src/mock), so both show the same little world.
// Records point at each other by `key`; each side swaps keys for real ids when it loads them.
// Every date is relative to `now`, so deadlines look fresh after a reset.

export const DEMO_PASSWORD = 'drawsicle123';
export const DEMO_LOGIN_EMAIL = 'mika@demo.test';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ref = (owner, slug, label = 'Reference sheet') => ({ label, url: `https://example.com/refs/${owner}/${slug}` });

export function buildDemoData(now = new Date()) {
  const base = new Date(now).getTime();
  // A moment `days` from now (negative = in the past)
  const ago = (days, hours = 0) => new Date(base - days * DAY - hours * HOUR);
  // Deadlines land on 23:59 of the day, which reads better than "20:42:17"
  const deadline = (days) => {
    const d = new Date(base + days * DAY);
    d.setHours(23, 59, 0, 0);
    return d;
  };

  const users = [
    {
      key: 'mika',
      // Public artist tags (shared/taste.mjs), as if they'd taken the Find your style quiz
      artistTags: { makes: ['art', 'writing'], themes: ['fantasy', 'cosy', 'animals', 'cute'], activity: 'seasonal', cardColor: 'rose' },
      // Happy for gifts they made or received to show on public profiles
      profilePrivacy: { showExchanges: true, showGifts: true },
      displayName: 'Mika',
      bio: 'Pastel painter and the person behind most of our seasonal exchanges. Dragons, cats and soft lighting. Open for gift art year-round, and always happy to be a backup gifter.',
      socials: { instagram: 'mika.draws', bluesky: 'mika', discord: 'mika.draws' },
      defaultForm: {
        communityUsername: 'mika.draws',
        canCreate: ['art', 'writing'],
        wantsTypes: ['art'],
        likes: 'Cosy scenes, warm lighting, pastel colours, sleepy creatures.',
        avoid: 'Gore and horror, please.',
        cannotDraw: ['mecha'],
      },
    },
    {
      key: 'sol',
      // Public artist tags (shared/taste.mjs), as if they'd taken the Find your style quiz
      artistTags: { makes: ['art'], themes: ['adventure', 'fantasy', 'nature'], activity: 'seasonal', cardColor: 'coral' },
      // Happy for gifts they made or received to show on public profiles
      profilePrivacy: { showExchanges: true, showGifts: true },
      displayName: 'Sol',
      bio: 'Mostly digital, mostly foxes. I also make the odd adoptable batch when I have time. Commissions closed, exchanges always open.',
      socials: { twitter: 'solstice_fox', deviantart: 'solstice-fox', discord: 'solstice_fox' },
      defaultForm: {
        communityUsername: 'solstice_fox',
        canCreate: ['art', 'adoptable'],
        wantsTypes: ['art', 'adoptable'],
        likes: 'Dynamic poses, sunsets, anything with fire or embers.',
        avoid: 'Very dark themes.',
        cannotDraw: ['robot', 'mecha'],
      },
    },
    {
      key: 'juniper',
      profilePrivacy: { showExchanges: true, showGifts: true },
      // Public artist tags (shared/taste.mjs), as if they'd taken the Find your style quiz
      artistTags: { makes: ['art', 'writing'], themes: ['spooky', 'nature', 'mythology'], activity: 'casual', cardColor: 'lavender' },
      displayName: 'Juniper',
      bio: 'I draw moths and write short stories about them. Organiser of the Spring Bloom Exchange and a regular at every lantern-lit event after it.',
      socials: { bluesky: 'juniper', tumblr: 'juniper-moth', discord: 'juniper.moth' },
      defaultForm: {
        communityUsername: 'juniper.moth',
        canCreate: ['art', 'writing'],
        wantsTypes: ['writing', 'art'],
        likes: 'Night scenes, lanterns, gentle stories.',
        avoid: 'Jump scares.',
        cannotDraw: ['mecha'],
      },
    },
    {
      key: 'ash',
      // Public artist tags (shared/taste.mjs), as if they'd taken the Find your style quiz
      artistTags: { makes: ['art'], themes: ['sci_fi', 'creatures'], activity: 'casual', cardColor: 'sky' },
      displayName: 'Ash',
      bio: 'Sci-fi nerd. Robots, dragons and big chunky line art. I keep a running list of city backgrounds I want to draw next.',
      socials: { twitter: 'ash_unit7', toyhouse: 'ash-unit7', discord: 'ash_unit7' },
      defaultForm: {
        communityUsername: 'ash_unit7',
        canCreate: ['art'],
        wantsTypes: ['art'],
        likes: 'Neon colours, city backgrounds, mechanical details.',
        avoid: 'Overly cute chibi styles.',
        cannotDraw: ['slime'],
      },
    },
    {
      key: 'remy',
      profilePrivacy: { showExchanges: true, showGifts: true },
      // Public artist tags (shared/taste.mjs), as if they'd taken the Find your style quiz
      artistTags: { makes: ['art', 'adoptable'], themes: ['food', 'cute', 'creatures'], activity: 'seasonal', cardColor: 'butter' },
      displayName: 'Remy',
      bio: 'Adoptable designer. Slimes, sweets and pastel everything. New batches land whenever the snack drawer is full.',
      socials: { instagram: 'remy.gloop', toyhouse: 'remygloop', discord: 'remy.gloop' },
      defaultForm: {
        communityUsername: 'remy.gloop',
        canCreate: ['adoptable', 'art'],
        wantsTypes: ['adoptable', 'art'],
        likes: 'Candy colours, food themes, bouncy shapes.',
        avoid: 'Realistic gore.',
        cannotDraw: ['humanoid'],
      },
    },
    {
      key: 'noor',
      profilePrivacy: { showExchanges: true, showGifts: true },
      // Public artist tags (shared/taste.mjs), as if they'd taken the Find your style quiz
      artistTags: { makes: ['writing'], themes: ['mythology', 'adventure', 'nature'], activity: 'casual', cardColor: 'sage' },
      // Helps the admins: reviews reports and museum chat
      role: 'moderator',
      displayName: 'Noor',
      bio: 'Writer and hobby composer. I turn characters into short stories and little piano pieces.',
      socials: { bluesky: 'noor', tumblr: 'noor-writes', discord: 'noor.writes' },
      defaultForm: {
        communityUsername: 'noor.writes',
        canCreate: ['writing'],
        wantsTypes: ['art', 'writing'],
        likes: 'Birds, travel, golden-hour light.',
        avoid: 'Romance.',
        cannotDraw: [],
      },
    },
    {
      key: 'kit',
      // Public artist tags (shared/taste.mjs), as if they'd taken the Find your style quiz
      artistTags: { makes: ['art'], themes: ['cosy', 'creatures', 'spooky'], activity: 'seasonal', cardColor: 'peach' },
      // Happy for gifts they made or received to show on public profiles
      profilePrivacy: { showExchanges: true, showGifts: true },
      displayName: 'Kit',
      bio: 'Moth enthusiast and organiser of the Moth & Lantern Exchange. I collect lantern designs and cosy autumn evenings.',
      socials: { instagram: 'kit.lantern', tumblr: 'kit-lantern', discord: 'kit.lantern' },
      defaultForm: {
        communityUsername: 'kit.lantern',
        canCreate: ['art'],
        wantsTypes: ['art', 'writing'],
        likes: 'Lanterns, fireflies, cosy autumn evenings.',
        avoid: 'Nothing in particular.',
        cannotDraw: ['mecha', 'robot'],
      },
    },
    {
      key: 'pip',
      profilePrivacy: { showExchanges: true, showGifts: true },
      displayName: 'Pip',
      bio: 'New to exchanges! Doodles, tiny animals and chiptune music.',
      socials: { twitter: 'pipsqueak', bluesky: 'pipsqueak', discord: 'pipsqueak' },
      defaultForm: {
        communityUsername: 'pipsqueak',
        canCreate: ['art'],
        wantsTypes: ['art'],
        likes: 'Tiny animals, snacks, bright colours.',
        avoid: 'Spiders.',
        cannotDraw: ['humanoid'],
      },
    },
    // The Museum Club: six artists whose finished exchanges hang in the sample museum wings,
    // one for each room design. All of them are happy to show their gifts publicly.
    ...[
      {
        key: 'pia',
        displayName: 'Pia',
        bio: 'Pastel florals and cherry blossom everything. I host the Petal Post Swap, our cosiest postcard exchange.',
        socials: { instagram: 'pia.petals', discord: 'pia.petals' },
        likes: 'Flowers, picnics, soft pinks.',
      },
      {
        key: 'luna',
        displayName: 'Luna',
        bio: 'Watercolour moons, sleepy owls and quiet night skies. I run the Midnight Lantern Gallery and never say no to stargazing.',
        socials: { instagram: 'luna.moonwash', bluesky: 'luna-moon' },
        likes: 'Night skies, lanterns, owls.',
      },
      {
        key: 'otto',
        displayName: 'Otto',
        bio: 'Greenhouse gremlin. I paint plants, frogs and tiny ceramic pots, and organise the Greenhouse Doodle Swap.',
        socials: { tumblr: 'otto-greens', discord: 'otto.greens' },
        likes: 'Plants, frogs, rainy windows.',
      },
      {
        key: 'bea',
        displayName: 'Bea',
        bio: 'Letters, lavender and lettering. I mix calligraphy into my illustrations and host the Lavender Letters Exchange.',
        socials: { instagram: 'bea.letters', deviantart: 'bea-letters' },
        likes: 'Handwritten notes, lavender, old stamps.',
      },
      {
        key: 'rio',
        displayName: 'Rio',
        bio: 'Golden-hour landscapes and beach cats. Usually painting outside, always chasing the warm evening light.',
        socials: { twitter: 'rio_sunsets', bluesky: 'rio-sun' },
        likes: 'Sunsets, the seaside, warm colours.',
      },
      {
        key: 'vera',
        displayName: 'Vera',
        bio: 'Minimal ink drawings and a proper gallery nerd. I curate the White Cube Mini Show: bold shapes and lots of space.',
        socials: { instagram: 'vera.ink', tumblr: 'vera-ink' },
        likes: 'Bold shapes, black and red, clean lines.',
      },
    ].map(({ likes, ...u }) => ({
      ...u,
      profilePrivacy: { showExchanges: true, showGifts: true },
      defaultForm: {
        communityUsername: u.key,
        canCreate: ['art'],
        wantsTypes: ['art'],
        likes,
        avoid: 'Nothing in particular.',
        cannotDraw: [],
      },
    })),
    {
      // Site admin for trying the admin tools; not part of any event
      key: 'ada',
      role: 'admin',
      displayName: 'Ada (site admin)',
      bio: 'Keeps Drawsicle tidy: moderates events and helps with account problems.',
      socials: { discord: 'ada_admin', bluesky: 'ada-admin' },
      defaultForm: { communityUsername: 'ada_admin', canCreate: ['art'], wantsTypes: ['art'], likes: '', avoid: '', cannotDraw: [] },
    },
  ].map((u) => ({ ...u, email: `${u.key}@demo.test`, username: u.key, role: u.role || 'user' }));

  // ---------- The OC Secret Santa crowd ----------
  // 192 people signed up to a real community Secret Santa with these answers (shared/demo-signups.mjs:
  // names made up, links swapped for the demo's own reference pictures). Each gets an account, a
  // character library from what they offered, and a sign-up for the OC Secret Santa below.
  const KIND_WORDS = { humanoid: 'humans and humanoids', anthro: 'anthros', feral: 'ferals' };
  const listWords = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] || '');
  const crowd = SIGNUP_RESPONSES.map((s) => {
    const drawsAll = s.draws.length === 3;
    const bio = [
      drawsAll ? 'Happy to draw anything: humans, anthros and ferals.' : `Draws ${listWords(s.draws.map((k) => KIND_WORDS[k]))}.`,
      s.wants.includes('adoptable') && s.wants.includes('art') ? 'Hoping for art or an adopt this season.' : s.wants.includes('adoptable') ? 'Here for the adopts.' : 'Here for the art.',
      s.backup === 'yes' ? 'Always up for being a backup artist.' : 'OCs live on my Toyhouse.',
    ].join(' ');
    return {
      key: s.username,
      community: true,
      displayName: s.displayName,
      bio,
      socials: { toyhouse: s.toyhouse, discord: s.username.replace(/_/g, '.') },
      profilePrivacy: { showExchanges: true, showGifts: false },
      defaultForm: {
        communityUsername: s.toyhouse,
        canCreate: ['art', 'adoptable'],
        wantsTypes: [...s.wants],
        likes: s.wantNote,
        adoptWishlist: s.adopt,
        avoid: '',
        cannotDraw: [...s.cannotDraw],
      },
      email: `${s.username}@demo.test`,
      username: s.username,
      role: 'user',
    };
  });
  users.push(...crowd);

  const character = (owner, key, name, species, tags, description, notesForArtists, links, archived = false) => ({
    key,
    owner,
    name,
    species,
    tags,
    description,
    referenceLinks: links,
    notesForArtists,
    archived,
  });

  const characters = [
    character('mika', 'biscuit', 'Biscuit', 'Dragon', ['scaly', 'pastel', 'fantasy', 'feral'],
      'A small cream-coloured dragon who hoards teacups instead of gold. Very sleepy, very soft.',
      'Pink belly scales, a chipped left horn. Any size is fine.',
      [ref('mika', 'biscuit', 'Toyhou.se profile'), ref('mika', 'biscuit-sheet')]),
    character('mika', 'pocket', 'Pocket', 'Cat', ['fluffy', 'anthro', 'pastel'],
      'A tailor cat who keeps sewing needles in an oversized cardigan.',
      'Always wears the mustard cardigan. Heterochromia: blue left eye, green right eye.',
      [ref('mika', 'pocket')]),
    character('mika', 'captain', 'Captain Comet', 'Human', ['humanoid', 'fantasy'],
      'An old sky-pirate design from a few years ago.',
      'Retired for now.',
      [ref('mika', 'captain-comet')], true),

    character('sol', 'ember', 'Ember', 'Fox', ['fluffy', 'feral', 'fantasy'],
      'A fire fox whose tail tip glows when she is happy.',
      'Tail flame is orange to pale yellow. Three white socks.',
      [ref('sol', 'ember', 'Toyhou.se profile')]),
    character('sol', 'sunny', 'Sunny', 'Bird', ['feathered', 'pastel'],
      'A cheerful sunbird courier who delivers letters at dawn.',
      'Tiny satchel always on the right side.',
      [ref('sol', 'sunny')]),

    character('juniper', 'lumen', 'Lumen', 'Moth', ['fluffy', 'anthro', 'fantasy'],
      'A lamplighter moth who looks after the lanterns in the old town.',
      'Big fluffy collar, pale green wings with eye spots.',
      [ref('juniper', 'lumen', 'Toyhou.se profile'), ref('juniper', 'lumen-story', 'Story (Google Doc)')]),
    character('juniper', 'wren', 'Wren', 'Human', ['humanoid', 'fantasy'],
      'A cartographer who maps places that only exist at night.',
      'Freckles, round glasses, ink-stained fingers.',
      [ref('juniper', 'wren')]),

    character('ash', 'unit7', 'Unit 7', 'Robot', ['mecha', 'humanoid'],
      'A retired maintenance robot who now tends a rooftop garden.',
      'Chipped teal paint, one antenna bent.',
      [ref('ash', 'unit-7')]),
    character('ash', 'cinder', 'Cinder', 'Dragon', ['scaly', 'feral'],
      'A charcoal dragon with glowing cracks along its back.',
      'The glow is ember orange, not red.',
      [ref('ash', 'cinder', 'Toyhou.se profile')]),

    character('remy', 'gloop', 'Gloop', 'Slime', ['pastel', 'fantasy'],
      'A strawberry milk slime who absorbs whatever snack is nearby.',
      'Translucent pink with floating sprinkles inside.',
      [ref('remy', 'gloop')]),
    character('remy', 'marzipan', 'Marzipan', 'Cat', ['fluffy', 'feral'],
      'A round bakery cat. Mostly loaf-shaped.',
      'Calico pattern: check the sheet for patch placement.',
      [ref('remy', 'marzipan', 'Toyhou.se profile')]),

    character('noor', 'saffron', 'Saffron', 'Bird', ['feathered', 'fantasy'],
      'A golden heron who travels between desert oases.',
      'Long legs, gold-tipped feathers, a small brass bell on one ankle.',
      [ref('noor', 'saffron')]),
    character('noor', 'idris', 'Idris', 'Human', ['humanoid'],
      'A travelling musician who collects songs from every town he visits.',
      'Carries an oud on his back. Warm brown skin, short curly hair.',
      [ref('noor', 'idris', 'Character notes (Google Doc)')]),

    character('kit', 'lantern', 'Lantern', 'Moth', ['fluffy', 'pastel', 'anthro'],
      'A rosy maple moth who runs a tiny tea stall at night.',
      'Pink and yellow, very fluffy antennae.',
      [ref('kit', 'lantern', 'Toyhou.se profile')]),
    character('kit', 'fennec', 'Fennec', 'Fox', ['fluffy', 'anthro'],
      'A desert fox librarian with enormous ears.',
      'Round spectacles, green scarf.',
      [ref('kit', 'fennec')]),

    character('pip', 'pipsqueak', 'Pipsqueak', 'Mouse', ['fluffy', 'feral'],
      'A field mouse who is always carrying one blueberry.',
      'Tiny! Light brown with a white tummy.',
      [ref('pip', 'pipsqueak')]),
    character('pip', 'tin', 'Tin', 'Robot', ['mecha', 'pastel'],
      'A wind-up toy robot that plays chiptune when you turn its key.',
      'Mint green body, pink key on the back.',
      [ref('pip', 'tin')]),

    // The Museum Club's characters
    character('pia', 'petal', 'Petal', 'Rabbit', ['fluffy', 'pastel', 'feral'],
      'A lop-eared rabbit who delivers the spring post on a tiny bicycle.',
      'Pink ears, a satchel full of postcards.',
      [ref('pia', 'petal')]),
    character('luna', 'hoot', 'Hoot', 'Owl', ['feathered', 'feral'],
      'A sleepy barn owl who only wakes up for lanterns and meteor showers.',
      'Cream face, one feather always sticking up.',
      [ref('luna', 'hoot')]),
    character('otto', 'sprout', 'Sprout', 'Frog', ['feral', 'pastel'],
      'A tree frog who lives in a teacup on the greenhouse shelf.',
      'Bright green, wears a leaf as a hat.',
      [ref('otto', 'sprout')]),
    character('bea', 'quill', 'Quill', 'Hedgehog', ['fluffy', 'feral'],
      'A hedgehog postmaster with ink on every paw.',
      'Lavender scarf, tiny round glasses.',
      [ref('bea', 'quill')]),
    character('rio', 'mango', 'Mango', 'Cat', ['fluffy', 'feral'],
      'An orange beach cat who naps on the warmest rock at sunset.',
      'Ginger tabby, white socks, very round.',
      [ref('rio', 'mango')]),
    character('vera', 'dot', 'Dot', 'Penguin', ['feathered', 'feral'],
      'A small penguin who only ever wears black, white and one red scarf.',
      'Keep the palette to black, white and red if you can.',
      [ref('vera', 'dot')]),
  ];

  // Pronouns, colours, folders and screen pets, plus everyone's bigger library (demo-characters.mjs)
  for (const c of characters) Object.assign(c, { pet: { shown: false, kind: '', palette: '' } }, CHARACTER_DETAILS[c.key] || {});
  characters.push(...moreCharacters());

  // What the OC Secret Santa crowd offered: one character per link they gave, the comment they
  // wrote beside it kept with the link
  const crowdCharacters = new Map(); // username -> character keys
  SIGNUP_RESPONSES.forEach((s) => {
    const keys = s.characters.map((c, k) => {
      const key = `${s.username}-${k + 1}`;
      characters.push({
        key,
        owner: s.username,
        name: c.name,
        species: c.species,
        tags: [c.kind],
        description: c.description,
        referenceLinks: c.links.map((l) => ({ label: l.label, url: l.url, note: l.note })),
        notesForArtists: '',
        archived: false,
        folder: 'Secret Santa',
        pet: { shown: false, kind: '', palette: '' },
      });
      return key;
    });
    crowdCharacters.set(s.username, keys);
  });

  const ALL_TYPES = ['art', 'adoptable', 'writing'];
  const event = (fields) => ({
    description: '',
    theme: '',
    season: 'other',
    rules: '',
    tags: [],
    platform: 'discord',
    platformName: '',
    platformLink: '',
    minParticipants: 3,
    maxParticipants: 30,
    allowedTypes: ALL_TYPES,
    publicity: 'public',
    requireApproval: false,
    banner: null,
    publishedAt: null,
    completedAt: null,
    ...fields,
    organizers: fields.organizers || [fields.createdBy],
  });

  const events = [
    event({
      key: 'winter',
      status: 'open',
      createdBy: 'mika',
      name: 'Winter Secret Santa 2026',
      description:
        'Our yearly Secret Santa! Sign up with the characters you would love to see drawn, and you will be matched with someone whose characters you can draw. Gifts are revealed together in January.',
      theme: 'Cosy winter nights',
      season: 'christmas',
      rules:
        'Finished, coloured pieces only (no sketches).\nBe kind in the channel.\nIf you need more time, tell an organiser before the deadline.',
      tags: ['secret santa', 'winter', 'cosy'],
      platformName: 'Cosy Critters Discord',
      platformLink: 'https://example.com/communities/cosy-critters',
      signupDeadline: deadline(10),
      submissionDeadline: deadline(45),
      minParticipants: 3,
      maxParticipants: 40,
      inviteCode: 'wintr-26-snow',
      banner: { seed: 'winter-secret-santa', title: 'Winter Secret Santa 2026' },
    }),
    event({
      key: 'ocsanta',
      status: 'open',
      createdBy: 'mika',
      name: 'OC Secret Santa 2026',
      description:
        "A big community Secret Santa for original characters. Sign up with your OCs or an adopt wishlist, and you'll be matched with someone whose characters you're happy to draw. Backup artists step in if anyone drops out.",
      theme: 'Gifts for our OCs',
      season: 'christmas',
      rules:
        "Art or an adoptable, whichever your match asked for.\nOnly draw the characters and folders your match pointed you to.\nNo NSFW. If you can't finish, tell an organiser early so a backup artist can help.",
      tags: ['secret santa', 'ocs', 'adopts'],
      platform: 'toyhouse',
      platformName: 'Toyhouse OC community',
      platformLink: 'https://toyhou.se/~browse/recent',
      signupDeadline: deadline(8),
      submissionDeadline: deadline(42),
      minParticipants: 3,
      maxParticipants: 250,
      allowedTypes: ['art', 'adoptable'],
      inviteCode: 'oc-santa-26',
      banner: { seed: 'oc-secret-santa', title: 'OC Secret Santa 2026' },
    }),
    event({
      key: 'valentine',
      status: 'draft',
      createdBy: 'mika',
      name: 'Valentine Doodle Swap',
      description: 'A small, low-pressure doodle swap for February. Sketches welcome!',
      theme: 'Friendship and sweets',
      season: 'valentine',
      rules: 'Sketches and doodles are fine.',
      tags: ['doodles', 'valentine'],
      platformName: 'Cosy Critters Discord',
      platformLink: 'https://example.com/communities/cosy-critters',
      signupDeadline: deadline(100),
      submissionDeadline: deadline(125),
      minParticipants: 3,
      maxParticipants: 20,
      allowedTypes: ['art', 'writing'],
      inviteCode: 'vday-doodle-7',
      banner: { seed: 'valentine-doodle-swap', title: 'Valentine Doodle Swap' },
    }),
    event({
      key: 'moth',
      status: 'open',
      createdBy: 'kit',
      name: 'Moth & Lantern Exchange',
      description:
        'An autumn exchange for moth lovers and everyone who likes glowing things in the dark. Art and short stories welcome.',
      theme: 'Lanterns in the dark',
      season: 'halloween',
      rules: 'Applications are reviewed by Kit. At least one moth or lantern in the piece!',
      tags: ['moths', 'lanterns', 'autumn'],
      platform: 'deviantart',
      platformName: 'Moth Appreciation Group',
      platformLink: 'https://example.com/groups/moth-appreciation',
      signupDeadline: deadline(6),
      submissionDeadline: deadline(34),
      minParticipants: 3,
      maxParticipants: 12,
      allowedTypes: ['art', 'writing'],
      requireApproval: true,
      inviteCode: 'moth-lantern-x',
      banner: { seed: 'moth-lantern', title: 'Moth & Lantern Exchange' },
    }),
    event({
      key: 'studio',
      status: 'open',
      createdBy: 'mika',
      name: 'Studio Club Swap',
      description: 'A private swap for the Thursday studio club. Ask Mika for the link.',
      theme: 'Our favourite places',
      season: 'other',
      rules: 'Members only.',
      tags: ['club'],
      platform: 'other',
      platformName: 'Thursday studio club',
      signupDeadline: deadline(14),
      submissionDeadline: deadline(40),
      minParticipants: 2,
      maxParticipants: 10,
      allowedTypes: ['art'],
      publicity: 'private',
      inviteCode: 'demo-invite',
      banner: null,
    }),
    event({
      key: 'summer',
      status: 'matching',
      createdBy: 'mika',
      name: 'Summer Splash Swap',
      description: 'Beaches, ice cream and long evenings. Sign-ups have closed and matches are being prepared.',
      theme: 'Seaside holidays',
      season: 'summer',
      rules: 'Any medium. Please post a work-in-progress in the channel by the halfway point.',
      tags: ['summer', 'beach'],
      platformName: 'Cosy Critters Discord',
      platformLink: 'https://example.com/communities/cosy-critters',
      signupDeadline: deadline(-2),
      submissionDeadline: deadline(25),
      minParticipants: 4,
      maxParticipants: 30,
      inviteCode: 'summer-splash',
      banner: { seed: 'summer-splash', title: 'Summer Splash Swap' },
    }),
    event({
      key: 'autumn',
      status: 'active',
      createdBy: 'mika',
      name: 'Autumn Leaves Art Trade',
      description: 'Falling leaves, warm drinks and scarves. Everyone has their match: time to create!',
      theme: 'Autumn walks',
      season: 'autumn',
      rules: 'Finished pieces only. Writing gifts should be at least 500 words.',
      tags: ['autumn', 'art trade'],
      platformName: 'Cosy Critters Discord',
      platformLink: 'https://example.com/communities/cosy-critters',
      signupDeadline: deadline(-20),
      submissionDeadline: deadline(5),
      minParticipants: 3,
      maxParticipants: 25,
      allowedTypes: ['art', 'adoptable', 'writing'],
      inviteCode: 'autumn-leaves',
      banner: { seed: 'autumn-leaves', title: 'Autumn Leaves Art Trade' },
      publishedAt: ago(18),
    }),
    event({
      key: 'spring',
      status: 'completed',
      createdBy: 'juniper',
      name: 'Spring Bloom Exchange',
      description: 'Flowers, rain and new beginnings. All gifts have been revealed. Thank you, everyone!',
      theme: 'New beginnings',
      season: 'spring',
      rules: 'Art or writing. Be kind!',
      tags: ['spring', 'flowers'],
      platform: 'tumblr',
      platformName: 'Bloom Club',
      platformLink: 'https://example.com/communities/bloom-club',
      signupDeadline: deadline(-60),
      submissionDeadline: deadline(-15),
      minParticipants: 3,
      maxParticipants: 20,
      allowedTypes: ['art', 'writing'],
      inviteCode: 'spring-bloom',
      banner: { seed: 'spring-bloom', title: 'Spring Bloom Exchange' },
      publishedAt: ago(55),
      completedAt: ago(10),
    }),
    // Smaller finished exchanges in other communities, so the landing page has real history to show
    ...[
      ['moonlit', 'juniper', 'Midsummer Moth Swap', 'Moths and lanterns at midsummer', 'discord', 'Moonlit Moth Society', ['moths', 'summer'], 40],
      ['pastel', 'remy', 'Pastel Picnic Swap', 'Picnic snacks in pastel colours', 'tumblr', 'Pastel Paws', ['picnic', 'cute'], 55],
      ['inkwell', 'noor', 'Short Story Swap', 'A short story for someone else\'s character', 'discord', 'Inkwell Writers Guild', ['writing'], 70],
      ['dragon', 'mika', 'Hoard Day Exchange', 'What does your character hoard?', 'toyhouse', 'Cozy Dragon Den', ['dragons', 'fantasy'], 85],
      ['sketch', 'sol', 'Sunday Doodle Swap', 'Quick doodles, any style', 'discord', 'Sketchbook Sundays', ['doodles'], 100],
      ['starboard', 'kit', 'Sea Shanty Swap', 'Ships, sailors and sea creatures', 'deviantart', 'Starboard Artists', ['ocean', 'adventure'], 120],
    ].map(([key, createdBy, name, theme, platform, platformName, tags, daysAgo]) =>
      event({
        key,
        status: 'completed',
        createdBy,
        name,
        description: `${theme}. All gifts have been revealed.`,
        theme,
        tags,
        platform,
        platformName,
        platformLink: `https://example.com/communities/${key}`,
        signupDeadline: deadline(-(daysAgo + 45)),
        submissionDeadline: deadline(-(daysAgo + 5)),
        maxParticipants: 12,
        inviteCode: `${key}-swap`,
        publishedAt: ago(daysAgo + 40),
        completedAt: ago(daysAgo),
      })
    ),
  ];

  // Sign-up forms. Types stay inside each event's allowedTypes and characters
  // are the applicant's own (never the archived one).
  const forms = {
    mika: { communityUsername: 'mika.draws', likes: 'Cosy scenes and warm lighting.', avoid: 'Gore and horror.', cannotDraw: ['mecha'] },
    sol: { communityUsername: 'solstice_fox', likes: 'Dynamic poses, sunsets, fire.', avoid: 'Very dark themes.', cannotDraw: ['robot', 'mecha'] },
    juniper: { communityUsername: 'juniper.moth', likes: 'Night scenes and lanterns.', avoid: 'Jump scares.', cannotDraw: ['mecha'] },
    ash: { communityUsername: 'ash_unit7', likes: 'Neon colours and city backgrounds.', avoid: 'Chibi styles.', cannotDraw: ['slime'] },
    remy: { communityUsername: 'remy.gloop', likes: 'Candy colours and food themes.', avoid: 'Realistic gore.', cannotDraw: ['humanoid'] },
    noor: { communityUsername: 'noor.writes', likes: 'Birds and golden-hour light.', avoid: 'Romance.', cannotDraw: [] },
    kit: { communityUsername: 'kit.lantern', likes: 'Lanterns and fireflies.', avoid: 'Nothing in particular.', cannotDraw: ['mecha', 'robot'] },
    pip: { communityUsername: 'pipsqueak', likes: 'Tiny animals and snacks.', avoid: 'Spiders.', cannotDraw: ['humanoid'] },
    pia: { communityUsername: 'pia', likes: 'Flowers and picnics.', avoid: 'Nothing in particular.', cannotDraw: [] },
    luna: { communityUsername: 'luna', likes: 'Night skies and owls.', avoid: 'Nothing in particular.', cannotDraw: [] },
    otto: { communityUsername: 'otto', likes: 'Plants and frogs.', avoid: 'Nothing in particular.', cannotDraw: [] },
    bea: { communityUsername: 'bea', likes: 'Letters and lavender.', avoid: 'Nothing in particular.', cannotDraw: [] },
    rio: { communityUsername: 'rio', likes: 'Sunsets and the seaside.', avoid: 'Nothing in particular.', cannotDraw: [] },
    vera: { communityUsername: 'vera', likes: 'Bold shapes and clean lines.', avoid: 'Nothing in particular.', cannotDraw: [] },
  };
  const application = (eventKey, user, canCreate, wantsTypes, offeredCharacters, extra = {}) => ({
    event: eventKey,
    user,
    status: 'accepted',
    ...forms[user],
    canCreate,
    wantsTypes,
    offeredCharacters,
    notes: '',
    ...extra,
  });

  const applications = [
    application('winter', 'sol', ['art', 'adoptable'], ['art', 'adoptable'], ['ember']),
    application('winter', 'juniper', ['art', 'writing'], ['writing', 'art'], ['lumen', 'wren']),
    application('winter', 'ash', ['art'], ['art'], ['cinder']),
    application('winter', 'remy', ['adoptable', 'art'], ['adoptable', 'art'], ['gloop']),
    application('winter', 'noor', ['writing'], ['art', 'writing'], ['saffron'], {
      notes: 'Happy to be a backup gifter if someone drops out.',
    }),

    application('moth', 'sol', ['art'], ['art'], ['sunny']),
    application('moth', 'juniper', ['art', 'writing'], ['writing', 'art'], ['lumen']),
    application('moth', 'pip', ['art'], ['art'], ['pipsqueak'], { notes: 'First exchange, excited!' }),
    application('moth', 'remy', ['art'], ['art'], ['marzipan'], { status: 'pending' }),

    application('studio', 'ash', ['art'], ['art'], ['unit7']),
    application('studio', 'kit', ['art'], ['art'], ['fennec']),

    application('summer', 'mika', ['art', 'writing'], ['art'], ['biscuit']),
    application('summer', 'sol', ['art', 'adoptable'], ['art', 'adoptable'], ['ember', 'sunny']),
    application('summer', 'juniper', ['art', 'writing'], ['writing', 'art'], ['wren']),
    application('summer', 'remy', ['adoptable', 'art'], ['adoptable', 'art'], ['gloop', 'marzipan']),
    application('summer', 'noor', ['writing'], ['art', 'writing'], ['idris']),
    application('summer', 'pip', ['art'], ['art'], ['pipsqueak']),

    application('autumn', 'mika', ['art', 'writing'], ['art'], ['biscuit']),
    application('autumn', 'sol', ['art', 'adoptable'], ['art', 'adoptable'], ['ember']),
    application('autumn', 'juniper', ['art', 'writing'], ['writing', 'art'], ['lumen']),
    application('autumn', 'ash', ['art'], ['art'], ['unit7', 'cinder']),
    application('autumn', 'pip', ['art'], ['art'], ['pipsqueak']),

    application('spring', 'mika', ['art', 'writing'], ['art'], ['biscuit']),
    application('spring', 'sol', ['art'], ['art'], ['ember']),
    application('spring', 'remy', ['art'], ['art'], ['marzipan']),
    application('spring', 'noor', ['writing'], ['art', 'writing'], ['saffron', 'idris']),
    application('spring', 'kit', ['art'], ['art', 'writing'], ['lantern']),

    application('moonlit', 'juniper', ['art', 'writing'], ['art'], ['lumen']),
    application('moonlit', 'sol', ['art'], ['art'], ['sunny']),
    application('moonlit', 'kit', ['art'], ['art'], ['lantern']),
    application('pastel', 'pip', ['art'], ['art'], ['pipsqueak']),
    application('pastel', 'remy', ['art'], ['art'], ['gloop']),
    application('pastel', 'mika', ['art'], ['art'], ['biscuit']),
    application('inkwell', 'noor', ['writing'], ['writing'], ['idris']),
    application('inkwell', 'juniper', ['writing'], ['writing'], ['wren']),
    application('inkwell', 'mika', ['writing'], ['writing'], ['pocket']),
    application('dragon', 'mika', ['art'], ['art'], ['biscuit']),
    application('dragon', 'ash', ['art'], ['art'], ['cinder']),
    application('dragon', 'kit', ['art'], ['art'], ['lantern']),
    application('sketch', 'sol', ['art'], ['art'], ['ember']),
    application('sketch', 'pip', ['art'], ['art'], ['pipsqueak']),
    application('sketch', 'remy', ['art'], ['art'], ['marzipan']),
    application('sketch', 'ash', ['art'], ['art'], ['unit7']),
    application('starboard', 'kit', ['art'], ['art'], ['lantern']),
    application('starboard', 'noor', ['writing'], ['art'], ['saffron']),
    application('starboard', 'sol', ['art'], ['art', 'writing'], ['sunny']),
  ];

  // Everyone from the OC Secret Santa sheet, signed up with their own answers
  SIGNUP_RESPONSES.forEach((s) => {
    const notes = [s.drawNote && `About what I can draw: ${s.drawNote}`, s.extra].filter(Boolean).join('\n\n');
    applications.push({
      event: 'ocsanta',
      user: s.username,
      status: 'accepted',
      communityUsername: s.toyhouse,
      canCreate: ['art', 'adoptable'],
      wantsTypes: [...s.wants],
      offeredCharacters: crowdCharacters.get(s.username),
      likes: s.wantNote,
      adoptWishlist: s.wants.includes('adoptable') ? s.adopt : '',
      avoid: '',
      cannotDraw: [...s.cannotDraw],
      notes: notes.slice(0, 1000),
      canBackup: s.backup !== 'no',
    });
  });

  const match = (eventKey, giver, recipient, score, reasons, status = 'assigned') => ({
    event: eventKey,
    giver,
    recipient,
    score,
    reasons,
    published: true,
    status,
  });

  // Scores and reasons are what shared/matching.mjs gives these pairs
  const ART = 'Can make art, which they asked for';
  const ONE = 'Can draw their character';
  const matches = [
    // mika -> sol -> juniper -> ash -> pip -> mika
    match('autumn', 'mika', 'sol', 65, [ART, ONE]),
    match('autumn', 'sol', 'juniper', 65, [ART, ONE]),
    match('autumn', 'juniper', 'ash', 53, [ART, 'Can draw 1 of 2 offered characters'], 'submitted'),
    match('autumn', 'ash', 'pip', 65, [ART, ONE], 'submitted'),
    match('autumn', 'pip', 'mika', 65, [ART, ONE], 'submitted'),

    // mika -> sol -> remy -> noor -> kit -> mika
    match('spring', 'mika', 'sol', 65, [ART, ONE], 'submitted'),
    match('spring', 'sol', 'remy', 65, [ART, ONE], 'submitted'),
    match('spring', 'remy', 'noor', 53, [ART, 'Can draw 1 of 2 offered characters'], 'submitted'),
    match('spring', 'noor', 'kit', 65, ['Can make writing, which they asked for', ONE], 'submitted'),
    match('spring', 'kit', 'mika', 65, [ART, ONE], 'submitted'),

    match('moonlit', 'sol', 'juniper', 70, [ART, ONE], 'submitted'),
    match('moonlit', 'juniper', 'kit', 66, [ART, ONE]),
    match('moonlit', 'kit', 'sol', 64, [ART, ONE]),
    match('pastel', 'pip', 'remy', 68, [ART, ONE], 'submitted'),
    match('pastel', 'remy', 'mika', 62, [ART, ONE]),
    match('pastel', 'mika', 'pip', 63, [ART, ONE]),
    match('dragon', 'ash', 'mika', 60, [ART, ONE], 'submitted'),
    match('dragon', 'mika', 'kit', 61, [ART, ONE]),
    match('dragon', 'kit', 'ash', 59, [ART, ONE]),
  ];

  // thanks: { message, reaction, days } is the recipient's thank-you note, sent `days` ago.
  // art: [{ seed, title }] draws placeholder artwork (shared/demo-art.mjs); add src to use a real
  // picture from client/public/demo-art instead (see the CREDITS.md there).
  const submission = (eventKey, giver, recipient, fields) => ({
    event: eventKey,
    giver,
    recipient,
    title: '',
    message: '',
    type: 'art',
    art: [],
    links: [],
    late: false,
    verified: false,
    ...fields,
  });

  const submissions = [
    submission('autumn', 'juniper', 'ash', {
      title: 'Cinder in the leaf pile',
      message: 'I hope you like it! Cinder looked so cosy among the leaves.',
      art: [{ seed: 'autumn-juniper-ash', title: 'Cinder in the leaf pile' }],
      submittedAt: ago(3, 5),
      verified: true,
    }),
    submission('autumn', 'ash', 'pip', {
      title: 'Pipsqueak and the giant acorn',
      message: 'Tried a softer style than usual for this one. Happy autumn!',
      art: [
        { seed: 'autumn-ash-pip-1', title: 'Pipsqueak and the giant acorn' },
        { seed: 'autumn-ash-pip-2', title: 'Sketch' },
      ],
      submittedAt: ago(2, 2),
    }),
    submission('autumn', 'pip', 'mika', {
      title: 'Biscuit and the teacup tower',
      message: 'My first gift for an exchange. Biscuit was so fun to draw!',
      art: [{ seed: 'autumn-pip-mika', title: 'Biscuit and the teacup tower' }],
      submittedAt: ago(1, 3),
    }),

    submission('spring', 'mika', 'sol', {
      thanks: { message: 'I actually teared up. Ember has never looked so happy. Thank you!!', reaction: 'sparkles', days: 9 },
      title: 'Ember in the cherry blossoms',
      message: 'Happy spring, Sol! Thank you for being such a lovely part of the club.',
      art: [{ seed: 'spring-mika-sol', src: '/demo-art/spring-mika-sol.jpg', title: 'Ember in the cherry blossoms' }],
      submittedAt: ago(18, 4),
      verified: true,
    }),
    submission('spring', 'sol', 'remy', {
      thanks: { message: 'The loaf shape is PERFECT. This is going on my wall.', reaction: 'heart', days: 9 },
      title: 'Marzipan nap time',
      message: 'A loaf among the tulips.',
      art: [{ seed: 'spring-sol-remy', src: '/demo-art/spring-sol-remy.jpg', title: 'Marzipan nap time' }],
      submittedAt: ago(17, 6),
      verified: true,
    }),
    submission('spring', 'remy', 'noor', {
      thanks: { message: 'You even remembered the little bell. I love it so much.', reaction: 'teary', days: 9 },
      title: 'Saffron at the oasis',
      message: 'Sorry it was a little late, I hope it was worth the wait!',
      art: [
        { seed: 'spring-remy-noor-1', src: '/demo-art/spring-remy-noor-1.jpg', title: 'Saffron at the oasis' },
        { seed: 'spring-remy-noor-2', src: '/demo-art/spring-remy-noor-2.jpg', title: 'Colour study' },
      ],
      submittedAt: ago(14, 8),
      late: true,
      verified: true,
    }),
    submission('spring', 'noor', 'kit', {
      thanks: { message: 'A whole story AND a picture? Lantern would serve you tea forever.', reaction: 'heart', days: 9 },
      title: 'The Lantern Tea Stall',
      message: 'A short story about Lantern opening the stall on the first warm night of spring.',
      type: 'writing',
      art: [{ seed: 'spring-noor-kit', src: '/demo-art/spring-noor-kit.jpg', title: 'The Lantern Tea Stall' }],
      links: [{ label: 'Read the story', url: 'https://example.com/stories/lantern-tea-stall' }],
      submittedAt: ago(16, 2),
      verified: true,
    }),
    submission('spring', 'kit', 'mika', {
      thanks: { message: 'The teacups!!! Biscuit is living her best life. Thank you Kit!', reaction: 'sparkles', days: 9 },
      title: 'Biscuit in bloom',
      message: 'Biscuit surrounded by spring teacups. Thank you for the lovely prompts!',
      art: [{ seed: 'spring-kit-mika', src: '/demo-art/spring-kit-mika.jpg', title: 'Biscuit in bloom' }],
      submittedAt: ago(19, 1),
      verified: true,
    }),
    submission('moonlit', 'sol', 'juniper', {
      title: 'Lumen lights the lanterns',
      message: 'Happy midsummer! I loved drawing Lumen on the rooftops.',
      art: [{ seed: 'moonlit-sol-juniper', src: '/demo-art/gallery-sol-juniper.jpg', title: 'Lumen lights the lanterns' }],
      submittedAt: ago(48),
      verified: true,
      thanks: { message: 'You got the collar and the wing spots exactly right. Lumen looks so proud.', reaction: 'heart', days: 39 },
    }),
    submission('pastel', 'pip', 'remy', {
      title: "Gloop's snack attack",
      message: 'Gloop deserves all the snacks.',
      art: [{ seed: 'pastel-pip-remy', src: '/demo-art/gallery-pip-remy.jpg', title: "Gloop's snack attack" }],
      submittedAt: ago(62),
      verified: true,
      thanks: { message: 'GLOOP WITH THE DONUTS. I am screaming. Thank you Pip!', reaction: 'laugh', days: 54 },
    }),
    // Ash hasn't allowed public display, so this gift never appears on the landing page or profiles
    submission('dragon', 'ash', 'mika', {
      title: 'Biscuit and the teacup hoard',
      message: 'Hope you like it!',
      art: [{ seed: 'dragon-ash-mika', title: 'Biscuit and the teacup hoard' }],
      submittedAt: ago(92),
      verified: true,
    }),
  ];

  // ---------- Sample museum wings ----------
  // One finished exchange for each room design (shared/museum-themes.mjs), made by the Museum
  // Club, so every design can be seen in the museum. Five of the six take part each time (a
  // different one sits out), and each makes a gift for the next.
  const CLUB = ['pia', 'luna', 'otto', 'bea', 'rio', 'vera'];
  const CLUB_CHARACTERS = { pia: 'Petal', luna: 'Hoot', otto: 'Sprout', bea: 'Quill', rio: 'Mango', vera: 'Dot' };
  const SAMPLE_WINGS = [
    {
      key: 'petal-post',
      design: 'blossom',
      organiser: 'pia',
      name: 'Petal Post Swap',
      theme: 'Postcards from spring',
      season: 'spring',
      scenes: ['under the cherry tree', 'with a bouquet', 'at the flower stall', 'on a petal swing', 'having a picnic', 'in the spring rain'],
    },
    {
      key: 'midnight-lanterns',
      design: 'midnight',
      organiser: 'luna',
      name: 'Midnight Lantern Gallery',
      theme: 'Lights in the dark',
      season: 'halloween',
      scenes: ['by lantern light', 'stargazing', 'on the night train', 'at the moon festival', 'reading by candlelight', 'chasing fireflies'],
    },
    {
      key: 'greenhouse',
      design: 'mint',
      organiser: 'otto',
      name: 'Greenhouse Doodle Swap',
      theme: 'Things that grow',
      season: 'spring',
      scenes: ['in the greenhouse', 'repotting a fern', 'among the succulents', 'with a watering can', 'in the herb garden', 'under a monstera'],
    },
    {
      key: 'lavender-letters',
      design: 'lavender',
      organiser: 'bea',
      name: 'Lavender Letters Exchange',
      theme: 'Letters to a friend',
      season: 'valentine',
      scenes: ['writing a letter', 'with a lavender bundle', 'sealing an envelope', 'at the post office', 'with a pressed flower', 'reading old postcards'],
    },
    {
      key: 'golden-hour',
      design: 'golden',
      organiser: 'rio',
      name: 'Golden Hour Sketch Trade',
      theme: 'The last light of the day',
      season: 'other',
      scenes: ['at sunset', 'on the pier', 'with an ice lolly', 'by the beach hut', 'flying a kite', 'watching the tide'],
    },
    {
      key: 'white-cube',
      design: 'gallery',
      organiser: 'vera',
      name: 'White Cube Mini Show',
      theme: 'Less is more',
      season: 'other',
      scenes: ['in three shapes', 'as a bold silhouette', 'in black and red', 'as an ink study', 'on a white plinth', 'in one line'],
    },
  ];
  SAMPLE_WINGS.forEach((w, i) => {
    // Finished before Spring Bloom, a few days apart
    const finished = 12 + i * 3;
    events.push(
      event({
        key: w.key,
        status: 'completed',
        createdBy: w.organiser,
        name: w.name,
        description: `A finished Museum Club exchange. Its gifts hang in the museum in the "${w.design}" room design.`,
        theme: w.theme,
        season: w.season,
        rules: 'One finished piece each. Be kind!',
        tags: ['museum club'],
        platform: 'discord',
        platformName: 'Museum Club Discord',
        platformLink: 'https://example.com/communities/museum-club',
        signupDeadline: deadline(-finished - 40),
        submissionDeadline: deadline(-finished - 5),
        minParticipants: 3,
        maxParticipants: 12,
        allowedTypes: ['art'],
        inviteCode: `club-${w.key}`,
        banner: { seed: `club-${w.key}`, title: w.name },
        publishedAt: ago(finished + 35),
        completedAt: ago(finished),
        museumTheme: w.design,
      })
    );
    // The gifts go round in a ring that starts somewhere new each time
    const ring = CLUB.map((_, n) => CLUB[(n + i) % CLUB.length]).slice(0, 5);
    ring.forEach((giver, n) => {
      const recipient = ring[(n + 1) % ring.length];
      const title = `${CLUB_CHARACTERS[recipient]} ${w.scenes[n % w.scenes.length]}`;
      applications.push(application(w.key, giver, ['art'], ['art'], [CLUB_CHARACTERS[giver].toLowerCase()]));
      matches.push(match(w.key, giver, recipient, 65, [ART, ONE], 'submitted'));
      submissions.push(
        submission(w.key, giver, recipient, {
          title,
          message: `For you, ${CLUB_CHARACTERS[recipient]}! Thanks for a lovely exchange.`,
          art: [{ seed: `club-${w.key}-${giver}-${recipient}`, title }],
          submittedAt: ago(finished + 6, n),
          verified: true,
        })
      );
    });
  });

  const note = (user, type, title, message, eventKey, path, read, createdAt) => ({
    user,
    type,
    title,
    message,
    event: eventKey,
    path,
    read,
    createdAt,
  });

  // Same titles and messages the server writes for these events
  const revealed = (user) =>
    note(user, 'gift_revealed', 'Gifts for Spring Bloom Exchange are revealed!',
      'See the gift made for you, who your Secret Santa was, and everything else from the exchange.',
      'spring', '/results', false, ago(10));
  const matched = (user, recipientName) =>
    note(user, 'match_assigned', 'Your match for Autumn Leaves Art Trade is ready',
      `You're making a gift for ${recipientName}. Check your match for their characters and wishes.`,
      'autumn', '/matches', true, ago(18));

  const notifications = [
    revealed('mika'),
    note('mika', 'application_received', 'New sign-up for Winter Secret Santa 2026',
      'Noor joined the exchange.', 'winter', '/manage?tab=participants', false, ago(0, 5)),
    note('mika', 'deadline_reminder', 'Your gift for Autumn Leaves Art Trade is due in 5 days',
      'A friendly reminder to finish and upload your gift for Sol before the deadline.', 'autumn', '/submit', false, ago(0, 2)),
    matched('mika', 'Sol'),

    matched('sol', 'Juniper'),
    matched('juniper', 'Ash'),
    matched('ash', 'Pip'),
    matched('pip', 'Mika'),
    revealed('sol'),
    revealed('remy'),
    revealed('noor'),
    revealed('kit'),
    note('kit', 'application_received', 'New sign-up for Moth & Lantern Exchange',
      'Remy applied and is waiting for your review.', 'moth', '/manage?tab=participants', false, ago(1, 4)),
  ];

  return {
    users,
    characters,
    events,
    applications,
    matches,
    submissions,
    notifications,
  };
}
