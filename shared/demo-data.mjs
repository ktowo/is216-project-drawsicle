// Demo accounts, characters and events. Used by server/scripts/seed.js (local database)
// and by the in-browser mock API (client/src/mock), so both show the same little world.
// Records point at each other by `key`; each side swaps keys for real ids when it loads them.
// Every date is relative to `now`, so deadlines look fresh after a reset.

export const DEMO_PASSWORD = 'drawisicle123';
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
      displayName: 'Noor',
      bio: 'Writer and hobby composer. I turn characters into short stories and little piano pieces.',
      socials: { bluesky: 'noor', tumblr: 'noor-writes', discord: 'noor.writes' },
      defaultForm: {
        communityUsername: 'noor.writes',
        canCreate: ['writing', 'music'],
        wantsTypes: ['art', 'writing'],
        likes: 'Birds, travel, golden-hour light.',
        avoid: 'Romance.',
        cannotDraw: [],
      },
    },
    {
      key: 'kit',
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
      displayName: 'Pip',
      bio: 'New to exchanges! Doodles, tiny animals and chiptune music.',
      socials: { twitter: 'pipsqueak', bluesky: 'pipsqueak', discord: 'pipsqueak' },
      defaultForm: {
        communityUsername: 'pipsqueak',
        canCreate: ['art', 'music'],
        wantsTypes: ['art', 'music'],
        likes: 'Tiny animals, snacks, bright colours.',
        avoid: 'Spiders.',
        cannotDraw: ['humanoid'],
      },
    },
    {
      // Site admin for trying the admin tools; not part of any event
      key: 'ada',
      role: 'admin',
      displayName: 'Ada (site admin)',
      bio: 'Keeps Drawisicle tidy: moderates events and helps with account problems.',
      socials: { discord: 'ada_admin', bluesky: 'ada-admin' },
      defaultForm: { communityUsername: 'ada_admin', canCreate: ['art'], wantsTypes: ['art'], likes: '', avoid: '', cannotDraw: [] },
    },
  ].map((u) => ({ ...u, email: `${u.key}@demo.test`, username: u.key, role: u.role || 'user' }));

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
  ];

  const ALL_TYPES = ['art', 'adoptable', 'writing', 'music'];
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
      rules: 'Art, writing or music. Be kind!',
      tags: ['spring', 'flowers'],
      platform: 'tumblr',
      platformName: 'Bloom Club',
      platformLink: 'https://example.com/communities/bloom-club',
      signupDeadline: deadline(-60),
      submissionDeadline: deadline(-15),
      minParticipants: 3,
      maxParticipants: 20,
      allowedTypes: ['art', 'writing', 'music'],
      inviteCode: 'spring-bloom',
      banner: { seed: 'spring-bloom', title: 'Spring Bloom Exchange' },
      publishedAt: ago(55),
      completedAt: ago(10),
    }),
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
    application('winter', 'noor', ['writing', 'music'], ['art', 'writing'], ['saffron'], {
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
    application('summer', 'noor', ['writing', 'music'], ['art', 'writing'], ['idris']),
    application('summer', 'pip', ['art', 'music'], ['art', 'music'], ['pipsqueak']),

    application('autumn', 'mika', ['art', 'writing'], ['art'], ['biscuit']),
    application('autumn', 'sol', ['art', 'adoptable'], ['art', 'adoptable'], ['ember']),
    application('autumn', 'juniper', ['art', 'writing'], ['writing', 'art'], ['lumen']),
    application('autumn', 'ash', ['art'], ['art'], ['unit7', 'cinder']),
    application('autumn', 'pip', ['art'], ['art'], ['pipsqueak']),

    application('spring', 'mika', ['art', 'writing'], ['art'], ['biscuit']),
    application('spring', 'sol', ['art'], ['art'], ['sunny']),
    application('spring', 'remy', ['art'], ['art'], ['marzipan']),
    application('spring', 'noor', ['writing', 'music'], ['art', 'writing'], ['saffron', 'idris']),
    application('spring', 'kit', ['art'], ['art', 'writing'], ['lantern']),
  ];

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
  ];

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
      title: 'Ember in the cherry blossoms',
      message: 'Happy spring, Sol! Thank you for being such a lovely part of the club.',
      art: [{ seed: 'spring-mika-sol', title: 'Ember in the cherry blossoms' }],
      submittedAt: ago(18, 4),
      verified: true,
    }),
    submission('spring', 'sol', 'remy', {
      title: 'Marzipan nap time',
      message: 'A loaf among the tulips.',
      art: [{ seed: 'spring-sol-remy', title: 'Marzipan nap time' }],
      submittedAt: ago(17, 6),
      verified: true,
    }),
    submission('spring', 'remy', 'noor', {
      title: 'Saffron at the oasis',
      message: 'Sorry it was a little late, I hope it was worth the wait!',
      art: [
        { seed: 'spring-remy-noor-1', title: 'Saffron at the oasis' },
        { seed: 'spring-remy-noor-2', title: 'Colour study' },
      ],
      submittedAt: ago(14, 8),
      late: true,
      verified: true,
    }),
    submission('spring', 'noor', 'kit', {
      title: 'The Lantern Tea Stall',
      message: 'A short story about Lantern opening the stall on the first warm night of spring.',
      type: 'writing',
      art: [{ seed: 'spring-noor-kit', title: 'The Lantern Tea Stall' }],
      links: [{ label: 'Read the story', url: 'https://example.com/stories/lantern-tea-stall' }],
      submittedAt: ago(16, 2),
      verified: true,
    }),
    submission('spring', 'kit', 'mika', {
      title: 'Biscuit in bloom',
      message: 'Biscuit surrounded by spring teacups. Thank you for the lovely prompts!',
      art: [{ seed: 'spring-kit-mika', title: 'Biscuit in bloom' }],
      submittedAt: ago(19, 1),
      verified: true,
    }),
  ];

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
