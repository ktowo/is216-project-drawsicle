// The demo character library (used by shared/demo-data.mjs): extra details for the original
// characters, and everyone's bigger collection. Each person has 1-3 characters out as screen pets.
//
// Reference links only ever point at example.com.

const refFor = (owner, slug, label = 'Reference sheet') => ({ label, url: `https://example.com/refs/${owner}/${slug}` });

// Pronouns, personality, colours, folder, favourite and pet settings for the original characters
export const CHARACTER_DETAILS = {
  biscuit: { pronouns: 'he/him', personality: 'Sleepy, gentle and easily bribed with tea.', colours: ['#f6e3bf', '#f6a5c0', '#d9b98a'], folder: 'OCs', favourite: true, pet: { shown: true } },
  pocket: { pronouns: 'she/her', personality: 'Fussy about hems, soft about everyone.', colours: ['#c9b2ee', '#e3b448', '#fdf2dc'], folder: 'OCs', favourite: true, pet: { shown: true, palette: 'lilac' } },
  captain: { pronouns: 'they/them', personality: 'Loud, dramatic, secretly afraid of heights.', colours: ['#2f4a7a', '#e3b448'], folder: 'Story cast' },
  ember: { pronouns: 'she/her', personality: 'Brave, warm, a little bit of a show-off.', colours: ['#f2803a', '#ffd27a', '#fff1dc'], folder: 'Fursonas', favourite: true, pet: { shown: true } },
  sunny: { pronouns: 'he/him', personality: 'Always early, always humming.', colours: ['#f2cf63', '#f28f6b'], folder: 'OCs' },
  lumen: { pronouns: 'she/they', personality: 'Dreamy and curious; drawn to anything that glows.', colours: ['#e9d8b4', '#9ccdf7', '#fff7e0'], folder: 'OCs', favourite: true, pet: { shown: true, kind: 'bird', palette: 'cream' } },
  wren: { pronouns: 'she/her', personality: 'Quiet, clever, keeps a pressed-flower journal.', colours: ['#6b8f5e', '#d9c3a0'], folder: 'Story cast' },
  unit7: { pronouns: 'it/its', personality: 'Earnest. Still learning what jokes are.', colours: ['#9aa7b5', '#63b3f5'], folder: 'OCs' },
  cinder: { pronouns: 'he/him', personality: 'Grumpy until someone offers a warm rock.', colours: ['#45424f', '#f2803a'], folder: 'OCs', favourite: true, pet: { shown: true, palette: 'charcoal' } },
  gloop: { pronouns: 'they/them', personality: 'Bouncy, sticky, unbothered.', colours: ['#9ccdf7', '#d8f0ff'], folder: 'Comfort crew', favourite: true, pet: { shown: true } },
  marzipan: { pronouns: 'she/her', personality: 'Will sit on whatever you are working on.', colours: ['#f6e3bf', '#d9a07a'], folder: 'Comfort crew', pet: { shown: true, palette: 'cream' } },
  saffron: { pronouns: 'she/her', personality: 'Proud, musical, terrible at keeping secrets.', colours: ['#f2a02d', '#c2413b', '#fff1dc'], folder: 'Story cast', favourite: true, pet: { shown: true, palette: 'gold' } },
  idris: { pronouns: 'he/him', personality: 'Patient storyteller with a hundred songs.', colours: ['#8a5a3b', '#2f6f6a'], folder: 'Story cast' },
  lantern: { pronouns: 'she/her', personality: 'Night owl in moth form; serves tea to everyone.', colours: ['#f6a5c0', '#f2cf63'], folder: 'OCs', favourite: true },
  fennec: { pronouns: 'he/him', personality: 'Bookish, polite, collects bookmarks.', colours: ['#e9c48f', '#5aa04a', '#fff1dc'], folder: 'Fursonas', pet: { shown: true } },
  pipsqueak: { pronouns: 'she/her', personality: 'Tiny and fearless. Will share the blueberry.', colours: ['#c9a07a', '#fff1dc', '#5b6ee1'], folder: 'OCs', favourite: true, pet: { shown: true, palette: 'brown' } },
  tin: { pronouns: 'it/its', personality: 'Happy beeps. Needs winding every hour.', colours: ['#9fdcc4', '#f6a5c0'], folder: 'OCs' },
  petal: { pronouns: 'she/her', personality: 'Chatty, punctual, rings her bell at everyone.', colours: ['#f7f4ef', '#f6a5c0'], folder: 'OCs', favourite: true, pet: { shown: true } },
  hoot: { pronouns: 'he/him', personality: 'Sleepy by day, philosophical by night.', colours: ['#e9d8b4', '#a9744f'], folder: 'OCs', favourite: true, pet: { shown: true, palette: 'cream' } },
  sprout: { pronouns: 'he/him', personality: 'Polite little frog who says thank you to rain.', colours: ['#8ccf7e', '#e6f6df'], folder: 'OCs', favourite: true, pet: { shown: true } },
  quill: { pronouns: 'she/her', personality: 'Organised, kind, slightly prickly before coffee.', colours: ['#a9744f', '#c9b2ee'], folder: 'OCs', favourite: true, pet: { shown: true } },
  mango: { pronouns: 'he/him', personality: 'Professional napper. Purrs at sunsets.', colours: ['#f2a65a', '#ffffff'], folder: 'Comfort crew', favourite: true, pet: { shown: true } },
  dot: { pronouns: 'she/her', personality: 'Neat, stylish, judges your outfit kindly.', colours: ['#2e2c36', '#ffffff', '#d64545'], folder: 'OCs', favourite: true, pet: { shown: true } },
};

