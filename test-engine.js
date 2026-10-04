var R = require('./engine.js'); var fails = 0, n = 0;
function eq(a, b, m) { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); } }
function ok(c, m) { n++; if (!c) { fails++; console.log('FAIL', m); } }
var seed = 3; function rnd(m) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; }
function trace(len, maxGap, bursty) { var t = 0, out = []; for (var i = 0; i < len; i++) { t += bursty && rnd(3) ? 0 : rnd(maxGap + 1); out.push(t); } return out; }
// Wikipedia (Leaky bucket, Token bucket, GCRA): the token bucket, the leaky bucket as a meter and the GCRA (virtual scheduling) are the same meter.
// Three independent implementations must give the same decision for every request.
for (var t = 0; t < 600; t++) {
  var L = 1 + rnd(8), W = 100 + rnd(2000), b = 1 + rnd(10), tr = trace(5 + rnd(60), Math.floor(W / L) * (1 + rnd(3)), rnd(2) === 0);
  var a = R.tokenBucket(tr, L, W, b), g = R.gcra(tr, L, W, b), l = R.leakyMeter(tr, L, W, b);
  eq(g, a, 'GCRA = token bucket ' + t); eq(l, a, 'leaky meter = token bucket ' + t);
}
// ties: arrivals exactly when a token completes are accepted by all three
eq(R.tokenBucket([0, 0, 200], 5, 1000, 2), [true, true, true], 'tie at 200 ms: token complete'); eq(R.gcra([0, 0, 200], 5, 1000, 2), [true, true, true], 'GCRA tie'); eq(R.leakyMeter([0, 0, 200], 5, 1000, 2), [true, true, true], 'leaky tie'); eq(R.tokenBucket([0, 0, 199], 5, 1000, 2), [true, true, false], '1 ms early is denied');
// burst and sustained rate: a full bucket lets b requests through at once, then L per W
eq(R.tokenBucket([0, 0, 0, 0, 0, 0], 5, 1000, 5), [true, true, true, true, true, false], 'burst of 5 then deny');
eq(R.tokenBucket([0, 0, 0, 0, 0, 0, 1000, 1000, 1000, 1000, 1000, 1000], 5, 1000, 5).filter(Boolean).length, 10, 'refills 5 per second');
// brute-force bound: in any closed interval of length w, a token bucket accepts at most b + floor(L*w/W)
for (t = 0; t < 300; t++) {
  L = 1 + rnd(6); W = 200 + rnd(1500); b = 1 + rnd(8); tr = trace(80, Math.floor(W / L), true); a = R.tokenBucket(tr, L, W, b);
  [0, 1, Math.floor(W / 3), W - 1, W, 2 * W, 3 * W].forEach(function (w) { ok(R.maxInInterval(tr, a, w) <= b + Math.floor(L * w / W), 'token bucket bound ' + [L, W, b, w]); });
}
// fixed window boundary problem: L at the end of one window and L at the start of the next are all accepted, 2L within 2 ms
var fw = [], k; for (k = 0; k < 5; k++) fw.push(999); for (k = 0; k < 5; k++) fw.push(1000);
eq(R.fixedWindow(fw, 5, 1000), [true, true, true, true, true, true, true, true, true, true], 'fixed window lets 10 through around the boundary');
eq(R.summary(fw, R.fixedWindow(fw, 5, 1000), 1000).maxInWindow, 10, 'summary: 10 in one window length');
eq(R.slidingLog(fw, 5, 1000), [true, true, true, true, true, false, false, false, false, false], 'sliding log stops the boundary burst'); eq(R.tokenBucket(fw, 5, 1000, 5).filter(Boolean).length, 5, 'token bucket also 5');
// sliding log never exceeds L in any window of length W (closed interval of W-1 ms), brute force
for (t = 0; t < 300; t++) { L = 1 + rnd(8); W = 100 + rnd(1500); tr = trace(100, Math.floor(W / L), true); var s = R.slidingLog(tr, L, W); ok(R.maxInInterval(tr, s, W - 1) <= L, 'sliding log bound ' + [L, W]); var f = R.fixedWindow(tr, L, W); ok(R.maxInInterval(tr, f, 2 * W - 1) <= 3 * L, 'fixed window at most 3L in 2W (spans three windows)'); ok(R.maxInInterval(tr, f, W - 1) <= 2 * L, 'fixed window at most 2L in one W'); }
// fixed window per window count is at most L, sliding log accepts a subset-or-equal count of fixed on aligned traffic
for (t = 0; t < 100; t++) { L = 1 + rnd(8); W = 100 + rnd(900); tr = trace(60, W, true); var fc = {}; R.fixedWindow(tr, L, W).forEach(function (v, i) { if (v) { var w = Math.floor(tr[i] / W); fc[w] = (fc[w] || 0) + 1; } }); ok(Object.keys(fc).every(function (w) { return fc[w] <= L; }), 'fixed window count per window <= L'); }
// retry after: waiting exactly that long makes the request pass, one ms less does not (brute force through the token bucket)
for (t = 0; t < 200; t++) {
  L = 1 + rnd(6); W = 200 + rnd(1500); b = 1 + rnd(6); tr = trace(30, Math.floor(W / L), true); var now = tr[tr.length - 1] + rnd(50), wait = R.retryAfter(tr, now, L, W, b);
  var pass = R.tokenBucket(tr.concat([now + wait]), L, W, b); eq(pass[pass.length - 1], true, 'passes after retry-after ' + t);
  if (wait > 0) { var early = R.tokenBucket(tr.concat([now + wait - 1]), L, W, b); eq(early[early.length - 1], false, 'one ms earlier is denied ' + t); }
}
// retry-after on an empty bucket: one token takes W/L ms
eq(R.retryAfter([0, 0, 0, 0, 0], 0, 5, 1000, 5), 200, 'empty bucket waits 200 ms for the next token'); eq(R.retryAfter([], 0, 5, 1000, 5), 0, 'fresh bucket accepts');
eq(R.refillMs(5, 1000, 5), 1000, 'empty to full in 1 s'); eq(R.refillMs(100, 60000, 20), 12000, '20 tokens at 100 per minute take 12 s'); eq(R.describe(100, 60000, 20).perSecond, 100 / 60, 'per second');
// the burst-plus-refill worst case is reachable: 5 at once, then one every 200 ms, gives 9 inside 800 ms
var worst = [0, 0, 0, 0, 0, 200, 400, 600, 800]; eq(R.tokenBucket(worst, 5, 1000, 5).every(Boolean), true, 'worst case all accepted'); eq(R.maxInInterval(worst, R.tokenBucket(worst, 5, 1000, 5), 999), R.describe(5, 1000, 5).tokenWorst, 'describe.tokenWorst is reached'); eq(R.describe(5, 1000, 5).tokenWorst, 9, 'worst case is 9');
// input checks
['L', 'W', 'b'].forEach(function (x) { var args = { L: [0, 1000, 1], W: [1, 0, 1], b: [1, 1000, 0] }[x]; var threw = false; try { R.tokenBucket([0], args[0], args[1], args[2]); } catch (e) { threw = true; } ok(threw, 'rejects bad ' + x); });
var th = false; try { R.tokenBucket([5, 1], 1, 1000, 1); } catch (e) { th = true; } ok(th, 'rejects unordered times'); th = false; try { R.tokenBucket([0], 1.5, 1000, 1); } catch (e) { th = true; } ok(th, 'rejects fractional limit');
console.log(n + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
