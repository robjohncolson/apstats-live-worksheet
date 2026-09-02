// Browser-only, dependency-free BIP-39/BIP-32 wallet derivation for the
// opt-in student self-custody ceremony. Secret material stays in memory and
// callers are expected to destroy each session immediately after the reveal.

export const DOGECOIN_DERIVATION_PATH = "m/44'/3'/0'/0/0";

const BIP39_ENGLISH_WORDS_TEXT = `
abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve
acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult
advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album
alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount
amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique
anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around
arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete
atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake
aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner
bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave
behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird
birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat
body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass
brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush
bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter
buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe
canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual
cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain
chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief
child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap
clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown
club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort
comic common company concert conduct confirm congress connect consider control convince cook cool copper copy
coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram
crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd
crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve
cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade
december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial
dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail
detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner
dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce
dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama
drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf
dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight
either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion
employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist
enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt
escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite
exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose
express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy
fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female
fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire
firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower
fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil
foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny
furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate
gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give
glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla
gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group
grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh
harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high
hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse
hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid
ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve
impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit
initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest
into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly
jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick
kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady
lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn
leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty
library license life lift light like limb limit link lion liquid list little live lizard load loan lobster
local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics
machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble
march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean
measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message
metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake
mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito
mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must
mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither
nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose
notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain
obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online
only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich
other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace
palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern
pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet
phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch
pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond
pony pool popular portion position possible post potato pottery poverty powder power practice praise predict
prefer prepare present pretty prevent price pride primary print priority prison private prize problem process
produce profit program project promote proof property prosper protect proud provide public pudding pull pulp
pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter
question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random
range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record
recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember
remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource
response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle
right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room
rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad
salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene
scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret
section security seed seek segment select sell seminar senior sense sentence series service session settle
setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop
short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver
similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep
slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff
snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul
sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike
spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium
staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach
stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit
subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface
surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch
sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi
teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this
thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast
tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple
torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap
trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet
trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type
typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit
universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used
useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle
velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view
village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage
wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear
weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide
width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder
wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth
zebra zero zone zoo
`;

export const BIP39_ENGLISH_WORDS = Object.freeze(
  BIP39_ENGLISH_WORDS_TEXT.trim().split(/\s+/u),
);

if (BIP39_ENGLISH_WORDS.length !== 2048) {
  throw new Error('The embedded BIP-39 English word list is incomplete.');
}

const BIP39_WORD_INDEX = new Map(
  BIP39_ENGLISH_WORDS.map((word, index) => [word, index]),
);

const TEXT_ENCODER = new TextEncoder();
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DOGECOIN_P2PKH_VERSION = 0x1e;
const HARDENED_INDEX = 0x80000000;
const BIP32_PATH_INDEXES = Object.freeze([
  HARDENED_INDEX + 44,
  HARDENED_INDEX + 3,
  HARDENED_INDEX,
  0,
  0,
]);

const SECP256K1_P =
  0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_G = Object.freeze([
  0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
]);

class InvalidBip32ChildError extends Error {}

const RIPEMD_LEFT_WORD = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
]);
const RIPEMD_RIGHT_WORD = Object.freeze([
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
]);
const RIPEMD_LEFT_ROTATION = Object.freeze([
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
]);
const RIPEMD_RIGHT_ROTATION = Object.freeze([
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
]);
const RIPEMD_LEFT_CONSTANT = Object.freeze([
  0x00000000,
  0x5a827999,
  0x6ed9eba1,
  0x8f1bbcdc,
  0xa953fd4e,
]);
const RIPEMD_RIGHT_CONSTANT = Object.freeze([
  0x50a28be6,
  0x5c4dd124,
  0x6d703ef3,
  0x7a6d76e9,
  0x00000000,
]);

