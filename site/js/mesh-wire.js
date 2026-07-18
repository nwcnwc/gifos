/*
 * mesh-wire.js — binds the mesh control plane (mesh.js, the ported sim brain)
 * to the REAL transports. This is the layer meet.html consumes: it owns the
 * relay socket (knock/greeters + sealed peer-message fallback) and prefers the
 * caller's DataChannel layer for seat-to-seat control traffic.
 *
 * The canonical TIME mapping: 1 tick = 500ms. All of mesh.js's timers are in
 * ticks, so phone-home = 8 ticks = the 4s HB pulse, heal fires at ~20s,
 * drain at ~40s, R6 strand at 250s. Tests shrink tickMs to run fast.
 *
 * Everything seat-to-seat is SEALED under the room key (deriveMeetKey — the
 * password is mixed in). The greeter address blob a Section-1 seat registers
 * is a real Seal(key, address) — address = {p: peerId, c: coord} — so a knocker
 * that opens it learns WHERE the greeter sits, not just who; a knocker that
 * can't decrypt any blob has the wrong password (R6) — surfaced via onLocked,
 * never sent to the relay.
 *
 * FOUNDING is decided by the relay's `founded` flag, not list emptiness: a
 * founder is admitted to the registry at KNOCK time but registers its sealed
 * address a beat later (sealing is async), so a second knocker in that gap
 * sees an EMPTY list with founded:false. Delivering that to the seat would
 * mint a SECOND founder — instead the wire holds it and the join loop retries.
 * (The sim's registry listed knocker IDS, so identity WAS the address and the
 * gap didn't exist; production separates them, so the flag closes it.)
 *
 * SOCKET LIFECYCLE (user decision): a seat holds a relay socket only while it
 * NEEDS the relay — joining (knock/greeters), or seated in Section 1 (E3
 * re-knock keeps it in the greeter pool). A DEEP-seated seat drops its socket
 * after a grace period (the relay session cap is C²+C: the greeter pool plus
 * knock churn, not the room); it is recreated on demand the moment the seat
 * needs the relay again (a knock, or a control send with no DataChannel).
 *
 * ── S4 PER-PARTICIPANT IDENTITY (healing-laws.md S4/S5, mesh-identity.js) ──────
 * The keypair is minted HERE, once, at join. Ed25519 verification is async
 * (WebCrypto) but mesh.js's verifyFill seam is synchronous and transport-
 * agnostic, so the wire is exactly where identity belongs — the same boundary
 * that already owns all sealing/transport:
 *   - MINT: on createMeshNode we mint a per-participant identity (unless the
 *     caller supplies opts.identity, or a legacy client-set opts.peer). The
 *     peer id is peer-id = H(pubkey) — retiring the client-set-id hole.
 *   - SIGN: every occupancy-authoring frame the seat emits (FINDLEAF / PLACE /
 *     CLAIM) and the HELLO announce is signed with the participant's stable key
 *     before it goes on the wire — the signature (m.s4 = {sp,sig,pub}) is the
 *     participant's portable name, valid across links and moves.
 *   - VERIFY + PIN: an inbound signed frame is verified against the TOFU-pinned
 *     key for its signer BEFORE it reaches the seat. A good frame is delivered
 *     with m.s4ok stamped (mesh.js's verifyFill gate passes) and its key pinned;
 *     a forged/impostor/key-swapped frame is DROPPED. Verification is chained
 *     FIFO so crypto never reorders a sender's frames.
 * S4 is OPT-IN by identity presence: a legacy caller that passes opts.peer (the
 * structural harness shape, and meet.html today) runs with S4 OFF — no signing,
 * no verification — so the coord-based control plane is unchanged. The crypto
 * is strictly ADDITIVE.
 */
