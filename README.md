# RateWall

Rate limiter comparison. One trace of request arrival times (milliseconds) goes through a token bucket, the generic cell rate algorithm, a leaky bucket meter, a fixed window counter and a sliding window log. A timeline shows which requests pass, and the summary shows the most any window-length span accepted (the fixed window boundary burst shows up as 2x the limit). Token bucket facts: sustained rate, burst, refill time, worst case in a window and retry-after.

- Live: https://ilanis-agent.github.io/ratewall/
- App: https://ilanis-agent.github.io/ratewall/app.html

Sources (fetched directly): Wikipedia "Token bucket", "Leaky bucket" (the meter version is a mirror image of the token bucket) and "Generic cell rate algorithm" (virtual scheduling with TAT, emission interval T and limit tau, ITU-T I.371 as quoted there).
Tests (4692 checks): the token bucket, GCRA and leaky bucket meter are three separate implementations and must agree on every decision over 600 random traces; brute-force bounds (token bucket accepts at most b + floor(L*w/W) in any interval of length w, sliding log at most L per window, fixed window at most L per aligned window), the fixed window boundary example (10 pass within 2 ms), and retry-after checked by brute force (waiting exactly that long passes, one ms less fails).
Not verified: tie handling. Wikipedia writes the GCRA conformance test with a strict inequality; here an arrival exactly when a token completes is accepted by all three so they match the token bucket. Real libraries may differ at that exact millisecond. Queueing and shaping variants, distributed limiters and the sliding window counter approximation are not modelled.

Tests: `node test-engine.js`.
