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
 * is Seal(key, {p: peerId}); a knocker that can't decrypt any blob has the
 * wrong password (R6) — surfaced via onLocked, never sent to the relay.
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
 */
(function (root) {
  const GifOS = root.GifOS = root.GifOS || {};
  const net = GifOS.net, mesh = GifOS.mesh;

  // createMeshNode(opts):
  //   relayUrl        ws(s)://host:port of the relay (no path)
  //   sid, tok        relay session id + token (net.deriveMeet)
  //   key             room E2E key (net.deriveMeetKey — pw mixed in)
  //   peer            my peer id (default: fresh 'c_'+hex)
  //   tickMs          logical tick (default 500 — the canonical mapping)
  //   dropDeepSocket  drop the relay socket when seated deep (default true)
  //   sendDC(to, m)   preferred path: deliver control object m to peer `to`
  //                   over an existing DataChannel; return false if no channel
  //                   (falls back to a sealed relay {t:'peer'})
  //   onUpdate(node)  per-tick UI hook
  //   onLocked()      R6: greeters exist but none decrypt — wrong password
  //   onStranded()    R6: meeting is live but unreachable a full TTL
  function createMeshNode(opts) {
    const tickMs = opts.tickMs || 500;
    const peer = opts.peer || 'c_' + net.randHex(6);
    const myKey = net.mintGenesisKey();
    const dropDeep = opts.dropDeepSocket !== false;
    let stopped = false, lockedFired = false, strandedFired = false;
    let sock = null, deepSince = -1;

    const relayBase = String(opts.relayUrl || '').replace(/\/+$/, '');
    // gk rides the URL so the CONNECT knock (and every reconnect) presents the
    // freshest key: the genesis key once learned, the throwaway before that.
    const makeUrl = () => relayBase + '/s/' + opts.sid
      + '?role=mesh&token=' + encodeURIComponent(opts.tok || '')
      + '&peer=' + encodeURIComponent(peer)
      + '&gk=' + encodeURIComponent(seat.genKey || myKey);

    const env = {
      TICK: 0,
      HEALING: true,
      send(from, to, m) {
        if (opts.sendDC && opts.sendDC(to, m)) return;
        net.seal(opts.key, { mw: 1, m }).then((b) => relaySend({ t: 'peer', to, msg: b })).catch(() => {});
      },
      knock(from, gk) {
        const k = gk || myKey; // never knock keyless
        if (seat.hasCoord && seat.state === 3 && seat.coord.pc === 0) {
          // Seated Section-1 seat: register my SEALED address in the pool (E3).
          net.seal(opts.key, { p: peer }).then((b) => relaySend({ t: 'knock', gk: k, gblob: JSON.stringify(b) }))
            .catch(() => relaySend({ t: 'knock', gk: k }));
        } else relaySend({ t: 'knock', gk: k });
      },
      wake() {},
    };
    const seat = new mesh.Seat(peer, env);
    seat.myKey = myKey;
    if (opts.onGossip) seat.onGossip = (src, m) => { if (!stopped) opts.onGossip(src, m); };

    function makeSock() {
      sock = net.steadySocket(makeUrl);
      sock.onmessage = (ev) => {
        if (stopped) return;
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'greeters') onGreeters(m);
        else if (m.t === 'peer' && m.msg) net.open(opts.key, m.msg).then((o) => { if (o && o.mw === 1 && o.m && !stopped) seat.recv(o.m); }).catch(() => {});
        else if (m.t === 'error' && /password/i.test(m.error || '')) fireLocked(); // relay courtesy gate
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
      if (stopped) return;
      if (list.length && !ids.length) { fireLocked(); return; }        // R6: sealed list I can't read — wrong password
      if (!ids.length && !m.founded) return;                            // the mint gap — hold; the join loop re-knocks
      seat.recv({ t: 'GREETERS', list: ids });                          // empty+founded ⇒ the seat founds (R3/R6 take-over)
    }

    const timer = setInterval(() => {
      if (stopped) return;
      env.TICK++;
      seat.tick();
      if (seat.stranded && !strandedFired) { strandedFired = true; if (opts.onStranded) opts.onStranded(); }
      // Socket lifecycle: deep-seated ⇒ the relay is done with me; drop after a
      // grace (Section-1 seats and joiners keep theirs — knock traffic).
      const needsRelay = !(seat.state === 3 && seat.hasCoord && seat.coord.pc !== 0);
      if (needsRelay) deepSince = -1;
      else if (deepSince < 0) deepSince = env.TICK;
      if (dropDeep && !needsRelay && sock && deepSince >= 0 && env.TICK - deepSince > 20) { try { sock.close(); } catch (e) {} sock = null; }
      if (opts.onUpdate) opts.onUpdate(node);
    }, tickMs);

    const node = {
      peer, seat, env,
      // DataChannel ingestion: the DC layer hands OPENED control objects here
      // (production unwraps its own sealed frames; {mw:1, m} envelopes route m).
      recvCtl(m) { if (!stopped && m) seat.recv(m); },
      // Room-wide app traffic (chat/status/votes/files): flood over the mesh —
      // the relay session is only the greeter pool now, not the room.
      gossip(payload) { if (!stopped) seat.gossip(payload); },
      stats() { return { peer, state: seat.state, coord: seat.hasCoord ? { pc: seat.coord.pc, r: seat.coord.r, i: seat.coord.i } : null, stranded: seat.stranded, tick: env.TICK }; },
      leave() { try { seat.leave(); } catch (e) {} node.stop(); },
      stop() { stopped = true; clearInterval(timer); if (sock) { try { sock.close(); } catch (e) {} sock = null; } },
    };

    makeSock();
    seat.join();
    return node;
  }

  GifOS.meshWire = { createMeshNode };
})(typeof window !== 'undefined' ? window : globalThis);
