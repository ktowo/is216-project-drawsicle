// What screen pets say in their little speech bubbles. Short, so they're gone before they get in the way.
const CHAT = ['hi!', '♡', 'hehe', 'nice art!', 'draw me?', 'ooh, shiny', 'wanna play?', 'boop', 'so cosy', 'hello friend', 'whatcha drawing?', '*stretch*', 'la la la ♪'];

const BY_KIND = {
  cat: ['mrrp?', 'meow!', 'nap time?', '*kneads*'],
  dog: ['woof!', 'walkies?', 'ball??', 'arf arf!'],
  fox: ['yip!', 'heehee', 'sneaky...', '*pounce*'],
  bunny: ['boing!', 'carrot?', '*nose wiggle*', 'binky!'],
  mouse: ['squeak!', 'cheese?', 'eep!', 'tiny hello'],
  bear: ['honey?', 'big hug!', 'grr (nicely)', 'cuddle?'],
  penguin: ['waddle waddle', 'brr!', 'fish?', 'slide time'],
  bird: ['tweet!', 'chirp chirp', 'peep!', 'fly with me?'],
  dragon: ['rawr!', 'tiny flame!', 'treasure?', 'i am fierce'],
  slime: ['bloop', 'blorp!', 'jiggle jiggle', 'squish'],
  frog: ['ribbit!', 'croak', 'any flies?', 'hop hop'],
  hedgehog: ['huff huff', 'snuffle', 'not spiky, promise', '*curls up*'],
};

const MOODS = {
  hungry: ['snack?', 'tummy rumble...', 'feed me pls', 'so hungry', 'treat time?'],
  fed: ['yum!', 'nom nom', 'thank u!', 'tasty!', 'mmm!'],
  full: ['so full...', 'no more pls', 'maybe later!'],
  petted: ['♡', '♡ ♡', 'hehe', 'more pats!', 'happy!'],
  thrown: ['wheee!', 'again!', 'whoa!', 'flying!'],
  perched: ['nice view!', 'up here!', 'my spot', 'ta-da!'],
  picked: ['hi!', 'eep!', 'where to?', 'up up!'],
  woken: ['huh?', '*blinks*', 'mm?'],
};

const PETTED_BY_KIND = { cat: ['purrrr'], dog: ['*wag wag*'], bunny: ['*happy thump*'], dragon: ['*warm purr*'], slime: ['*wobbles*'] };

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// mood: 'chat' or one of MOODS
export function lineFor(kind, mood, name) {
  if (mood === 'chat') {
    const r = Math.random();
    if (r < 0.08 && name) return `i'm ${name}!`;
    return pick(r < 0.5 ? BY_KIND[kind] || CHAT : CHAT);
  }
  if (mood === 'petted' && PETTED_BY_KIND[kind] && Math.random() < 0.5) return pick(PETTED_BY_KIND[kind]);
  return pick(MOODS[mood] || CHAT);
}