function cryptoFromOptions(options) {
  if (Object.prototype.hasOwnProperty.call(options, 'crypto')) {
    return options.crypto;
  }
  return globalThis.crypto;
}

function requireWebCrypto(cryptoProvider, needsRandom = false) {
  if (needsRandom && typeof cryptoProvider?.getRandomValues !== 'function') {
    throw new Error('A secure crypto.getRandomValues implementation is required.');
  }

  const subtle = cryptoProvider?.subtle;
  const hasRequiredSubtle =
    typeof subtle?.digest === 'function' &&
    typeof subtle?.importKey === 'function' &&
    typeof subtle?.deriveBits === 'function' &&
    typeof subtle?.sign === 'function';

  if (!hasRequiredSubtle) {
    throw new Error('The Web Crypto subtle API is required.');
  }

  return cryptoProvider;
}

function asByteArray(value, label) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }

  if (!ArrayBuffer.isView(value)) {
    throw new TypeError(label + ' must be an ArrayBuffer or typed array.');
  }

  return new Uint8Array(
    value.buffer,
    value.byteOffset,
    value.byteLength,
  ).slice();
}

function joinBytes(...parts) {
  const byteParts = parts.map((part) => asByteArray(part, 'Byte input'));
  const length = byteParts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(length);
  let offset = 0;

  for (const part of byteParts) {
    joined.set(part, offset);
    offset += part.length;
    wipeBytes(part);
  }

  return joined;
}

function bigIntFromBytes(bytes) {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function bytesFromBigInt(value, length) {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new TypeError('The integer must be a non-negative bigint.');
  }

  const bytes = new Uint8Array(length);
  let remaining = value;

  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  if (remaining !== 0n) {
    wipeBytes(bytes);
    throw new RangeError('The integer does not fit in the requested byte length.');
  }

  return bytes;
}

export function wipeBytes(value) {
  if (value instanceof ArrayBuffer) {
    new Uint8Array(value).fill(0);
    return;
  }

  if (ArrayBuffer.isView(value)) {
    new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(0);
  }
}

async function sha256Bytes(input, cryptoProvider) {
  const cryptoApi = requireWebCrypto(cryptoProvider);
  const bytes = asByteArray(input, 'SHA-256 input');

  try {
    return new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
  } finally {
    wipeBytes(bytes);
  }
}

async function hmacSha512Bytes(keyInput, dataInput, cryptoProvider) {
  const cryptoApi = requireWebCrypto(cryptoProvider);
  const keyBytes = asByteArray(keyInput, 'HMAC key');
  const dataBytes = asByteArray(dataInput, 'HMAC data');

  try {
    const key = await cryptoApi.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    return new Uint8Array(await cryptoApi.subtle.sign('HMAC', key, dataBytes));
  } finally {
    wipeBytes(keyBytes);
    wipeBytes(dataBytes);
  }
}