(function (root) {
  const GifOS = root.GifOS = root.GifOS || {};
  const net = GifOS.net, mesh = GifOS.mesh;

  // Occupancy-authoring frames + the announce: signed on the way out, verified
  // on the way in when S4 is active. FINDLEAF/PLACE/CLAIM are the verifyFill-
  // gated fills; HELLO carries the announce (pubkey exchange + move recognition).
  const SIGNED = new Set(['FINDLEAF', 'PLACE', 'CLAIM', 'HELLO']);

  // createMeshNode(opts):
  //   relayUrl        ws(s)://host:port of the relay (no path)
  //   sid, tok        relay session id + token (net.deriveMeet)
  //   key             room E2E key (net.deriveMeetKey — pw mixed in)
  //   identity        (S4) a pre-minted per-participant identity {priv,pubB64,peerId};
  //                   peer id = its peerId = H(pubkey). Overrides opts.peer.
  //   peer            LEGACY client-set peer id — S4 stays OFF (structural/compat).
  //                   Default when neither identity nor peer is given: mint a
  //                   fresh S4 identity and use peer-id = H(pubkey).
  //   tickMs          logical tick (default 500 — the canonical mapping)
  //   dropDeepSocket  drop the relay socket when seated deep (default true)
  //   wired()         optional: does this node hold at least one OPEN
  //                   DataChannel? While false, the deep-socket drop waits (a
  //                   freshly deep-seated newcomer with no channels yet MUST
  //                   stay relay-reachable or inbound signaling answers die —
  //                   the late-join deadlock), up to a hard cap so R2 scope
  //                   still wins for a node that never manages to wire.
  //   sendDC(to, m)   preferred path: deliver control object m to peer `to`
  //                   over an existing DataChannel; return false if no channel
  //                   (falls back to a sealed relay {t:'peer'})
  //   onUpdate(node)  per-tick UI hook
  //   onLocked()      R6: greeters exist but none decrypt — wrong password
  //   onStranded()    R6: meeting is live but unreachable a full TTL
  //   onGossip(src,m) room-wide app traffic delivery (exact-once)
  //   onRelayMsg(m)   every relay frame the wire does not consume — 'whoami',
  //                   'pw', 'ban', 'votes', 'joined', app-layer sealed 'peer'
  //                   frames (incl. fragments) — so the app keeps its existing
  //                   handlers while the wire OWNS the one socket.
  function createMeshNode(opts) {
    const tickMs = opts.tickMs || 500;
    const myKey = net.mintGenesisKey();
    const dropDeep = opts.dropDeepSocket !== false;
    const ident = GifOS.meshIdentity || null;
    let stopped = false, lockedFired = false, strandedFired = false;
    let sock = null, deepSince = -1;

    // S4 identity is MANDATORY — there is NO "off". No mesh-identity.js loaded ⇒
    // hard fail (never a silent legacy-id degrade); no legacy client-set peer id
    // path. Every participant mints (or is handed) a per-participant keypair and
    // its peer id is H(pubkey). Signing + verification are unconditional.
    if (!ident) throw new Error('mesh-wire: js/mesh-identity.js is REQUIRED (S4 is mandatory) — load it before mesh-wire.js');
    let identity = opts.identity || null;   // else minted below (async, existing flow)
    const wantMint = !identity;             // ALWAYS mint when none is supplied
    let peer = identity ? identity.peerId : null;   // set post-mint
    const s4on = true;                      // unconditional — no off switch
    const verifyChain = net.makeChain();

    let seat = null, timer = null;
    let readyResolve; const ready = new Promise((r) => { readyResolve = r; });

    const relayBase = String(opts.relayUrl || '').replace(/\/+$/, '');
    // gk rides the URL so the CONNECT knock (and every reconnect) presents the
    // freshest key: the genesis key once learned, the throwaway before that.
    // opts.urlParams() (optional) appends app params — pw proof, device tag —
    // re-evaluated per reconnect so rotated credentials ride the next attempt.
    const makeUrl = () => relayBase + '/s/' + opts.sid
      + '?role=mesh&token=' + encodeURIComponent(opts.tok || '')
      + '&peer=' + encodeURIComponent(peer)
      + '&gk=' + encodeURIComponent(seat.genKey || myKey)
      + (opts.urlParams ? opts.urlParams() : '');

    // deliver(to, m): the raw transport step — DataChannel first, sealed relay
    // {t:'peer'} fallback. (Signing, when S4 is on, happens in env.send before
    // this is reached.)
    function deliver(to, m) {
      if (opts.sendDC && opts.sendDC(to, m)) return;
      net.seal(opts.key, { mw: 1, m }).then((b) => relaySend({ t: 'peer', to, msg: b })).catch(() => {});
    }
    const env = {
      TICK: 0,
      HEALING: true,
      send(from, to, m) {
        // S4: sign the participant's own occupancy-authoring frames before they
        // leave. The signature is the same for every recipient (it commits to
        // the frame, not the destination), so signing once and reusing is safe.
        if (s4on && identity && SIGNED.has(m.t) && !m.s4) {
          ident.signFill(identity, m).then((s) => { if (!stopped) { m.s4 = s; deliver(to, m); } }).catch(() => {});
          return;
        }
        deliver(to, m);
      },
      knock(from, gk) {
        const k = gk || myKey; // never knock keyless
        if (seat.hasCoord && seat.state === 3 && seat.coord.pc === 0) {
          // Seated Section-1 seat: register my SEALED address in the pool (E3).
          // The greeter blob is a REAL Seal(K, address): the address is this
          // seated Section-1 greeter's {peerId, coord}, not a bare id — sealed
          // under the room key the relay never holds (R2). A knocker that opens
          // it learns WHERE the greeter sits, not just who it is.
          net.seal(opts.key, { p: peer, c: seat.coord }).then((b) => relaySend({ t: 'knock', gk: k, gblob: JSON.stringify(b) }))
            .catch(() => relaySend({ t: 'knock', gk: k }));
        } else relaySend({ t: 'knock', gk: k });
      },
      wake() {},
    };

    // ingest(m): the S4 verification gate on the way IN. A signed fill is
    // verified against the TOFU-pinned participant key (FIFO-chained so crypto
    // never reorders a sender's frames); a good frame is delivered with m.s4ok
    // stamped and its key pinned, a forged one is dropped. Non-signed frames and
    // S4-off nodes pass straight through — the structural path is untouched.
    function ingest(m) {
      if (stopped || !seat || !m) return;
      if (s4on && SIGNED.has(m.t)) {
        verifyChain(() => ident.verifyFill(seat.pins, m).then((v) => {
          if (stopped) return;
          if (v && v.ok) { m.s4ok = true; seat.recv(m); }
          // else: unsigned / forged / impostor / key-swapped fill — DROP it.
        }).catch(() => {}));
        return;
      }
      seat.recv(m);
    }

    function makeSock() {
      sock = net.steadySocket(makeUrl);
      sock.onmessage = (ev) => {
        if (stopped) return;
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'greeters') { onGreeters(m); return; }
        if (m.t === 'peer' && m.msg) {
          // Mesh control frames ({mw:1}) are consumed here; anything else —
          // app signaling, fragments, unopenable — is the app's to handle.
          net.open(opts.key, m.msg).then((o) => {
            if (stopped) return;
            if (o && o.mw === 1 && o.m) ingest(o.m);
            else if (opts.onRelayMsg) opts.onRelayMsg(m);
          }).catch(() => { if (!stopped && opts.onRelayMsg) opts.onRelayMsg(m); });
          return;
        }
        if (m.t === 'error' && /password/i.test(m.error || '')) fireLocked(); // relay courtesy gate
        if (opts.onRelayMsg) opts.onRelayMsg(m);
      };
    }
    function relaySend(obj) {
      if (stopped) return;
      if (!sock || sock.rejected) makeSock(); // recreate on demand (deep seats run socketless)
      sock.send(obj);
    }
    function fireLocked() { if (!lockedFired) { lockedFired = true; if (opts.onLocked) opts.onLocked(); } }

    async function onGreeters(m) {
      const list = m.list || [];
      const ids = [];
      for (const s of list) {
        try { const o = await net.open(opts.key, JSON.parse(s)); if (o && o.p && o.p !== peer) ids.push(o.p); } catch (e) { /* not mine to read */ }
      }
      if (stopped || !seat) return;
      if (list.length && !ids.length) { fireLocked(); return; }        // R6: sealed list I can't read — wrong password
      if (!ids.length && !m.founded) return;                            // the mint gap — hold; the join loop re-knocks
      seat.recv({ t: 'GREETERS', list: ids });                          // empty+founded ⇒ the seat founds (R3/R6 take-over)
    }

    function startLoop() {
      timer = setInterval(() => {
        if (stopped) return;
        env.TICK++;
        seat.tick();
        if (seat.stranded && !strandedFired) { strandedFired = true; if (opts.onStranded) opts.onStranded(); }
        // Socket lifecycle: deep-seated ⇒ the relay is done with me; drop after a
        // grace (Section-1 seats and joiners keep theirs — knock traffic).
        const needsRelay = !(seat.state === 3 && seat.hasCoord && seat.coord.pc !== 0);
        if (needsRelay) deepSince = -1;
        else if (deepSince < 0) deepSince = env.TICK;
        // Grace: 20 ticks once wired (≥1 open DC); an UNWIRED deep seat keeps
        // its socket up to 240 ticks (~2min) — it is unreachable any other way.
        const dropAfter = (!opts.wired || opts.wired()) ? 20 : 240;
        if (dropDeep && !needsRelay && sock && deepSince >= 0 && env.TICK - deepSince > dropAfter) { try { sock.close(); } catch (e) {} sock = null; }
        if (opts.onUpdate) opts.onUpdate(node);
      }, tickMs);
    }

    // Build the seat once the peer id (and, for S4, the identity) is known, then
    // start the socket + join loop. Deferred when we must mint the keypair
    // first (WebCrypto is async); otherwise runs synchronously.
    function build() {
      seat = new mesh.Seat(peer, env);
      seat.myKey = myKey;
      if (s4on) { seat.s4 = true; seat.identity = identity; seat.pins = ident.newPins(); }
      if (opts.onGossip) seat.onGossip = (src, m) => { if (!stopped) opts.onGossip(src, m); };
      node.seat = seat;
      makeSock();
      seat.join();
      startLoop();
      readyResolve(node);
    }

    const node = {
      peer, seat: null, env, whenReady: ready,
      // The per-participant identity (S4). pub key + peer-id = H(pubkey); the
      // private key never leaves. null when S4 is off (legacy peer).
      get identity() { return identity; },
      // DataChannel ingestion: the DC layer hands OPENED control objects here
      // (production unwraps its own sealed frames; {mw:1, m} envelopes route m).
      recvCtl(m) { if (!stopped && seat && m) ingest(m); },
      // Room-wide app traffic (chat/status/votes/files): flood over the mesh —
      // the relay session is only the greeter pool now, not the room.
      gossip(payload) { if (!stopped && seat) seat.gossip(payload); },
      // App access to the wire's relay socket (the ONE socket): signaling
      // fallback ({t:'peer'}), moderation verbs (setpw/ban/votekick), etc.
      // Recreates the socket on demand, same as the mesh's own sends.
      relaySend(obj) { relaySend(obj); },
      relayUp() { return !!(sock && sock.state === 'up'); },
      stats() { return { peer, state: seat ? seat.state : 0, coord: (seat && seat.hasCoord) ? { pc: seat.coord.pc, r: seat.coord.r, i: seat.coord.i } : null, stranded: !!(seat && seat.stranded), tick: env.TICK }; },
      leave() { try { if (seat) seat.leave(); } catch (e) {} node.stop(); },
      stop() { stopped = true; if (timer) clearInterval(timer); if (sock) { try { sock.close(); } catch (e) {} sock = null; } },
    };

    if (wantMint) {
      ident.mint().then((id) => {
        if (stopped) return;
        identity = id; peer = id.peerId; node.peer = peer;
        build();
      }).catch(() => {});
    } else {
      build();
    }
    return node;
  }

  GifOS.meshWire = { createMeshNode };
})(typeof window !== 'undefined' ? window : globalThis);
