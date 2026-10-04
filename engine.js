(function (root) {
  // Rate limiter policies on a trace of arrival times in integer milliseconds.
  // Limit = L requests per window W ms, burst b (token bucket, GCRA and leaky bucket meter).
  // All arithmetic is integer: amounts are scaled by W so a request costs W, the bucket holds b*W, and refill is L per ms.
  function check(L, W, b) {
    if (!(Number.isInteger(L) && L >= 1)) throw new Error('limit must be a whole number >= 1');
    if (!(Number.isInteger(W) && W >= 1)) throw new Error('window must be whole milliseconds >= 1');
    if (b === undefined) b = L;
    if (!(Number.isInteger(b) && b >= 1)) throw new Error('burst must be a whole number >= 1');
  }
  function sorted(times) { for (var i = 1; i < times.length; i++) if (times[i] < times[i - 1]) throw new Error('arrival times must be in order'); }
  // Token bucket: starts full, refills L tokens per W ms up to b, a request needs 1 token.
  function tokenBucket(times, L, W, b) {
    check(L, W, b); sorted(times); var cap = b * W, tokens = cap, last = times.length ? times[0] : 0, out = [];
    times.forEach(function (t) { tokens = Math.min(cap, tokens + (t - last) * L); last = t; if (tokens >= W) { tokens -= W; out.push(true); } else out.push(false); });
    return out;
  }
  // Generic cell rate algorithm, virtual scheduling form: emission interval T = W/L, limit tau = (b-1) T, scaled by L.
  // Conforming when the arrival is not earlier than TAT - tau; TAT moves to max(arrival, TAT) + T on conforming cells only.
  function gcra(times, L, W, b) {
    check(L, W, b); sorted(times); var T = W, tau = (b - 1) * W, tat = 0, out = [];
    times.forEach(function (t, i) { var ta = t * L; if (i === 0) tat = ta; if (ta >= tat - tau) { tat = Math.max(ta, tat) + T; out.push(true); } else out.push(false); });
    return out;
  }
  // Leaky bucket as a meter: a counter that drains at L per ms and gains W per conforming request, capacity b*W.
  function leakyMeter(times, L, W, b) {
    check(L, W, b); sorted(times); var cap = b * W, x = 0, last = times.length ? times[0] : 0, out = [];
    times.forEach(function (t) { x = Math.max(0, x - (t - last) * L); last = t; if (x + W <= cap) { x += W; out.push(true); } else out.push(false); });
    return out;
  }
  // Fixed window counter: windows aligned at multiples of W, at most L per window.
  function fixedWindow(times, L, W) {
    check(L, W, L); sorted(times); var win = null, n = 0, out = [];
    times.forEach(function (t) { var w = Math.floor(t / W); if (w !== win) { win = w; n = 0; } if (n < L) { n++; out.push(true); } else out.push(false); });
    return out;
  }
  // Sliding window log: allow if fewer than L allowed requests in the last W ms (t - W, t].
  function slidingLog(times, L, W) {
    check(L, W, L); sorted(times); var log = [], out = [];
    times.forEach(function (t) { while (log.length && log[0] <= t - W) log.shift(); if (log.length < L) { log.push(t); out.push(true); } else out.push(false); });
    return out;
  }
  var POLICIES = { token: tokenBucket, gcra: gcra, leaky: leakyMeter, fixed: function (t, L, W) { return fixedWindow(t, L, W); }, sliding: function (t, L, W) { return slidingLog(t, L, W); } };
  // most allowed requests inside any closed interval [s, s+w] (brute force over allowed arrival times)
  function maxInInterval(times, allowed, w) {
    var a = times.filter(function (t, i) { return allowed[i]; }), best = 0, i, j = 0;
    for (i = 0; i < a.length; i++) { while (a[i] - a[j] > w) j++; best = Math.max(best, i - j + 1); }
    return best;
  }
  function summary(times, allowed, W) { var ok = allowed.filter(Boolean).length; return { allowed: ok, denied: allowed.length - ok, maxInWindow: maxInInterval(times, allowed, W - 1), maxInDouble: maxInInterval(times, allowed, 2 * W - 1) }; }
  // token bucket facts
  function refillMs(L, W, b) { return Math.ceil(b * W / L); }
  // milliseconds a request arriving at time t must wait before the token bucket accepts it (0 if it is accepted now); times are the earlier arrivals
  function retryAfter(times, t, L, W, b) {
    check(L, W, b); var cap = b * W, tokens = cap, last = times.length ? times[0] : 0, i;
    for (i = 0; i < times.length; i++) { tokens = Math.min(cap, tokens + (times[i] - last) * L); last = times[i]; if (tokens >= W) tokens -= W; }
    tokens = Math.min(cap, tokens + (t - last) * L);
    return tokens >= W ? 0 : Math.ceil((W - tokens) / L);
  }
  // sustained requests per second and burst for a limit
  function describe(L, W, b) { return { perSecond: L * 1000 / W, burst: b, refillMs: refillMs(L, W, b), doubleBoundary: 2 * L, tokenWorst: b + Math.floor(L * (W - 1) / W) }; }
  var api = { tokenBucket: tokenBucket, gcra: gcra, leakyMeter: leakyMeter, fixedWindow: fixedWindow, slidingLog: slidingLog, POLICIES: POLICIES, maxInInterval: maxInInterval, summary: summary, refillMs: refillMs, retryAfter: retryAfter, describe: describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RateWall = api;
})(typeof window !== 'undefined' ? window : this);