function rotateLeft32(value, count) {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

function ripemdRoundValue(round, x, y, z) {
  if (round < 16) {
    return (x ^ y ^ z) >>> 0;
  }
  if (round < 32) {
    return ((x & y) | (~x & z)) >>> 0;
  }
  if (round < 48) {
    return ((x | ~y) ^ z) >>> 0;
  }
  if (round < 64) {
    return ((x & z) | (y & ~z)) >>> 0;
  }
  return (x ^ (y | ~z)) >>> 0;
}

function ripemd160Bytes(input) {
  const bytes = asByteArray(input, 'RIPEMD-160 input');
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLength = BigInt(bytes.length) * 8n;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(
    paddedLength - 8,
    Number(bitLength & 0xffffffffn),
    true,
  );
  paddedView.setUint32(
    paddedLength - 4,
    Number((bitLength >> 32n) & 0xffffffffn),
    true,
  );

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  try {
    for (let offset = 0; offset < padded.length; offset += 64) {
      const words = new Uint32Array(16);
      for (let index = 0; index < words.length; index += 1) {
        words[index] = paddedView.getUint32(offset + index * 4, true);
      }

      let al = h0;
      let bl = h1;
      let cl = h2;
      let dl = h3;
      let el = h4;
      let ar = h0;
      let br = h1;
      let cr = h2;
      let dr = h3;
      let er = h4;

      for (let round = 0; round < 80; round += 1) {
        const leftRound = Math.floor(round / 16);
        const leftSum = (
          al +
          ripemdRoundValue(round, bl, cl, dl) +
          words[RIPEMD_LEFT_WORD[round]] +
          RIPEMD_LEFT_CONSTANT[leftRound]
        ) >>> 0;
        const leftNext = (
          rotateLeft32(leftSum, RIPEMD_LEFT_ROTATION[round]) + el
        ) >>> 0;
        al = el;
        el = dl;
        dl = rotateLeft32(cl, 10);
        cl = bl;
        bl = leftNext;

        const rightRound = Math.floor(round / 16);
        const rightSum = (
          ar +
          ripemdRoundValue(79 - round, br, cr, dr) +
          words[RIPEMD_RIGHT_WORD[round]] +
          RIPEMD_RIGHT_CONSTANT[rightRound]
        ) >>> 0;
        const rightNext = (
          rotateLeft32(rightSum, RIPEMD_RIGHT_ROTATION[round]) + er
        ) >>> 0;
        ar = er;
        er = dr;
        dr = rotateLeft32(cr, 10);
        cr = br;
        br = rightNext;
      }

      const nextH0 = (h1 + cl + dr) >>> 0;
      const nextH1 = (h2 + dl + er) >>> 0;
      const nextH2 = (h3 + el + ar) >>> 0;
      const nextH3 = (h4 + al + br) >>> 0;
      const nextH4 = (h0 + bl + cr) >>> 0;
      h0 = nextH0;
      h1 = nextH1;
      h2 = nextH2;
      h3 = nextH3;
      h4 = nextH4;
      wipeBytes(words);
    }

    const digest = new Uint8Array(20);
    const digestView = new DataView(digest.buffer);
    digestView.setUint32(0, h0, true);
    digestView.setUint32(4, h1, true);
    digestView.setUint32(8, h2, true);
    digestView.setUint32(12, h3, true);
    digestView.setUint32(16, h4, true);
    return digest;
  } finally {
    wipeBytes(bytes);
    wipeBytes(padded);
  }
}

async function hash160Bytes(input, cryptoProvider) {
  const shaDigest = await sha256Bytes(input, cryptoProvider);
  try {
    return ripemd160Bytes(shaDigest);
  } finally {
    wipeBytes(shaDigest);
  }
}

function base58EncodeBytes(input) {
  const bytes = asByteArray(input, 'Base58 input');
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1;
  }

  let value = bigIntFromBytes(bytes);
  let encoded = '';
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }

  wipeBytes(bytes);
  return '1'.repeat(leadingZeros) + encoded;
}

async function base58Check(payloadInput, cryptoProvider) {
  const payload = asByteArray(payloadInput, 'Base58Check payload');
  let firstHash;
  let secondHash;
  let encoded;

  try {
    firstHash = await sha256Bytes(payload, cryptoProvider);
    secondHash = await sha256Bytes(firstHash, cryptoProvider);
    encoded = joinBytes(payload, secondHash.subarray(0, 4));
    return base58EncodeBytes(encoded);
  } finally {
    wipeBytes(payload);
    wipeBytes(firstHash);
    wipeBytes(secondHash);
    wipeBytes(encoded);
  }
}

function modP(value) {
  const result = value % SECP256K1_P;
  return result >= 0n ? result : result + SECP256K1_P;
}

function invertModP(value) {
  const normalized = modP(value);
  if (normalized === 0n) {
    throw new RangeError('Cannot invert zero on the secp256k1 field.');
  }

  let exponent = SECP256K1_P - 2n;
  let base = normalized;
  let inverse = 1n;

  while (exponent > 0n) {
    if ((exponent & 1n) === 1n) {
      inverse = modP(inverse * base);
    }
    base = modP(base * base);
    exponent >>= 1n;
  }

  return inverse;
}