// [owner, key, name, species, tags, pronouns, colours, folder, description, personality, notes for artists, extra]
const MORE = [
  // Mika: the main demo account, with the biggest library
  ['mika', 'mochi', 'Mochi', 'Bunny', ['fluffy', 'pastel', 'feral'], 'she/her', ['#ffffff', '#f6a5c0', '#fde6ee'], 'Comfort crew', 'A round white bunny who lives in a rice-cake tin.', 'Squishy and calm; loves being held.', 'Pink inner ears, one ear always flopped.', { favourite: true, pet: { shown: true, palette: 'white' } }],
  ['mika', 'nori', 'Nori', 'Cat', ['fluffy', 'feral'], 'he/him', ['#2e2c36', '#9fdcc4'], 'Comfort crew', 'A black cat who sits in every cardboard box he can find.', 'Mischievous, then suddenly very cuddly.', 'Green eyes, a white star on his chest.', {}],
  ['mika', 'teacake', 'Teacake', 'Bear', ['fluffy', 'pastel'], 'he/him', ['#c48a5c', '#f6e3bf'], 'OCs', 'A honey-coloured bear who runs a tiny bakery.', 'Warm, flour-covered, gives out free crumbs.', 'Striped apron, flour on the nose.', {}],
  ['mika', 'pebble', 'Pebble', 'Slime', ['pastel', 'fantasy'], 'they/them', ['#c9b2ee', '#f3edfd'], 'Adopts', 'A lilac slime that carries a small pebble inside like a pearl.', 'Quiet, wobbly, collects shiny things.', 'Translucent; the pebble is grey with a pink speck.', {}],
  ['mika', 'puddle', 'Puddle', 'Frog', ['feral', 'pastel'], 'he/him', ['#9ccdf7', '#e8f3fd'], 'Adopts', 'A blue rain frog who only comes out in drizzle.', 'Shy; sings very small songs.', 'Pale blue with darker spots.', {}],
  ['mika', 'saga', 'Saga', 'Elf', ['humanoid', 'fantasy'], 'she/her', ['#3c6e5a', '#e3b448', '#f7e8d0'], 'Story cast', 'An elven cartographer mapping a forest that moves.', 'Determined, nerdy about ink.', 'Green cloak, a quill behind one ear.', {}],
  ['mika', 'waffles', 'Waffles', 'Corgi', ['fluffy', 'feral'], 'he/him', ['#e9a35c', '#ffffff'], 'Comfort crew', 'A corgi who believes every walk is a parade.', 'Joyful, loud, food-motivated.', 'Fluffy butt is very important.', {}],

  ['sol', 'barley', 'Barley', 'Dog', ['fluffy', 'feral'], 'he/him', ['#e3c08d', '#fff7e0'], 'Comfort crew', 'A golden retriever who fetches the morning paper for the whole street.', 'Endlessly happy, slightly clumsy.', 'Red bandana.', { favourite: true, pet: { shown: true, palette: 'cream' } }],
  ['sol', 'kindle', 'Kindle', 'Dragon', ['scaly', 'fantasy'], 'they/them', ['#d64545', '#f2cf63'], 'OCs', 'A small hearth dragon who keeps the bakery oven going.', 'Proud of their perfect toast.', 'Tiny wings, ember freckles.', {}],
  ['sol', 'dune', 'Dune', 'Fennec fox', ['fluffy', 'anthro'], 'he/him', ['#e9c48f', '#a9744f'], 'Fursonas', 'Ember\'s cousin, a desert courier with enormous ears.', 'Laid back, good with maps.', 'Goggles on his forehead.', {}],
  ['sol', 'starling', 'Starling', 'Bird', ['feathered', 'fantasy'], 'she/her', ['#2f4a7a', '#9ccdf7', '#f2cf63'], 'Story cast', 'A night-sky starling with stars in her feathers.', 'Wistful, kind, terrible sense of direction.', 'Speckled with tiny gold stars.', {}],
  ['sol', 'clementine', 'Clementine', 'Human', ['humanoid'], 'she/her', ['#f2803a', '#3c6e5a'], 'Story cast', 'A fruit-stall owner who names every orange.', 'Chatty, generous.', 'Freckles, orange headscarf.', {}],

  ['juniper', 'fern', 'Fern', 'Axolotl', ['pastel', 'fantasy'], 'she/her', ['#f6a5c0', '#fde6ee'], 'OCs', 'A pink axolotl who runs the greenhouse watering rota.', 'Smiles at everything, forgets everything.', 'Frilly gills, always smiling.', { favourite: true, pet: { shown: true, palette: 'pink' } }],
  ['juniper', 'thistle', 'Thistle', 'Hedgehog', ['fluffy', 'feral'], 'he/him', ['#a9744f', '#c9b2ee'], 'OCs', 'A gardening hedgehog with flower petals stuck in his spines.', 'Gentle, a little shy.', 'Petals in the spines, wellington boots.', {}],
  ['juniper', 'marigold', 'Marigold', 'Human', ['humanoid', 'fantasy'], 'she/her', ['#f2a02d', '#6b8f5e'], 'Story cast', 'Wren\'s older sister, a botanist who talks to seeds.', 'Bossy, brilliant, secretly soft.', 'Straw hat with a marigold.', {}],
  ['juniper', 'drizzle', 'Drizzle', 'Slime', ['pastel'], 'they/them', ['#9fdcc4', '#e9f9f2'], 'Adopts', 'A mint slime that lives in the greenhouse rain barrel.', 'Sleepy, cool to the touch.', 'Leaves floating inside.', {}],
  ['juniper', 'acorn', 'Acorn', 'Mouse', ['fluffy', 'feral'], 'he/him', ['#a9744f', '#fff1dc'], 'Comfort crew', 'A harvest mouse who sleeps in a seed packet.', 'Busy, tidy, always snacking.', 'Wheat stalk tucked behind ear.', {}],

  ['ash', 'bolt', 'Bolt', 'Hedgehog', ['mecha', 'fantasy'], 'he/him', ['#63b3f5', '#45424f'], 'OCs', 'A clockwork hedgehog with copper spines.', 'Zippy, sparks when excited.', 'Copper spines, blue glow eyes.', { pet: { shown: true, palette: 'sky' } }],
  ['ash', 'gear', 'Gear', 'Robot', ['mecha', 'humanoid'], 'it/its', ['#9aa7b5', '#f2cf63'], 'WIP', 'Unit 7\'s little helper drone.', 'Follows Unit 7 everywhere.', 'Single round eye, propeller hat.', {}],
  ['ash', 'smoke', 'Smoke', 'Wolf', ['fluffy', 'feral'], 'she/her', ['#737a8b', '#eceef3'], 'Fursonas', 'A grey wolf who guards the scrapyard at night.', 'Stern, loyal, loves belly rubs (secretly).', 'Scar across the nose.', {}],
  ['ash', 'circuit', 'Circuit', 'Dragon', ['mecha', 'scaly'], 'they/them', ['#45424f', '#9fdcc4'], 'WIP', 'A tiny dragon made of old phone parts.', 'Curious about every cable.', 'Glowing green circuit lines.', {}],

  ['remy', 'bramble', 'Bramble', 'Bear', ['fluffy', 'feral'], 'he/him', ['#7c5034', '#e3b448'], 'Comfort crew', 'A forest bear who knits scarves for everyone in winter.', 'Huge and gentle; cries at sad films.', 'Always has knitting needles.', {}],
  ['remy', 'jelly', 'Jelly', 'Slime', ['pastel', 'fantasy'], 'she/her', ['#f6a5c0', '#fde6ee'], 'Comfort crew', 'Gloop\'s strawberry-flavoured best friend.', 'Giggly, bouncy, slightly sticky.', 'Pink with a darker heart inside.', {}],
  ['remy', 'pistachio', 'Pistachio', 'Cat', ['fluffy', 'feral'], 'she/her', ['#a3a8b6', '#9fdcc4'], 'Adopts', 'A grey kitten with a mint collar.', 'Pounces on shadows.', 'Mint collar with a bell.', {}],
  ['remy', 'caramel', 'Caramel', 'Bunny', ['fluffy', 'feral'], 'he/him', ['#c48a5c', '#f6e3bf'], 'Adopts', 'A lop bunny who hoards dandelions.', 'Nibbles everything, apologises after.', 'Caramel coat, cream paws.', {}],
  ['remy', 'tofu', 'Tofu', 'Penguin', ['feathered', 'pastel'], 'they/them', ['#45424f', '#ffffff', '#f2cf63'], 'Comfort crew', 'A penguin who works at the ice-cream shop.', 'Deadpan, secretly the funniest one.', 'Tiny paper hat.', {}],

  ['noor', 'sable', 'Sable', 'Cat', ['fluffy', 'anthro'], 'she/her', ['#2e2c36', '#e3b448'], 'Story cast', 'A black cat poet who performs at moonlit cafés.', 'Dramatic and sincere.', 'Gold hoop earrings.', {}],
  ['noor', 'quince', 'Quince', 'Bird', ['feathered'], 'he/him', ['#8ccf7e', '#f2cf63'], 'OCs', 'A green songbird who knows every folk tune.', 'Chirpy, hums constantly.', 'Yellow cheeks.', {}],
  ['noor', 'tamarind', 'Tamarind', 'Fox', ['fluffy', 'feral'], 'they/them', ['#a9744f', '#fff1dc'], 'Adopts', 'A brown fox who trades spices at the market.', 'Clever, generous, haggles for fun.', 'Woven bag of spices.', {}],
  ['noor', 'amber', 'Amber', 'Human', ['humanoid'], 'she/her', ['#e3b448', '#8a5a3b'], 'Story cast', 'Idris\'s apprentice, learning the oud.', 'Impatient, talented.', 'Braided hair with beads.', {}],

  ['kit', 'moss', 'Moss', 'Bear', ['fluffy', 'pastel'], 'he/him', ['#8ccf7e', '#e6f6df'], 'OCs', 'A tiny moss bear who grows ferns on his back.', 'Slow, thoughtful, smells like rain.', 'Ferns and a mushroom on his back.', { favourite: true, pet: { shown: true, palette: 'leaf' } }],
  ['kit', 'ink', 'Ink', 'Octopus', ['fantasy'], 'she/her', ['#2f4a7a', '#c9b2ee'], 'Story cast', 'An octopus calligrapher with eight pens.', 'Precise, generous with compliments.', 'Ink stains on every arm.', {}],
  ['kit', 'twig', 'Twig', 'Moth', ['fluffy', 'pastel'], 'they/them', ['#e9d8b4', '#a9744f'], 'OCs', 'Lantern\'s little sibling, a twig-coloured moth.', 'Copies everything Lantern does.', 'Very small, very fluffy.', {}],
  ['kit', 'olive', 'Olive', 'Frog', ['feral'], 'she/her', ['#6b8f5e', '#e6f6df'], 'Adopts', 'A library frog who shushes loudly.', 'Strict but fair.', 'Reading glasses on a chain.', {}],
  ['kit', 'kestrel', 'Kestrel', 'Human', ['humanoid'], 'he/him', ['#5a3b2e', '#9ccdf7'], 'Story cast', 'A lighthouse keeper who writes to the moths.', 'Lonely, kind, very punctual.', 'Knitted jumper, lantern in hand.', {}],

  ['pip', 'clover', 'Clover', 'Bunny', ['fluffy', 'pastel'], 'she/her', ['#8ccf7e', '#ffffff'], 'Comfort crew', 'A lucky bunny with a four-leaf clover behind her ear.', 'Optimistic to a fault.', 'White with a green clover.', { favourite: true, pet: { shown: true, palette: 'white' } }],
  ['pip', 'byte', 'Byte', 'Robot', ['mecha', 'pastel'], 'it/its', ['#f6a5c0', '#9fdcc4'], 'OCs', 'Tin\'s pink twin, also wind-up.', 'Plays the harmony to Tin\'s tunes.', 'Pink body, mint key.', {}],
  ['pip', 'bun', 'Bun', 'Hamster', ['fluffy', 'feral'], 'he/him', ['#f2cf63', '#fff7d9'], 'Comfort crew', 'A hamster who stores entire muffins in his cheeks.', 'Snacky, wholesome, very round.', 'Cheeks always full.', {}],
  ['pip', 'fizz', 'Fizz', 'Slime', ['pastel'], 'they/them', ['#f2cf63', '#fff7d9'], 'Adopts', 'A lemonade slime that fizzes when it laughs.', 'Bubbly, of course.', 'Little bubbles rising inside.', {}],
  ['pip', 'chirp', 'Chirp', 'Chick', ['feathered', 'pastel'], 'she/her', ['#f2cf63', '#f2803a'], 'Adopts', 'A newly hatched chick still wearing half her shell.', 'Curious about absolutely everything.', 'Shell bits on her head.', {}],

  ['pia', 'blossom', 'Blossom', 'Cat', ['fluffy', 'pastel'], 'she/her', ['#f6a5c0', '#fde6ee'], 'OCs', 'A cherry-blossom cat who only appears in spring.', 'Sweet and fleeting.', 'Petals in her fur.', {}],
  ['pia', 'postie', 'Postie', 'Dog', ['fluffy', 'feral'], 'he/him', ['#a9744f', '#d64545'], 'Story cast', 'Petal\'s delivery partner, a sausage dog with a bag.', 'Loyal, terrible at stairs.', 'Red mail bag.', {}],
  ['pia', 'meadow', 'Meadow', 'Hedgehog', ['fluffy'], 'she/her', ['#c48a5c', '#8ccf7e'], 'Adopts', 'A hedgehog who sleeps in the flower meadow.', 'Dozy and sweet.', 'Daisy chain crown.', {}],
  ['pia', 'luma', 'Luma', 'Human', ['humanoid', 'fantasy'], 'they/them', ['#f6a5c0', '#2f4a7a'], 'Story cast', 'The town\'s spring festival organiser.', 'Energetic, plans everything twice.', 'Clipboard, flower hairpin.', {}],
  ['pia', 'dew', 'Dew', 'Frog', ['pastel'], 'he/him', ['#9fdcc4', '#ffffff'], 'Comfort crew', 'A dewdrop frog who lives on a lily pad.', 'Calm, says very little.', 'Shiny, almost see-through.', {}],

  ['luna', 'nyx', 'Nyx', 'Cat', ['fluffy', 'fantasy'], 'she/her', ['#2e2c36', '#c9b2ee'], 'OCs', 'A starry black cat who naps on the moon.', 'Mysterious, then demands snacks.', 'Tiny stars in the fur.', { favourite: true, pet: { shown: true, palette: 'charcoal' } }],
  ['luna', 'comet', 'Comet', 'Dragon', ['scaly', 'fantasy'], 'he/him', ['#9ccdf7', '#ffffff'], 'OCs', 'A small sky dragon with a glowing tail.', 'Excitable, zooms everywhere.', 'Tail leaves a sparkle trail.', {}],
  ['luna', 'velvet', 'Velvet', 'Moth', ['fluffy'], 'she/her', ['#45424f', '#c9b2ee'], 'Adopts', 'A velvet moth who wears a tiny cloak.', 'Elegant, soft-spoken.', 'Purple cloak, silver clasp.', {}],
  ['luna', 'eclipse', 'Eclipse', 'Human', ['humanoid', 'fantasy'], 'they/them', ['#2e2c36', '#e3b448'], 'Story cast', 'An astronomer who names stars after friends.', 'Gentle, a little lonely.', 'Telescope always nearby.', {}],
  ['luna', 'hush', 'Hush', 'Bunny', ['fluffy'], 'he/him', ['#a3a8b6', '#eceef3'], 'Comfort crew', 'A grey moon bunny who pounds mochi at night.', 'Very serious about mochi.', 'Little wooden mallet.', {}],

  ['otto', 'pondweed', 'Pondweed', 'Toad', ['feral'], 'he/him', ['#6b8f5e', '#c9a07a'], 'OCs', 'Sprout\'s grumpy uncle, a pond toad.', 'Grumbles, then helps anyway.', 'Warty, wears a tiny bowler hat.', {}],
  ['otto', 'biscotti', 'Biscotti', 'Dog', ['fluffy', 'feral'], 'she/her', ['#e9c48f', '#a9744f'], 'Comfort crew', 'A greenhouse dog who guards the tomatoes.', 'Alert, very sure of herself.', 'One ear up, one ear down.', {}],
  ['otto', 'figment', 'Figment', 'Slime', ['fantasy'], 'they/them', ['#c9b2ee', '#9ccdf7'], 'Adopts', 'A daydream slime that changes colour with moods.', 'Unpredictable, always friendly.', 'Gradient purple to blue.', {}],
  ['otto', 'barnaby', 'Barnaby', 'Bear', ['fluffy'], 'he/him', ['#7c5034', '#f2dcc6'], 'OCs', 'A gardener bear with a wheelbarrow of pumpkins.', 'Steady and proud of his pumpkins.', 'Dungarees, straw hat.', {}],
  ['otto', 'wisp', 'Wisp', 'Spirit', ['fantasy'], 'she/her', ['#e8f3fd', '#9ccdf7'], 'Story cast', 'A greenhouse spirit who mists the plants.', 'Whispery, kind.', 'Faint blue glow.', {}],

  ['bea', 'bumble', 'Bumble', 'Bee', ['fluffy', 'pastel'], 'she/her', ['#f2cf63', '#2e2c36'], 'OCs', 'A fuzzy bee who delivers honey jars with Quill.', 'Busy, cheerful, buzzes when nervous.', 'Striped jumper.', { favourite: true }],
  ['bea', 'pinecone', 'Pinecone', 'Hedgehog', ['fluffy', 'feral'], 'he/him', ['#7c5034', '#e9c48f'], 'Comfort crew', 'Quill\'s little brother, rolls into a ball when startled.', 'Startles easily, very brave after.', 'Smaller and darker than Quill.', {}],
  ['bea', 'parcel', 'Parcel', 'Penguin', ['feathered'], 'he/him', ['#2e2c36', '#ffffff', '#d64545'], 'Story cast', 'The post office\'s penguin sorter.', 'Methodical, loves stamps.', 'Red post cap.', {}],
  ['bea', 'lavender', 'Lavender', 'Mouse', ['fluffy', 'pastel'], 'she/her', ['#c9b2ee', '#f3edfd'], 'Adopts', 'A lavender mouse who dries flowers in the post office attic.', 'Dreamy and organised.', 'Smells like lavender (draw sparkles!).', {}],
  ['bea', 'stamp', 'Stamp', 'Dog', ['fluffy'], 'he/him', ['#ffffff', '#2e2c36'], 'Comfort crew', 'A dalmatian pup who thinks he is a postage stamp.', 'Silly, very lovable.', 'Spots in the shape of stamps.', {}],

  ['rio', 'tango', 'Tango', 'Dog', ['fluffy', 'feral'], 'he/him', ['#f2a65a', '#ffffff'], 'Comfort crew', 'A beach dog who dances in the waves.', 'Pure joy.', 'Sandy paws, floppy ears.', { favourite: true, pet: { shown: true, palette: 'ginger' } }],
  ['rio', 'coral', 'Coral', 'Axolotl', ['pastel', 'fantasy'], 'she/her', ['#f28f6b', '#fde6ee'], 'OCs', 'A coral axolotl who runs a rock-pool café.', 'Sociable, remembers every order.', 'Coral-orange gills.', {}],
  ['rio', 'shell', 'Shell', 'Hermit crab', ['fantasy'], 'they/them', ['#f6e3bf', '#f6a5c0'], 'Adopts', 'A crab who keeps trying on fancier shells.', 'Fashion-forward, anxious.', 'Shell changes every drawing!', {}],
  ['rio', 'sunset', 'Sunset', 'Bird', ['feathered'], 'she/her', ['#f2803a', '#c9b2ee'], 'OCs', 'A seabird whose feathers match the evening sky.', 'Calm, watches the horizon.', 'Orange to purple gradient.', {}],
  ['rio', 'surf', 'Surf', 'Human', ['humanoid'], 'he/him', ['#63b3f5', '#f2cf63'], 'Story cast', 'The lifeguard who befriended Mango.', 'Laid back, very responsible.', 'Yellow surfboard.', {}],

  ['vera', 'flurry', 'Flurry', 'Penguin', ['feathered', 'pastel'], 'she/her', ['#9ccdf7', '#ffffff'], 'Comfort crew', 'Dot\'s best friend, a pale-blue snow penguin.', 'Giggly, loves sledging.', 'Snowflake earmuffs.', { pet: { shown: true, palette: 'sky' } }],
  ['vera', 'onyx', 'Onyx', 'Cat', ['fluffy', 'feral'], 'he/him', ['#2e2c36', '#ffffff'], 'OCs', 'A tuxedo cat who matches Dot perfectly.', 'Dapper and dignified.', 'Black and white only, please.', {}],
  ['vera', 'ripple', 'Ripple', 'Slime', ['pastel'], 'they/them', ['#ffffff', '#d64545'], 'Adopts', 'A white slime with one red ribbon.', 'Minimalist, like its owner.', 'Red ribbon on top.', {}],
  ['vera', 'monochrome', 'Monochrome', 'Human', ['humanoid'], 'she/her', ['#2e2c36', '#ffffff', '#d64545'], 'Story cast', 'A fashion designer who only works in three colours.', 'Decisive, kind critique.', 'Red lipstick, black coat.', {}],
  ['vera', 'frost', 'Frost', 'Fox', ['fluffy', 'feral'], 'he/him', ['#f7f4ef', '#9ccdf7'], 'OCs', 'An arctic fox who naps in snowdrifts.', 'Sleepy, cool-headed.', 'Pure white, icy blue eyes.', {}],

  // Ada keeps a few too
  ['ada', 'patch', 'Patch', 'Cat', ['fluffy', 'feral'], 'she/her', ['#f7f4ef', '#f2a65a', '#2e2c36'], 'OCs', 'A calico office cat who naps on the keyboard during moderation shifts.', 'Supervises everything; approves of very little.', 'Calico: white, ginger and black patches.', { favourite: true, pet: { shown: true } }],
  ['ada', 'ledger', 'Ledger', 'Owl', ['feathered'], 'he/him', ['#a9744f', '#e9d8b4'], 'OCs', 'An owl who keeps the site rules in a very small book.', 'Wise, fair, a little stern.', 'Monocle, tiny book.', {}],
  ['ada', 'sudo', 'Sudo', 'Slime', ['pastel'], 'they/them', ['#9fdcc4', '#45424f'], 'Adopts', 'A terminal-green slime that blinks like a cursor.', 'Helpful, literal.', 'Blinking cursor on its face.', {}],
  ['ada', 'tea', 'Earl Grey', 'Bear', ['fluffy'], 'he/him', ['#a3a8b6', '#f6e3bf'], 'Comfort crew', 'A grey bear who brings tea to tired moderators.', 'Calm and comforting.', 'Teapot in paw.', {}],
];

// Everyone's extra characters, in the same shape as demo-data's character list
export function moreCharacters() {
  return MORE.map(([owner, key, name, species, tags, pronouns, colours, folder, description, personality, notesForArtists, extra]) => ({
    key,
    owner,
    name,
    species,
    tags,
    description,
    referenceLinks: [refFor(owner, key)],
    notesForArtists,
    archived: false,
    pronouns,
    personality,
    colours,
    folder,
    favourite: false,
    pet: { shown: false, kind: '', palette: '' },
    ...extra,
  }));
}
