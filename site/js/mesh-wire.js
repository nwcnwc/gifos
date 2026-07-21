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
 * S4 is MANDATORY — there is no off switch: mesh-identity.js must be loaded
 * (hard fail otherwise), every node mints (or is handed) an identity, and
 * signing + verification are unconditional.
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
  //                   DataChannel? While false, a deep seat NEEDS the relay —
  //                   it keeps (and reopens) its socket until its first
  //                   channel opens. A channel-less socketless seat is
  //                   unreachable by anything (§FWD: the late-join deadlock's
  //                   terminal case), so R2's greeting scope reads "joining,
  //                   greeting, or not yet wired".
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
    // Greeter-list forensics (fragment founding): every greeters reply we
    // handle is stamped here — list length, how many blobs opened under our
    // room key, the relay's founded flag, and which branch we took. R3/R6
    // take-over mints a second room only on empty+founded; greeter-pool
    // expiry alone is disproven (test/mesh/greeter-expiry.js). Cap keeps
    // memory bounded; drills dump this via node.greeterTrace().
    const greeterTrace = [];
    const GREETER_TRACE_CAP = 32;
    // The ROOM KEY the wire seals/opens with (greeter blobs, sealed relay
    // fallback). MUTABLE: a password change re-keys the room (§LOCK), and the
    // wire must follow — a greeter that kept sealing its registry blob under
    // the OLD key would lock every new-password newcomer out (R6 false
    // "wrong password") until it reloaded. See node.setKey below.
    let roomKey = opts.key;

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
    // ─────────────────────────────────────────────────────────────────────────
    // THE RELAY IS A DOOR, NOT A TRANSPORT. NEVER ADD A FALLBACK HERE AGAIN.
    //
    // A blanket `else -> send it over the relay` used to sit on this line. It
    // was never a design decision; it crept in, and it did real damage:
    //
    //  1. IT LIED ABOUT LIVENESS. D1's heartbeat is how a seat learns who it
    //     can reach FIRST-HAND (E2). Delivering a PHONE over the relay
    //     manufactures liveness for a peer link that is dead, so the seat
    //     believes in a neighbour it cannot actually talk to, and healing
    //     (H1/H2/E2) — which exists to notice exactly that — is blinded.
    //  2. IT HID A REAL BUG FOR AS LONG AS IT EXISTED. Column links were not
    //     being dialled at all (see meet.html renderFromOcc: a peer was only
    //     dialled once it was already `alive`, which a column mate never is
    //     until it is dialled). The fallback carried their heartbeats, so the
    //     room limped instead of failing, and nobody saw the broken link layer.
    //  3. IT INVERTED THE ECONOMICS. Every unbuilt link parked ~0.5 frames/s of
    //     heartbeat per neighbour onto one relay socket. A room whose links
    //     were mostly unbuilt pushed ~4/s through a budget a HEALTHY room uses
    //     0.3/s of — so the relay was billed for the consequences of its own
    //     splint, and the rate guard then cut the very signalling that would
    //     have built the links.
    //
    // If there is no peer path, the honest answer is SILENCE: the peer is not
    // reachable, healing must be allowed to see that, and the link layer must
    // be fixed rather than bypassed. The relay carries the entry handshake
    // (knock/greeters, and a channel-less newcomer reaching a greeter — R2)
    // and NOTHING else, ever.
    // ─────────────────────────────────────────────────────────────────────────
    function deliver(to, m) {
      if (opts.sendDC && opts.sendDC(to, m)) return;   // DataChannel, else sponsor-forward through the mesh
      // No peer path. The relay is NOT a transport, so the only frames that may
      // continue from here are the ENTRY HANDSHAKE, and only in its two
      // directions. Both are decided by the STEP we are at, never by frame type
      // — FIND and WHOHOME are each sent BOTH by an entrant reaching a greeter
      // (entry) and by a seated seat routing to another seat (internal), so a
      // type test cannot tell them apart and a type ALLOWLIST silently let the
      // internal ones onto the relay.
      if (AT_THE_DOOR_ASKING_TO_BE_LET_IN(to, m)) return;
      if (ANSWERING_SOMEONE_AT_THE_DOOR(to, m)) return;
      // Anything else has no path: the peer is NOT REACHABLE. Say nothing and
      // let healing (H1/H2/E2) see the truth — a back channel that lies about
      // reachability is worse than silence.
    }
    const env = {
      TICK: 0,
      HEALING: true,
      COMPACTION: true,   // Q2: pack the tree upward (deep leaves atomically move to shallower occupied rows). Roadmap §3 / law T.
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
      // A knock is one of exactly two things depending on which side of the
      // door I am on: a seated Section-1 seat IS a door and re-registers (E3);
      // anyone else is still outside and is asking for the list.
      knock(from, gk) {
        const k = gk || myKey; // never knock keyless
        if (iAmAGreeter()) REGISTER_MYSELF_AS_A_GREETER(k);
        else KNOCK_FOR_THE_GREETER_LIST(k);
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
          net.open(roomKey, m.msg).then((o) => {
            if (stopped) return;
            if (o && o.mw === 1 && o.m) ingest(o.m);
            else if (opts.onRelayMsg) opts.onRelayMsg(m);
          }).catch(() => { if (!stopped && opts.onRelayMsg) opts.onRelayMsg(m); });
          return;
        }
        // ({t:'nosock'} passes through to the app via onRelayMsg — the wire
        // deliberately does NOT nudge the join loop on it: a stray bounce from
        // an unrelated frame aborting an in-flight FIND descent thrashes the
        // dance. The seat's own 20/60-tick retries govern pre-seat pacing.)
        if (m.t === 'error' && /password/i.test(m.error || '')) fireLocked(); // relay courtesy gate
        if (opts.onRelayMsg) opts.onRelayMsg(m);
      };
    }
    // ═══════════════════════════════════════════════════════════════════════
    // THE ONLY WAYS THIS CLIENT MAY EVER TOUCH THE RELAY
    //
    // healing-laws R2: the relay is a zero-knowledge GREETER REGISTRY — a
    // DOOR, not a transport. Which side of that door you are on is a question
    // about the STEP YOU ARE AT, not about the frame you happen to be holding:
    //
    //   before you have a greeter  → the relay is how you find one
    //   once you are seated        → you are INSIDE; you talk over the mesh
    //
    // Every socket write in this file goes through one of the four functions
    // below, each named for the step it belongs to. Each ENFORCES its
    // own precondition rather than trusting its caller — so "who may use the
    // relay, and when" is answered in one place and cannot drift. Nothing else
    // may call sendRaw; an unlisted caller is a bug, and a NEW function needs a
    // law to justify it — that is the point of naming them.
    //
    // This replaced a frame-type allowlist, which was the wrong shape: FIND and
    // WHOHOME are each sent BOTH by an entrant reaching a greeter and by a
    // seated seat routing internally, so the list quietly re-opened the relay
    // as a transport for anything wearing an entry type name.
    // ═══════════════════════════════════════════════════════════════════════
    function sendRaw(obj) {   // PRIVATE — the four functions below only
      if (stopped) return;
      if (!sock || sock.rejected) makeSock(); // recreate on demand (deep seats run socketless)
      sock.send(obj);
    }
    const iAmInsideTheRoom = () => !!(seat && seat.hasCoord && seat.state === 3);
    const iAmAGreeter = () => iAmInsideTheRoom() && seat.coord.pc === 0;
    // Is this peer already IN the room? Occupancy is the membership roll, so a
    // peer holding no cell in it has not been seated: it is at the door.

    // (1) KNOCK — I have no greeter yet, so I ask the registry for the sealed
    // list (R3: an empty list mints genesis). The one call that exists precisely
    // because there is no other way in.
    function KNOCK_FOR_THE_GREETER_LIST(gk) { sendRaw({ t: 'knock', gk: gk || myKey }); }

    // (2) REGISTER — I am a seated Section-1 seat, so I AM a door; E3 keeps my
    // sealed address in the pool so newcomers can still find one. The address is
    // Seal(K,{peerId,coord}) under the room key the relay never holds (R2).
    function REGISTER_MYSELF_AS_A_GREETER(gk) {
      const k = gk || myKey;
      if (!iAmAGreeter()) { KNOCK_FOR_THE_GREETER_LIST(k); return; }
      net.seal(roomKey, { p: peer, c: seat.coord })
        .then((b) => sendRaw({ t: 'knock', gk: k, gblob: JSON.stringify(b) }))
        .catch(() => sendRaw({ t: 'knock', gk: k }));
    }

    // (3) ASK TO BE LET IN — I am an ENTRANT with no seat and no channels, so
    // the relay carries my WHOHOME/FIND to the greeter I chose from the list.
    // This is the ONLY outbound mesh traffic an unseated client may relay, and
    // it stops the moment I am seated.
    function AT_THE_DOOR_ASKING_TO_BE_LET_IN(to, m) {
      if (iAmInsideTheRoom()) return false;             // I am inside — use the mesh
      if (m.t !== 'WHOHOME' && m.t !== 'FIND') return false;  // entry asks only
      net.seal(roomKey, { mw: 1, m }).then((b) => sendRaw({ t: 'peer', to, msg: b })).catch(() => {});
      return true;
    }

    // (4) ANSWER SOMEONE AT THE DOOR — I am a greeter and the target is NOT in
    // the room's occupancy, i.e. demonstrably still outside. Its introduction
    // (HOME) or its seat (PLACE / NOROOM) has to reach it somehow, and it has no
    // channels yet. Strictly bounded: seated targets never qualify, so this can
    // never become a back channel between members.
    function ANSWERING_SOMEONE_AT_THE_DOOR(to, m) {
      if (!iAmInsideTheRoom()) return false;            // only a member answers the door
      // These three frames are ENTRY ANSWERS by construction — each exists only
      // as the reply to someone who is not seated yet, so the step is implied by
      // the frame rather than needing a separate test on the target.
      //
      // Do NOT test "is the target in my occupancy?" here, however obvious it
      // looks: admit() records the newcomer in occ BEFORE it emits the PLACE
      // that tells them, so such a test rejects the one frame that does the
      // seating, and the room stops admitting anyone. Measured: it dropped the
      // adversary drill to a single seated participant with everyone else alone.
      //
      // PLACE is dual-use — Q2 compaction (law T) re-seats an ALREADY SEATED
      // leaf with tag==1, which is seat-to-seat and never entry, so it is
      // excluded and must travel the mesh like everything else internal.
      const isEntryAnswer = m.t === 'HOME' || m.t === 'NOROOM' || (m.t === 'PLACE' && !m.tag);
      if (!isEntryAnswer) return false;
      net.seal(roomKey, { mw: 1, m }).then((b) => sendRaw({ t: 'peer', to, msg: b })).catch(() => {});
      return true;
    }
    function fireLocked() { if (!lockedFired) { lockedFired = true; if (opts.onLocked) opts.onLocked(); } }

    async function onGreeters(m) {
      const list = m.list || [];
      const ids = [];
      for (const s of list) {
        try { const o = await net.open(roomKey, JSON.parse(s)); if (o && o.p && o.p !== peer) ids.push(o.p); } catch (e) { /* not mine to read */ }
      }
      if (stopped || !seat) return;
      // Capture join state BEFORE recv — GREETERS empty+founded take()s at
      // state===0 and leaves state=3, so a post-recv snapshot would hide the
      // actual mint under "already seated".
      const preState = seat.state;
      // R6 is a JOINING-NEWCOMER state ("the stranded newcomer"): only a seat
      // still trying to get in can be "locked out". A SEATED seat hits this
      // path too — its own E3/setKey re-knock right after a password change
      // answers with the OTHER greeters' blobs still sealed under the OLD key
      // (their re-knocks are in flight), decrypting none — and firing onLocked
      // there threw the "This room is locked" join prompt at a member who SET
      // the password. A seated seat ignores the list's content anyway (E3
      // keeps it in the pool; it never seats off it), so just drop the reply.
      let action;
      if (list.length && !ids.length) {
        action = preState !== 3 ? 'locked' : 'drop-seated-sealed';
        if (preState !== 3) fireLocked(); // R6: sealed list I can't read — wrong password (joiners only)
      } else if (!ids.length && !m.founded) {
        action = 'hold-mint-gap';                                         // hold; the join loop re-knocks
      } else {
        // empty+founded + still joining ⇒ R3/R6 take-over mints 0/0.0;
        // empty+founded while already seated is a no-op (mesh.js gates on state===0).
        // Non-empty ⇒ deliver greeter ids (gateway pick).
        if (!ids.length && m.founded) action = preState === 0 ? 'MINT' : 'empty-founded-noop';
        else action = 'deliver';
        seat.recv({ t: 'GREETERS', list: ids });
      }
      greeterTrace.push({
        t: Date.now(), tick: env.TICK, state: preState, post: seat.state,
        listLen: list.length, open: ids.length, founded: !!m.founded, action,
      });
      if (greeterTrace.length > GREETER_TRACE_CAP) greeterTrace.shift();
    }

    function startLoop() {
      timer = setInterval(() => {
        if (stopped) return;
        env.TICK++;
        seat.tick();
        if (seat.stranded && !strandedFired) { strandedFired = true; if (opts.onStranded) opts.onStranded(); }
        // Socket lifecycle: deep-seated ⇒ the relay is done with me; drop after a
        // grace (Section-1 seats and joiners keep theirs — knock traffic). An
        // UNWIRED deep seat (opts.wired() false: not one open DataChannel) is
        // unreachable any other way, so it NEEDS the relay — it keeps its
        // socket, and REOPENS it if a channel death left it both socketless and
        // channel-less. A seat nobody can reach serves nobody (§FWD: the
        // late-join deadlock's terminal case — two adjacent socketless seats
        // with no channel between them could otherwise never exchange the
        // signaling that would wire them).
        const needsRelay = !(seat.state === 3 && seat.hasCoord && seat.coord.pc !== 0) || !(!opts.wired || opts.wired());
        if (needsRelay) deepSince = -1;
        else if (deepSince < 0) deepSince = env.TICK;
        if (dropDeep && !needsRelay && sock && deepSince >= 0 && env.TICK - deepSince > 20) { try { sock.close(); } catch (e) {} sock = null; }
        if (needsRelay && (!sock || sock.rejected)) makeSock(); // re-arm reachability
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
      // (5) FIRST-CONTACT SIGNALING for the app layer (meet.html). A WebRTC
      // pair cannot bootstrap over a DataChannel it does not have yet, so the
      // offer/answer that CREATES the first channel needs some path. meet.html
      // applies §FWD before it ever reaches here — its own DataChannel, then a
      // sponsor forward through the mesh, and only then this — so what arrives
      // is traffic with no peer path at all. It is named and listed here rather
      // than left as an anonymous export, because an unnamed way to reach the
      // relay is exactly how the last one crept in.
      RELAY_FIRST_CONTACT_SIGNALING(obj) { sendRaw(obj); },
      relaySend(obj) { sendRaw(obj); },   // legacy alias — callers should move to the named form
      relayUp() { return !!(sock && sock.state === 'up'); },
      // Password change re-keyed the room (§LOCK): adopt the NEW key for every
      // wire seal/open, and — if this seat is a Section-1 greeter — re-knock
      // NOW so the registry blob re-seals under it. Without this, newcomers
      // holding the new password can't decrypt any greeter blob (R6 reads as
      // "wrong password") until every greeter's E3 re-knock… which would also
      // have used the stale key, locking them out until a reload.
      setKey(k) { if (k) { roomKey = k; try { if (seat && seat.hasCoord && seat.state === 3 && seat.coord.pc === 0) env.knock(peer, seat.genKey || myKey); } catch (e) {} } },
      stats() { return { peer, state: seat ? seat.state : 0, coord: (seat && seat.hasCoord) ? { pc: seat.coord.pc, r: seat.coord.r, i: seat.coord.i } : null, stranded: !!(seat && seat.stranded), tick: env.TICK }; },
      // Greeter-list forensics: ring of recent onGreeters outcomes (listLen /
      // open / founded / action). See greeterTrace push in onGreeters.
      greeterTrace() { return greeterTrace.slice(); },
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