function doubleCurvePoint(point) {
  if (point === null || point[1] === 0n) {
    return null;
  }

  const [x, y] = point;
  const slope = modP(3n * x * x * invertModP(2n * y));
  const nextX = modP(slope * slope - 2n * x);
  const nextY = modP(slope * (x - nextX) - y);
  return [nextX, nextY];
}

function addCurvePoints(left, right) {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }

  const [leftX, leftY] = left;
  const [rightX, rightY] = right;

  if (leftX === rightX) {
    if (leftY !== rightY) {
      return null;
    }
    return doubleCurvePoint(left);
  }

  const slope = modP(
    (rightY - leftY) * invertModP(rightX - leftX),
  );
  const nextX = modP(slope * slope - leftX - rightX);
  const nextY = modP(slope * (leftX - nextX) - leftY);
  return [nextX, nextY];
}

function multiplyGenerator(scalar) {
  if (scalar <= 0n || scalar >= SECP256K1_N) {
    throw new RangeError('The secp256k1 private scalar is out of range.');
  }

  let remaining = scalar;
  let addend = SECP256K1_G;
  let result = null;

  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = addCurvePoints(result, addend);
    }
    addend = doubleCurvePoint(addend);
    remaining >>= 1n;
  }

  return result;
}

export function privateKeyToCompressedPublicKey(privateKeyInput) {
  const privateKey = asByteArray(privateKeyInput, 'Private key');
  if (privateKey.length !== 32) {
    wipeBytes(privateKey);
    throw new RangeError('A secp256k1 private key must contain 32 bytes.');
  }

  try {
    const scalar = bigIntFromBytes(privateKey);
    const point = multiplyGenerator(scalar);
    const publicKey = new Uint8Array(33);
    publicKey[0] = point[1] % 2n === 0n ? 0x02 : 0x03;
    publicKey.set(bytesFromBigInt(point[0], 32), 1);
    return publicKey;
  } finally {
    wipeBytes(privateKey);
  }
}

function serializeIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
    throw new RangeError('A BIP-32 child index must be an unsigned 32-bit integer.');
  }

  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, index, false);
  return bytes;
}

async function deriveChildPrivateKey(
  parentPrivateInput,
  parentChainCodeInput,
  index,
  cryptoProvider,
) {
  const parentPrivate = asByteArray(parentPrivateInput, 'Parent private key');
  const parentChainCode = asByteArray(parentChainCodeInput, 'Parent chain code');
  let childData;
  let indexBytes;
  let hmacInput;
  let digest;

  if (parentPrivate.length !== 32 || parentChainCode.length !== 32) {
    wipeBytes(parentPrivate);
    wipeBytes(parentChainCode);
    throw new RangeError('BIP-32 keys and chain codes must contain 32 bytes.');
  }

  try {
    if (index >= HARDENED_INDEX) {
      childData = joinBytes(new Uint8Array([0]), parentPrivate);
    } else {
      childData = privateKeyToCompressedPublicKey(parentPrivate);
    }

    indexBytes = serializeIndex(index);
    hmacInput = joinBytes(childData, indexBytes);
    digest = await hmacSha512Bytes(
      parentChainCode,
      hmacInput,
      cryptoProvider,
    );

    const leftScalar = bigIntFromBytes(digest.subarray(0, 32));
    if (leftScalar >= SECP256K1_N) {
      throw new InvalidBip32ChildError(
        'BIP-32 produced an invalid child scalar.',
      );
    }

    const parentScalar = bigIntFromBytes(parentPrivate);
    const childScalar = (leftScalar + parentScalar) % SECP256K1_N;
    if (childScalar === 0n) {
      throw new InvalidBip32ChildError(
        'BIP-32 produced the zero child key.',
      );
    }

    return {
      privateKey: bytesFromBigInt(childScalar, 32),
      chainCode: digest.slice(32),
    };
  } finally {
    wipeBytes(parentPrivate);
    wipeBytes(parentChainCode);
    wipeBytes(childData);
    wipeBytes(indexBytes);
    wipeBytes(hmacInput);
    wipeBytes(digest);
  }
}

