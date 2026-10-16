// Museum room designs: colours for the walls, floor and furniture, and how the room is lit.
// Organisers pick one for their event's wing (Event.museumTheme); 'auto' gives each room of the
// wing the next design in turn.
//
// Colours for boxes are [left side, right side, top], matching furniture.js.
//
// Lighting:
//   day        evenly lit
//   warm       a little dim, with a lamp and a small picture light over each picture
//   spotlight  a dark room: a spotlight on every picture that's up, the sculpture and the lamp
//   track      a bright white gallery with track lights on the pictures
//   golden     late-afternoon sun slanting across the floor
export const LIGHTING = {
  day: { dark: 0, dim: 1 },
  warm: { dark: 0.32, shade: '#2b1233', dim: 0.8, lamp: true, pictureLights: true },
  spotlight: { dark: 0.7, shade: '#04040c', dim: 0.5, lamp: true, spots: true, beams: 0.22 },
  track: { dark: 0.22, shade: '#101018', dim: 0.85, spots: true, beams: 0.12 },
  golden: { dark: 0, dim: 1, sun: true },
};

export const MUSEUM_THEMES = [
  {
    key: 'blossom',
    label: 'Blossom',
    blurb: 'Peach walls, honey floorboards and plenty of daylight.',
    lighting: 'day',
    void: '#232838',
    wallLeft: ['#f1ddd5', '#e6c9bf'],
    wallRight: ['#f8e9e2', '#efd8cf'],
    skirt: ['#b08476', '#c39788'],
    cap: ['#fff6f1', '#d9b9ad'],
    floor: ['#d8b18a', '#cfa67e', '#c39a72'],
    rug: ['#c75b7f', '#b84f72', '#f4cf6a'],
    frame: ['#a46d43', '#7b4f2e', '#fbf6ee'],
    bench: ['#7d4f33', '#6a412a', '#b77d55'],
    chair: ['#b84f72', '#9c3f5f', '#ec8fb0'],
    pedestal: ['#e9e3ea', '#d4ccd6', '#fbf8fc'],
    sculpture: ['#ec6a93', '#f6a5c0'],
    pot: ['#c4643f', '#a9512f', '#5a3a26'],
  },
  {
    key: 'midnight',
    label: 'Midnight gallery',
    blurb: 'A dark room with a spotlight on every picture.',
    lighting: 'spotlight',
    void: '#0b0d18',
    wallLeft: ['#2a2f4d', '#232742'],
    wallRight: ['#30365a', '#282d4c'],
    skirt: ['#171a2d', '#1d2138'],
    cap: ['#3b4166', '#232742'],
    floor: ['#3a2e3a', '#342934', '#2a2129'],
    rug: ['#1f6f78', '#185a62', '#e8c766'],
    frame: ['#c9a24a', '#8a6a22', '#f5efe2'],
    bench: ['#4f2443', '#41203a', '#73385f'],
    chair: ['#7a2f3f', '#63253a', '#a1475b'],
    pedestal: ['#d9d3e0', '#bfb7c9', '#f0ecf5'],
    sculpture: ['#e8c766', '#f6e3a1'],
    pot: ['#3b3f5c', '#30344d', '#1e2133'],
  },
  {
    key: 'mint',
    label: 'Mint conservatory',
    blurb: 'Mint walls, a chequered floor and coral chairs.',
    lighting: 'day',
    void: '#1c3531',
    wallLeft: ['#dff2e8', '#cbe7d9'],
    wallRight: ['#e9f8f0', '#d7efe2'],
    skirt: ['#8fbfa9', '#a3cdb9'],
    cap: ['#f7fffb', '#b9dccb'],
    floor: ['#f3efe2', '#cfe6d8', '#bfdacb'],
    rug: ['#f08a7e', '#d9746a', '#ffffff'],
    frame: ['#e9e1d2', '#b5a68a', '#ffffff'],
    bench: ['#d6cfc0', '#c4bcab', '#efe9dc'],
    chair: ['#e57d71', '#c86a60', '#ffa99f'],
    pedestal: ['#ffffff', '#e2ece6', '#ffffff'],
    sculpture: ['#3fb6b2', '#8ad8d4'],
    pot: ['#f2f0ea', '#d9d5ca', '#5a3a26'],
  },
  {
    key: 'lavender',
    label: 'Lavender lounge',
    blurb: 'Soft purple walls, lamplight and a little picture light over each piece.',
    lighting: 'warm',
    void: '#1d1729',
    wallLeft: ['#e3d8f4', '#d3c4ec'],
    wallRight: ['#ede4f9', '#dfd2f2'],
    skirt: ['#8c76b2', '#9c86c0'],
    cap: ['#faf6ff', '#c7b6e2'],
    floor: ['#a68dba', '#9b82ae', '#8b739e'],
    rug: ['#5b3f8c', '#4c3477', '#f6c1d9'],
    frame: ['#4a3a5e', '#2f2440', '#fbf6ff'],
    bench: ['#5f4254', '#503747', '#7f5a72'],
    chair: ['#a46e9c', '#8b5a84', '#c690bd'],
    pedestal: ['#f2ecf8', '#ddd2ea', '#ffffff'],
    sculpture: ['#f6a5c0', '#ffd0e0'],
    pot: ['#7c5f9e', '#664c85', '#3c2d4f'],
  },
  {
    key: 'golden',
    label: 'Golden hour',
    blurb: 'Apricot walls, terracotta tiles and the evening sun across the floor.',
    lighting: 'golden',
    void: '#2c1b21',
    wallLeft: ['#ffd9bb', '#f5c29c'],
    wallRight: ['#ffe5cf', '#facfad'],
    skirt: ['#b97753', '#c98763'],
    cap: ['#fff3e8', '#e9b892'],
    floor: ['#d98a5f', '#cf7f55', '#bf7049'],
    rug: ['#2f8f8a', '#267a76', '#ffd27a'],
    frame: ['#7a4b2a', '#4f2f18', '#fff8ee'],
    bench: ['#8f5a31', '#7a4c29', '#b07443'],
    chair: ['#2f8f8a', '#267a76', '#4cb0aa'],
    pedestal: ['#fff4ea', '#f0dccb', '#ffffff'],
    sculpture: ['#ec6a93', '#f6a5c0'],
    pot: ['#3f7f6a', '#336b59', '#4a3020'],
  },
  {
    key: 'gallery',
    label: 'White cube',
    blurb: 'Bright white walls, a concrete floor and track lights on the pictures.',
    lighting: 'track',
    void: '#15171c',
    wallLeft: ['#f3f3f1', '#e6e6e2'],
    wallRight: ['#fafaf8', '#eeeeea'],
    skirt: ['#c4c4bf', '#d2d2cd'],
    cap: ['#ffffff', '#d6d6d1'],
    floor: ['#bdbbb6', '#b5b3ae', '#a8a6a1'],
    rug: ['#26262a', '#1b1b1e', '#e94e5b'],
    frame: ['#26262a', '#0f0f11', '#ffffff'],
    bench: ['#2c2c30', '#222226', '#3d3d42'],
    chair: ['#d9434f', '#b83641', '#f06470'],
    pedestal: ['#ffffff', '#e4e4e0', '#ffffff'],
    sculpture: ['#e94e5b', '#ff8a93'],
    pot: ['#ffffff', '#e4e4e0', '#3a3a3a'],
  },
];

export const MUSEUM_THEME_KEYS = MUSEUM_THEMES.map((t) => t.key);
// What an event can choose: a design for every room, or 'auto' (a different one each room)
export const MUSEUM_THEME_CHOICES = ['auto', ...MUSEUM_THEME_KEYS];

// The design for a room of a wing
export function themeFor(choice, roomIndex = 0) {
  const picked = MUSEUM_THEMES.find((t) => t.key === choice);
  if (picked) return picked;
  const n = MUSEUM_THEMES.length;
  return MUSEUM_THEMES[((Math.trunc(roomIndex) % n) + n) % n];
}

export function lightingOf(theme) {
  return LIGHTING[theme?.lighting] || LIGHTING.day;
}
