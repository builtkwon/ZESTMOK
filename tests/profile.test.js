// Run: node tests/profile.test.js  (pure parts of profile.js: JWT, size loop, storage shape, validation)
const assert = require('assert');
globalThis.TeamLogic = require('../team.js'); // profile.js validates with TeamLogic.validAvatar
const P = require('../profile.js')._;

// JWT payload: base64url, no padding, UTF-8 name; signature is not checked
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const claims = { sub: '1234567890', name: '김오목 ~?>', picture: 'https://lh3.googleusercontent.com/a/ACg8oc-_x=s96-c' };
assert.deepStrictEqual(P.decodeJwt('h.' + b64u(claims) + '.sig'), claims);
assert.strictEqual(P.decodeJwt('not-a-jwt'), null);
assert.strictEqual(P.decodeJwt('h.@@@.s'), null);
assert.strictEqual(P.decodeJwt(null), null);

// Google picture: s96 -> s128; anything else unchanged
assert.strictEqual(P.bigPicture('https://lh3.googleusercontent.com/a/x=s96-c'), 'https://lh3.googleusercontent.com/a/x=s128-c');
assert.strictEqual(P.bigPicture('https://lh3.googleusercontent.com/a/x'), 'https://lh3.googleusercontent.com/a/x');

// GIS payload -> stored google/name; picture that would fail validation is dropped
assert.deepStrictEqual(P.fromClaims(claims), { name: '김오목 ~?>', google: { sub: '1234567890', picture: 'https://lh3.googleusercontent.com/a/ACg8oc-_x=s128-c' } });
assert.deepStrictEqual(P.fromClaims({ sub: '1', picture: 'https://evil.example/a.png' }), { name: null, google: { sub: '1', picture: null } });
assert.strictEqual(P.fromClaims({ name: 'no sub' }), null);
assert.strictEqual(P.fromClaims({ sub: '1', name: '가'.repeat(70) }).name, '가'.repeat(64), 'name capped at 64');
assert.strictEqual(P.fromClaims(null), null);

// size loop: first encoding with length <= 44,000 wins, in the given order; none fits -> null
const MAX = 44000;
const tried = [];
const sizes = { 0.8: MAX + 1, 0.6: MAX, 0.4: 10 };
assert.strictEqual(P.firstFit([0.8, 0.6, 0.4], (q) => { tried.push(q); return 'x'.repeat(sizes[q]); }).length, MAX);
assert.deepStrictEqual(tried, [0.8, 0.6], 'stops at the first that fits');
assert.strictEqual(P.firstFit([0.8, 0.6, 0.4], () => 'x'.repeat(MAX + 1)), null);
assert.strictEqual(P.firstFit([0.8], () => null), null, 'encoder failure is not a fit');

// avatar validation (docs/profile-stones.md §5) via TeamLogic.validAvatar
const jpg = 'data:image/jpeg;base64,' + 'A'.repeat(100);
assert(P.validAvatar('https://lh3.googleusercontent.com/a/ACg8oc-_x=s128-c'));
assert(P.validAvatar(jpg));
assert(P.validAvatar('data:image/png;base64,iVBOR+/='));
assert(P.validAvatar('data:image/webp;base64,UklG'));
assert(P.validAvatar('data:image/png;base64,' + 'A'.repeat(MAX - 22)), 'exactly 44,000 chars');
assert(!P.validAvatar('data:image/png;base64,' + 'A'.repeat(MAX - 21)), '44,001 chars');
assert(!P.validAvatar('data:image/gif;base64,R0lG'));
assert(!P.validAvatar('data:image/png;base64,A")'), 'css injection');
assert(!P.validAvatar('https://lh3.googleusercontent.com/a/x"); background:red'));
assert(!P.validAvatar('http://lh3.googleusercontent.com/a/x'));
assert(!P.validAvatar('https://lh3.googleusercontent.com.evil.com/a'));
assert(!P.validAvatar(null));
assert(!P.validAvatar(42));
assert.strictEqual(P.stoneValue(jpg), 'url("' + jpg + '")');
assert.strictEqual(P.stoneValue('javascript:x'), null);
assert.strictEqual(P.stoneValue(null), null);

// storage shape: {name, google: {sub, picture} | null, upload | null, matted: {from, png} | null}; junk -> empty
const EMPTY = { name: null, google: null, upload: null, matted: null };
assert.deepStrictEqual(P.readStore(null), EMPTY);
assert.deepStrictEqual(P.readStore('{bad json'), EMPTY);
assert.deepStrictEqual(P.readStore('[1,2]'), EMPTY);
assert.deepStrictEqual(P.readStore(JSON.stringify({ name: 5, google: { sub: 1 }, upload: 'javascript:x', matted: { from: jpg } })), EMPTY);
const full = { name: '오목', google: { sub: '1', picture: 'https://lh3.googleusercontent.com/a/x=s128-c' }, upload: jpg, matted: { from: jpg, png: 'data:image/png;base64,AAAA' } };
assert.deepStrictEqual(P.readStore(JSON.stringify(full)), full);
assert.deepStrictEqual(P.readStore(JSON.stringify({ google: { sub: '1', picture: null } })), { ...EMPTY, google: { sub: '1', picture: null } });

assert.strictEqual(P.readStore(JSON.stringify({ name: 'n'.repeat(65) })).name, 'n'.repeat(64), 'stored name capped at 64');

// photo priority: matted (of the current source) > upload > Google > null
const g = full.google.picture;
assert.strictEqual(P.photoOf(EMPTY), null);
assert.strictEqual(P.photoOf({ ...EMPTY, google: full.google }), g);
assert.strictEqual(P.photoOf({ ...EMPTY, google: full.google, upload: jpg }), jpg);
assert.strictEqual(P.photoOf(full), full.matted.png);
assert.strictEqual(P.photoOf({ ...full, matted: { from: g, png: 'data:image/png;base64,BB' } }), jpg, 'stale matte (other source) is ignored');
assert.strictEqual(P.photoOf({ ...EMPTY, google: full.google, matted: { from: g, png: 'data:image/png;base64,BB' } }), 'data:image/png;base64,BB');
assert.strictEqual(P.sourceOf(full), jpg);
assert.strictEqual(P.sourceOf({ ...EMPTY, google: full.google }), g);
assert.strictEqual(P.sourceOf(EMPTY), null);

// matte: alpha = person confidence; almost no person -> null (keep the plain photo)
const rgba = new Uint8ClampedArray(4 * 4).fill(200);
assert.deepStrictEqual(Array.from(P.applyMask(rgba, [1, 0.5, 0, 0])).filter((_, i) => i % 4 === 3), [255, 128, 0, 0]);
assert.strictEqual(P.applyMask(new Uint8ClampedArray(4 * 100).fill(200), new Array(100).fill(0.01)), null, 'no person found');

console.log('profile tests passed');