export async function deriveBip32PrivateKey(
  seedInput,
  cryptoProvider = globalThis.crypto,
) {
  const seed = asByteArray(seedInput, 'BIP-32 seed');
  const masterKey = TEXT_ENCODER.encode('Bitcoin seed');
  let masterDigest;
  let privateKey;
  let chainCode;

  if (seed.length < 16 || seed.length > 64) {
    wipeBytes(seed);
    wipeBytes(masterKey);
    throw new RangeError('A BIP-32 seed must contain between 16 and 64 bytes.');
  }

  try {
    masterDigest = await hmacSha512Bytes(masterKey, seed, cryptoProvider);
    privateKey = masterDigest.slice(0, 32);
    chainCode = masterDigest.slice(32);

    const masterScalar = bigIntFromBytes(privateKey);
    if (masterScalar === 0n || masterScalar >= SECP256K1_N) {
      throw new Error('BIP-32 produced an invalid master private key.');
    }

    for (const startingIndex of BIP32_PATH_INDEXES) {
      let index = startingIndex;
      let child = null;

      while (!child) {
        try {
          child = await deriveChildPrivateKey(
            privateKey,
            chainCode,
            index,
            cryptoProvider,
          );
        } catch (error) {
          if (!(error instanceof InvalidBip32ChildError)) throw error;
          if (index === 0xffffffff) {
            throw new Error('BIP-32 exhausted the child-index range.');
          }
          index += 1;
        }
      }

      wipeBytes(privateKey);
      wipeBytes(chainCode);
      privateKey = child.privateKey;
      chainCode = child.chainCode;
    }

    return privateKey.slice();
  } finally {
    wipeBytes(seed);
    wipeBytes(masterKey);
    wipeBytes(masterDigest);
    wipeBytes(privateKey);
    wipeBytes(chainCode);
  }
}

function normalizeMnemonic(mnemonic) {
  if (typeof mnemonic !== 'string') {
    throw new TypeError('The mnemonic must be a string.');
  }

  return mnemonic
    .normalize('NFKD')
    .trim()
    .split(/\s+/u)
    .join(' ');
}

export async function entropyToMnemonic(
  entropyInput,
  cryptoProvider = globalThis.crypto,
) {
  const entropy = asByteArray(entropyInput, 'BIP-39 entropy');
  const validLength = [16, 20, 24, 28, 32].includes(entropy.length);
  let hash;

  if (!validLength) {
    wipeBytes(entropy);
    throw new RangeError(
      'BIP-39 entropy must contain 16, 20, 24, 28, or 32 bytes.',
    );
  }

  try {
    hash = await sha256Bytes(entropy, cryptoProvider);
    const checksumBitCount = entropy.length / 4;
    const checksum = hash[0] >> (8 - checksumBitCount);
    let combined =
      (bigIntFromBytes(entropy) << BigInt(checksumBitCount)) |
      BigInt(checksum);
    const wordCount = (entropy.length * 8 + checksumBitCount) / 11;
    const words = new Array(wordCount);

    for (let index = wordCount - 1; index >= 0; index -= 1) {
      words[index] = BIP39_ENGLISH_WORDS[Number(combined & 0x7ffn)];
      combined >>= 11n;
    }

    return words.join(' ');
  } finally {
    wipeBytes(entropy);
    wipeBytes(hash);
  }
}

export async function mnemonicToEntropy(
  mnemonic,
  cryptoProvider = globalThis.crypto,
) {
  const normalized = normalizeMnemonic(mnemonic);
  const words = normalized === '' ? [] : normalized.split(' ');
  const validWordCount = [12, 15, 18, 21, 24].includes(words.length);
  if (!validWordCount) {
    throw new RangeError('A BIP-39 mnemonic must contain 12, 15, 18, 21, or 24 words.');
  }

  let combined = 0n;
  for (const word of words) {
    const wordIndex = BIP39_WORD_INDEX.get(word);
    if (wordIndex === undefined) {
      throw new Error('The mnemonic contains a word outside the BIP-39 English list.');
    }
    combined = (combined << 11n) | BigInt(wordIndex);
  }

  const totalBitCount = words.length * 11;
  const entropyBitCount = Math.floor((totalBitCount * 32) / 33);
  const checksumBitCount = totalBitCount - entropyBitCount;
  const checksumMask = (1n << BigInt(checksumBitCount)) - 1n;
  const expectedChecksum = Number(combined & checksumMask);
  const entropy = bytesFromBigInt(
    combined >> BigInt(checksumBitCount),
    entropyBitCount / 8,
  );
  let hash;

  try {
    hash = await sha256Bytes(entropy, cryptoProvider);
    const actualChecksum = hash[0] >> (8 - checksumBitCount);
    if (actualChecksum !== expectedChecksum) {
      throw new Error('The BIP-39 mnemonic checksum is invalid.');
    }
    return entropy.slice();
  } finally {
    wipeBytes(entropy);
    wipeBytes(hash);
    words.fill('');
  }
}

export async function validateMnemonic(
  mnemonic,
  cryptoProvider = globalThis.crypto,
) {
  let entropy;
  try {
    entropy = await mnemonicToEntropy(mnemonic, cryptoProvider);
    return true;
  } catch {
    return false;
  } finally {
    wipeBytes(entropy);
  }
}

export async function mnemonicToSeed(
  mnemonic,
  passphrase = '',
  cryptoProvider = globalThis.crypto,
) {
  const cryptoApi = requireWebCrypto(cryptoProvider);
  if (typeof passphrase !== 'string') {
    throw new TypeError('The BIP-39 passphrase must be a string.');
  }

  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  const normalizedPassphrase = passphrase.normalize('NFKD');
  const phraseBytes = TEXT_ENCODER.encode(normalizedMnemonic);
  const saltBytes = TEXT_ENCODER.encode('mnemonic' + normalizedPassphrase);

  try {
    const key = await cryptoApi.subtle.importKey(
      'raw',
      phraseBytes,
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const seed = await cryptoApi.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-512',
        iterations: 2048,
        salt: saltBytes,
      },
      key,
      512,
    );
    return new Uint8Array(seed);
  } finally {
    wipeBytes(phraseBytes);
    wipeBytes(saltBytes);
  }
}

export async function publicKeyToDogecoinAddress(
  publicKeyInput,
  cryptoProvider = globalThis.crypto,
) {
  const publicKey = asByteArray(publicKeyInput, 'Compressed public key');
  let publicKeyHash;
  let payload;

  const validPrefix = publicKey[0] === 0x02 || publicKey[0] === 0x03;
  if (publicKey.length !== 33 || !validPrefix) {
    wipeBytes(publicKey);
    throw new RangeError('A compressed secp256k1 public key must contain 33 bytes.');
  }

  try {
    publicKeyHash = await hash160Bytes(publicKey, cryptoProvider);
    payload = joinBytes(
      new Uint8Array([DOGECOIN_P2PKH_VERSION]),
      publicKeyHash,
    );
    return await base58Check(payload, cryptoProvider);
  } finally {
    wipeBytes(publicKey);
    wipeBytes(publicKeyHash);
    wipeBytes(payload);
  }
}

export async function walletFromMnemonic(mnemonic, options = {}) {
  const cryptoProvider = cryptoFromOptions(options);
  const passphrase = options.passphrase ?? '';
  let checkedEntropy;
  let seed;
  let privateKey;
  let publicKey;

  try {
    checkedEntropy = await mnemonicToEntropy(mnemonic, cryptoProvider);
    seed = await mnemonicToSeed(mnemonic, passphrase, cryptoProvider);
    privateKey = await deriveBip32PrivateKey(seed, cryptoProvider);
    publicKey = privateKeyToCompressedPublicKey(privateKey);
    const address = await publicKeyToDogecoinAddress(
      publicKey,
      cryptoProvider,
    );

    return {
      address,
      path: DOGECOIN_DERIVATION_PATH,
    };
  } finally {
    wipeBytes(checkedEntropy);
    wipeBytes(seed);
    wipeBytes(privateKey);
    wipeBytes(publicKey);
  }
}

export function pickWordIndexes(
  wordCount,
  pickCount = 3,
  cryptoProvider = globalThis.crypto,
) {
  const cryptoApi = requireWebCrypto(cryptoProvider, true);
  if (!Number.isInteger(wordCount) || wordCount < 1) {
    throw new RangeError('The word count must be a positive integer.');
  }
  if (
    !Number.isInteger(pickCount) ||
    pickCount < 1 ||
    pickCount > wordCount
  ) {
    throw new RangeError('The pick count must fit within the word count.');
  }

  const maximumAccepted =
    Math.floor(0x100000000 / wordCount) * wordCount;
  const indexes = new Set();
  const randomValue = new Uint32Array(1);

  try {
    while (indexes.size < pickCount) {
      cryptoApi.getRandomValues(randomValue);
      if (randomValue[0] >= maximumAccepted) {
        continue;
      }
      indexes.add(randomValue[0] % wordCount);
    }
  } finally {
    wipeBytes(randomValue);
  }

  return [...indexes].sort((left, right) => left - right);
}

function protectRevealWords(words) {
  return new Proxy(words, {
    set(target, property, value) {
      const index = Number(property);
      const isWordIndex =
        Number.isInteger(index) &&
        index >= 0 &&
        index < target.length &&
        String(index) === property;

      if (isWordIndex && value === '') {
        target[index] = '';
        return true;
      }

      throw new TypeError('Wallet recovery words are read-only.');
    },
    defineProperty() {
      throw new TypeError('Wallet recovery words are read-only.');
    },
    deleteProperty() {
      throw new TypeError('Wallet recovery words are read-only.');
    },
    setPrototypeOf() {
      throw new TypeError('Wallet recovery words are read-only.');
    },
  });
}

export async function createWallet(options = {}) {
  const cryptoProvider = cryptoFromOptions(options);
  const cryptoApi = requireWebCrypto(cryptoProvider, true);
  const entropy = new Uint8Array(16);
  let mnemonic = '';
  let sessionWords;

  try {
    cryptoApi.getRandomValues(entropy);
    mnemonic = await entropyToMnemonic(entropy, cryptoProvider);
    const wallet = await walletFromMnemonic(mnemonic, options);
    sessionWords = mnemonic.split(' ');
    const revealWords = protectRevealWords(sessionWords);
    mnemonic = '';

    let destroyed = false;
    const session = {
      address: wallet.address,
      path: wallet.path,
      words() {
        if (destroyed) {
          throw new Error('This wallet reveal session has been destroyed.');
        }
        return revealWords;
      },
      destroy() {
        if (destroyed) {
          return;
        }
        sessionWords.fill('');
        sessionWords = [];
        destroyed = true;
      },
      get destroyed() {
        return destroyed;
      },
    };

    return Object.freeze(session);
  } catch (error) {
    mnemonic = '';
    sessionWords?.fill('');
    sessionWords = [];
    throw error;
  } finally {
    wipeBytes(entropy);
  }
}

export function wipeWalletSecrets(wallet) {
  if (!wallet || typeof wallet !== 'object') {
    return;
  }

  if (typeof wallet.destroy === 'function') {
    wallet.destroy();
  }

  const secretFields = [
    'entropy',
    'mnemonic',
    'phrase',
    'privateKey',
    'seed',
    'words',
  ];
  for (const field of secretFields) {
    const value = wallet[field];
    wipeBytes(value);
    if (Array.isArray(value)) {
      value.fill('');
    }
    if (typeof value === 'string') {
      try {
        wallet[field] = '';
      } catch {
        // A frozen ceremony session is already handled by destroy().
      }
    }
  }
}

export const StudentWallet = Object.freeze({
  BIP39_ENGLISH_WORDS,
  DOGECOIN_DERIVATION_PATH,
  createWallet,
  deriveBip32PrivateKey,
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeed,
  pickWordIndexes,
  privateKeyToCompressedPublicKey,
  publicKeyToDogecoinAddress,
  validateMnemonic,
  walletFromMnemonic,
  wipeBytes,
  wipeWalletSecrets,
});

globalThis.StudentWallet = StudentWallet;

export default StudentWallet;
