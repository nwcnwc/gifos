static inline Coord unck(uint64_t k){ return {(uint32_t)(k>>16),(uint8_t)((k>>8)&0xff),(uint8_t)(k&0xff)}; }
static inline bool ownerCoordOf(Coord c, Coord& o){ if(c.pc==0) return false; return up({c.pc,c.r,0},o); }

void Seat::take(Coord c,int owner,vector<KV>&nbrs){
  if(c.i>=C||c.r>=C){ return; }   // sanity: never take a malformed coord
  // DUPMINT forensics (MESH_DUPLOG=1): the moment a take() lands on a cell
  // another live seat already holds, print BOTH sides with their placers —
  // this is the mint site of the V4 dup wars (scale-audit 2026-08-04), and
  // which placer pair shows up names the mechanism (expiry re-place: same
  // placer twice; dual-hold/cascade: two different placers).
  if(getenv("MESH_DUPLOG")){ uint64_t kk=ckey(c);
    for(size_t q=0;q<seats.size();q++) if((int)q!=id&&alive[q]&&seats[q]->hasCoord&&seats[q]->state==3&&ckey(seats[q]->coord)==kk)
      { auto al=ADMIT_LOG.find(kk);
        fprintf(stderr,"DUPMINT t=%lld cell=%u/%d.%d new=%d(placer %d) incumbent=%d(placer %d, seatedAt %d) lastAdmit=%s@%lld by=%d prevAdmit=%s@%lld by=%d\n",
          (long long)TICK,(unsigned)c.pc,(int)c.r,(int)c.i,id,owner,(int)q,seats[q]->myPlacer,seats[q]->seatedAt,
          al!=ADMIT_LOG.end()?al->second.site:"?",al!=ADMIT_LOG.end()?al->second.t:-1,al!=ADMIT_LOG.end()?al->second.admitter:-1,
          al!=ADMIT_LOG.end()?al->second.prevSite:"?",al!=ADMIT_LOG.end()?al->second.prevT:-1,al!=ADMIT_LOG.end()?al->second.prevAdmitter:-1); }
  }
  {const char* _t=getenv("MESH_TRACE"); if(_t&&atoi(_t)==id) fprintf(stderr,"TRACE t=%lld #%d TAKE %u/%d.%d placer=%d\n",(long long)TICK,id,(unsigned)c.pc,(int)c.r,(int)c.i,owner);}
  myPlacer=owner;
  rowLedger = !(c.pc==0 && c.i==0 && owner>=0);   // V4: an admitted S1 row head waits for its assigner's SITXFER
  coord=c; hasCoord=true; state=3; joinStart=-1; stranded=false; reAsk=false; reJoin=false; noroomSeen=0;   // T7: the NOROOM evidence dies with the attempt it belonged to   // seated: any deferred entry retry is moot
  // A: self-confirm sitting-down → seated (only the joiner upgrades).
  confirmSeated(ckey(c), id);
  for(auto&kv:nbrs) if(!occ.count(kv.k)){ setOcc(kv.k,kv.v); noteS1(kv.k); }
  drainAt=0; seatTries=0; seatedAt=(int)TICK; rookSeenAt=(int)TICK;   // grace: don't call a just-seated seat isolated
  // § G: a seat change re-parents me — new aggregator, new scope, new child row.
  // Every digest relationship starts over, including G4's grace window; carrying
  // the old one over would accuse a brand-new aggregator of suppressing reports
  // it never received. (Display state only — nothing here can move a seat.)
  upLogI=0; upSince=-1; lastAgg=-1; for(int q=0;q<16;q++) upLog[q]=UpRec();   // the ring's CONTENTS too: a retained pre-move record collides with my cell's PREVIOUS occupant's stamp and reads as a forged echo (10 false fires at N=600)
  downDig=Dig(); downUsed=Dig(); myDig=Dig(); rowDig=Dig(); rootDig=Dig();
  rowKids.clear(); rowUsed.clear(); if(c.pc!=0) s1tab.clear();
  lastAck=(int)TICK; lastPhone=(int)TICK;
  if(owner>=0){ Msg m; m.t=CLAIM; m.ck=ckey(c); m.id=id; emit(owner,m); }
  if(c.pc==0){ s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD); emitRelay(genKey); }   // E3: a Section-1 seat registers as a greeter on seating (present the MEETING genesis key)
  announce(); wake(id);
}
void Seat::announce(){
  Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen;
  for(int k=0;k<n;k++){
    uint64_t lk=ckey(ol[k]); int x=occGet(lk);
    if(x<0 && softSitting(lk)) x=sitting[lk].joiner; // A: also greet soft-sit neighbours
    if(x>=0&&x!=id&&!seen.count(x)){ seen.insert(x); Msg m;m.t=HELLO;m.ck=ckey(coord);m.id=id; emit(x,m);}
  }
}

// A: assigner recheck + soft TTL — free sitting-down marks that never self-confirmed
// (lost PLACE under packet loss). Only the assigner that wrote the mark rechecks.
// CHECK-BACK (law A tightened, 2026-08-02 — the ghost-churn fix): the recheck
// at SIT_RECHECK now actually FREES a vouch that was never answered. A live
// joiner is always HEARD within a couple of beats of its PLACE (its CLAIM or
// HELLO lands, or its first PHONE beat at +8 ticks); a tab killed mid-placement
// is never heard at all. 25 ticks of total silence after my own PLACE means my
// vouch is dead — holding the chair the full SIT_TTL (90) let six killed tabs
// wall off the whole home row and strand every real newcomer behind it.
// Freeing also clears the cell's healTry admission stamp: a freed chair is
// admissible NOW, not 45 ticks after its dead admittee's own admission.
void Seat::recheckSitting(){
  if(sitting.empty()) return;
  vector<uint64_t> del;
  for(auto&e:sitting){
    SoftSit& s=e.second;
    if(s.assigner!=id) continue;
    // Confirmed seated by first-hand contact with the joiner at this cell.
    if(occGet(e.first)==s.joiner && firstHandLive(e.first)){ sitLog("SIT-",e.first,s.joiner,"recheck-confirmed"); del.push_back(e.first); continue; }
    if(TICK-s.at < SIT_RECHECK) continue;
    // The check-back: never heard from the joiner at this cell — free it.
    // (A PROBE GATE was tried here and REJECTED both ways: freeing late, at
    // 50 ticks, missed the ghost-churn budget; probing early, from 8 ticks,
    // made every unconfirmed sit emit a routed probe whose ROUTED answer
    // re-seeds occ and fans a HELLO, which perturbed partition healing —
    // sweep.sh partition-bad=1, mesh-harness red.)
    // V4 PROBE-GATED CHECK-BACK (confirmed absence, the ghost-law discipline):
    // "never heard in 25 ticks" is NOT evidence of death — at the N=3000 join
    // storm a live admittee's CLAIM to a deep placer is routinely lost/slow,
    // and freeing on that lagged view let the SAME placer re-place the cell
    // (578 deep same-admitter mints, the largest non-cascade seed family).
    // So falsify first-hand: SITPING the admittee itself. A live one answers
    // (its pong is a re-CLAIM, no other payload — the 2026-08-02 probe was
    // rejected because its ROUTED answer re-seeded occ and fanned HELLOs);
    // a killed tab never does, and the chair frees at 25+15=40 ticks.
    if(occGet(e.first)!=s.joiner && !firstHandLive(e.first)){
      if(s.pingAt<0){ s.pingAt=(int)TICK; Msg m;m.t=SITPING;m.ck=e.first;m.id=s.joiner; emit(s.joiner,m); continue; }
      if(TICK-s.pingAt<SIT_PING_WAIT) continue;
      sitLog("SIT-",e.first,s.joiner,"checkback-free");
      // Freed on SILENCE, not on attributed evidence — so the chair re-enters
      // the standard 45-tick admission cooling instead of "admissible NOW".
      // Deep routes break under the dup war (a j>0 child has no owned up-link,
      // so its CLAIM and my ping ride the mesh), and this admitter re-placing
      // the same cell 7 ticks after a silence-free was the surviving deep mint
      // (52→99 same-placer pairs). Real evidence (HELLO/phone/gossip) arrives
      // within the cooling and blocks the re-place honestly.
      del.push_back(e.first); healTry[e.first]=(int)TICK;
      continue;
    }
    // Soft TTL backstop: mark cannot live forever if recheck is skipped.
    if(TICK-s.at >= SIT_TTL){
      sitLog("SIT-",e.first,s.joiner,"ttl-backstop");
      del.push_back(e.first); healTry[e.first]=(int)TICK;   // V4: TTL is also a silence-free — cool before re-admission
      // Ghost occ left by an older admit path or partial confirm: clear if not live.
      if(occGet(e.first)==s.joiner && !firstHandLive(e.first)){
        occDrop(e.first,"sit-ttl-ghost"); live.erase(e.first); s1seen.erase(e.first); kidful.erase(e.first); tlForget(e.first); healTry.erase(e.first);
      }
    }
  }
  for(auto k:del) sitting.erase(k);
}

void Seat::admit(Coord c,Msg& f){
  int nc=f.nc;
  // FRONT 3 measurement only: how a newcomer FIND ended, and how many hops it
  // burned. tag==1 is a compaction probe on its own TTL budget — not a seeker.
  if(descOn() && f.tag!=1) descEnd(strncmp(ADMIT_SITE,"deep",4)==0?0:1, 200-f.ttl);
  uint64_t k=ckey(c);
  { auto al=ADMIT_LOG.find(k);
    if(al!=ADMIT_LOG.end()) ADMIT_LOG[k]={ADMIT_SITE,(long long)TICK,id,al->second.site,al->second.t,al->second.admitter};
    else ADMIT_LOG[k]={ADMIT_SITE,(long long)TICK,id,"-",-1,-1}; }
  tlForget(k);   // the cell genuinely refills — any standing D5 observation of the old occupant ends here
  vector<KV> nbrs; Coord ol[MAXLINKS]; int n=ownedLinks(c,ol);
  for(int i=0;i<n;i++){ int x=occGet(ckey(ol[i])); if(x>=0&&x!=nc) nbrs.push_back({ckey(ol[i]),x}); }
  // ALWAYS teach the admittee its ADMITTER (2026-08-02) — not only when the
  // admitter happens to be an owned-link. A deep non-head admittee whose
  // admitter is the SECTION OWNER learned nothing about it, so when that
  // admittee later became the head's LEFT-PACK healer it promoted itself
  // into the head hole with an EMPTY nbrs list: take(hole, -1, []) sends no
  // CLAIM, the no-neighbour claim window confirms SAME-TICK, and the
  // promoted head is an ISLAND — empty occ, no phone target, invisible to
  // the owner, whose stale head-occ then re-admits another seat behind it.
  // Two seats oscillated head↔row-cell forever, sampling as a duplicate
  // (c-sweep C=5 0.30×2 seed 1, dup at 00/0.0). The entry is truthful (the
  // admitter at its real coord), so it can only inform.
  bool selfNb=false; for(int i=0;i<n;i++) if(ckey(ol[i])==ckey(coord)) selfNb=true;
  if(!selfNb && hasCoord) nbrs.push_back({ckey(coord),id});
  if(selfNb) nbrs.push_back({ckey(coord),id});
  Msg m; m.t=PLACE; m.coord=c; m.owner=id; m.nbrs=nbrs; m.tag=f.tag; m.nc=nc;
  // Q2 compaction (tag==1): destination reserve still uses occ (seeker is already
  // seated elsewhere; atomic doMove on PLACE). Newcomer (tag==0): soft sitting-down
  // only — never permanent occ without self-confirm (loss wedge).
  if(f.tag==1){
    occ[k]=nc; noteS1(k);
    COMPACT_ADMITS++; route(f.coord,-1,m);
  } else {
    markSitting(k, nc);   // sitting-down: assigner wrote PLACE, not yet seated
    emit(nc,m);
  }
}
// V4 forensics (env MESH_FINDLOG=<seekerId>): every serveFind decision for one
// seeker's FINDs, printed by the SERVING seat — the tool that pins where a
// forever-searching joiner's asks go to die.
#define FINDLOG(fmt,...) do{ const char* _f=getenv("MESH_FINDLOG"); if(_f&&atoi(_f)==mm.nc) fprintf(stderr,"FINDLOG t=%lld me=%d@%u/%d.%d ttl=%d " fmt "\n",(long long)TICK,id,(unsigned)coord.pc,(int)coord.r,(int)coord.i,mm.ttl,##__VA_ARGS__); }while(0)
void Seat::serveFind(Msg& mm){
  if(!hasCoord||mm.ttl<=0){ if(descOn()) descEnd(4,200-mm.ttl); FINDLOG("NOROOM ttl-or-unseated"); Msg m;m.t=NOROOM;m.id=id; emit(mm.nc,m); return; }
  if(coord.pc==0){
    // H7 ROW-FILL seating (replaces the old column backfill): Section 1 fills
    // ROW-MAJOR — row 0 seats 0..C-1, then row 1, ... — so the first C people
    // in a room are ROW-MATES (the media plane's near field is row-scoped: a
    // 2-person meeting must be a direct conversation, never column-mates).
    // Admission keeps the C3 fixed-designation discipline: every S1 cell has
    // ONE designated admitter —
    //   (0,t,j>0): its row head (0,t,0);
    //   (0,t,0):   the head of the row ABOVE, (0,(t-1+C)%C,0) — the old H7
    //              seat relation inverted (growth seeds DOWNWARD row by row;
    //              the wrap still lets ordinary arrival traffic resurrect a
    //              fully-dead row, H7's original purpose).
    // Scan row-major for the first admissible cell: free AND a true FRONTIER
    // (11a: a free cell with a live down-child is an INTERNAL hole owned by
    // its fixed healer, the VERTICAL down-child — admitting there would race
    // it and mint a phantom). Admit if I am the cell's designated admitter,
    // else hand the FIND to the admitter — my row head or a fellow head, a
    // rook link; and every S1 seat is a socketed greeter, so the hand-off is
    // always deliverable.
    // Row liveness, FIRST-HAND-FIRST: my OWN row is live because I AM IN IT —
    // a lone survivor's s1seen of its own cells decays (nobody phones a lone
    // seat), and without this a survivor would resurrection-scan its own live
    // row and seat a 2-person room as COLUMN-mates (the headless-row repro,
    // leg A). Computed up front for all rows: the headless-row devolution
    // below needs the liveness of the ADMITTER's row too.
    // V4 forensics (env MESH_DUPLOG): WHY does a cell read as free at the
    // devolution decision? A no-side-effect re-derivation of cellReserved's
    // internals — occIsPhantom's KNOCKCLR print must not double-fire here.
    auto freeReason=[&](uint64_t ak)->const char*{
      if(softSitting(ak)) return "RESERVED-soft";
      if(!occ.count(ak)) return "no-occ";
      if(firstHandLive(ak)) return "RESERVED-fhl";
      int x=occGet(ak);
      if(findNc>=0 && x==findNc) return "phantom-knock";
      for(auto& kv:occ) if(kv.second==x && kv.first!=ak && firstHandLive(kv.first)) return "phantom-moved";
      if(x>=(int)alive.size()) return "phantom-oob";
      if(!alive[x]) return "RESERVED-deadhold";
      Seat* s=(x<(int)seats.size())?seats[x]:nullptr;
      if(!s||!s->hasCoord||ckey(s->coord)!=ak) return "phantom-requeued";
      return "RESERVED-live-silent";
    };
    bool rowLive[C], rowSeen[C], rowHeld[C];
    for(int t=0;t<C;t++){ rowLive[t]=(coord.r==(uint8_t)t); rowSeen[t]=rowLive[t]; rowHeld[t]=false;
      for(int j=0;j<C;j++){ uint64_t k=ckey({0,(uint8_t)t,(uint8_t)j}); if(s1Fresh(k)) rowLive[t]=true; if(s1seen.count(k)) rowSeen[t]=true; if(cellReserved(k)) rowHeld[t]=true; } }
    for(int t=0;t<C;t++){
      // A + H7 (HARDENED 2026-08-02): do NOT start the next S1 row until the
      // previous row is fully OCCUPIED — confirmed seats, not reservations.
      // A row of soft sitting-down marks is a row of vouches nobody has
      // answered yet: seating a newcomer BEHIND it gambles that every one of
      // them confirms, and when they are killed tabs (the ghost-churn repro)
      // the newcomer lands in an empty row with zero live links — a fragment
      // that can pull neither snap nor app from anyone. NOROOM is the honest
      // answer while the previous row settles: the joiner's ordinary retry
      // costs beats; a fragment costs the whole join. (The old gate counted
      // cellTaken — occ OR soft — and only refused a soft HEAD.)
      if(t>0){
        bool prevFull=true;
        for(int j=0;j<C;j++) if(!occ.count(ckey({0,(uint8_t)(t-1),(uint8_t)j}))){ prevFull=false; break; }
        if(!prevFull) break;
      }
      bool liveRow=rowLive[t], everSeen=rowSeen[t];
      // A VACATED row is not a corpse. Resurrection exists for a row that DIED
      // wholesale: its stale occ lingers (nobody left to sweep it) and blocks
      // ordinary admission, so the row BELOW re-seeds it column-wise. A row the
      // left-pack legitimately emptied (cascade scoot-up) holds NO reservation
      // at all — it is simply the frontier again, and the ordinary admitter (the
      // head of the row above, already proven full by the H7 gate) can seat it.
      // Without this, a once-occupied row that drained sent every FIND to the
      // row below — never live in a shrinking room — and newcomers past the
      // frontier searched forever (churn-combos B with spawn>1).
      if(!liveRow && everSeen && rowHeld[t]){
        // RESURRECTION (old H7, row-targeted): this row LIVED and is now
        // entirely silent — a whole-row death. Its subtrees drain (anchor dead
        // at lastAck>80, long before the RING_HOLD vertical heal) and re-enter
        // as newcomers, and THIS is what re-seeds the row: stale occ corpses /
        // childOf must NOT block it (they linger for a wiped row — nobody left
        // to sweep them). Old H7's no-race discipline is kept exactly: the
        // admitters are the greeters of the row BELOW ((t+1)%C — the old
        // "row above me is dead" relation), each admitting at its OWN column,
        // so no two admitters ever target one cell. Anyone else hands the FIND
        // to its column-mate in that row — a direct rook link. Adjacent dead
        // rows resolve bottom-up (the scan just moves to the next row), the
        // same upward cascade the old H7 wrap produced.
        if(coord.r==(uint8_t)((t+1)%C)){ uint64_t k=ckey({0,(uint8_t)t,coord.i});
          if(TICK-(healTry.count(k)?healTry[k]:-999)>45){ healTry[k]=(int)TICK; ADMIT_SITE="s1-assigner-rowfill"; admit({0,(uint8_t)t,coord.i},mm); return; }
          continue; }
        // Forward toward the admitter row below ONLY over a FIRST-HAND-LIVE link.
        // Using raw occGet here was a bug: when the admitter row is ALSO wholly
        // dead, its cells linger as stale occ echoes (a corpse's id, never cleared
        // once no neighbour is left to hear a LEAVE and gossip re-seeds it), so the
        // FIND was handed to a DEAD seat and swallowed — two ADJACENT dead home
        // rows never resurrected (the scan returned at the lower row before ever
        // reaching the upper row it could itself admit). First-hand liveness sees
        // the corpse for what it is, so a dead admitter row falls through to the
        // bottom-up `continue` and the cascade reaches a live admitter.
        Coord admc={0,(uint8_t)((t+1)%C),coord.i}, admh={0,(uint8_t)((t+1)%C),0};
        // First-hand, or DOOR-LISTED: mid-churn my first-hand hearing of the
        // admitter row decays while it is alive and greeting — the door still
        // lists it (every S1 seat is a greeter), and a door-listed admitter
        // is deliverable by definition. Without this, the dead-row fall-
        // through below raced a merely-unheard admitter row's own admissions
        // and minted a dup (c-sweep C=5 0.30×2 seed 1).
        auto doorListed=[&](int x){ if(x<0) return false; for(int g:lastGreeters) if(g==x) return true; return false; };
        int aid = firstHandLive(ckey(admc)) ? occGet(ckey(admc)) : (doorListed(occGet(ckey(admc))) ? occGet(ckey(admc)) : -1);
        if(aid<0||aid==id){ int hx=occGet(ckey(admh)); aid = firstHandLive(ckey(admh)) ? hx : (doorListed(hx) ? hx : -1); }
        if(aid>=0&&aid!=id){ Msg m;m.t=FIND;m.nc=mm.nc;m.ttl=mm.ttl-1;m.spread=mm.spread; emit(aid,m); return; }
        // The whole admitter row below is dead too. "Resolve bottom-up"
        // DEADLOCKED here when EVERY row below was dead or empty (s1all
        // recovery: fresh greeters in rows 0-1, rows 2-4 dead, one stale
        // corpse hint in row 2 — 465 seekers NOROOM'd for 39k ticks): the
        // wrap admitters can never seat because seating THEM needs this row
        // first. A dead-held row whose resurrectors are also dead can only be
        // re-seeded by ORDINARY admission — fall through to the j-loop (the
        // H7 gate above proved the row ABOVE full, so j==0's admitter is
        // alive, and stale corpse hints are individually cellReserved-
        // skipped; the row's new head then s1Fill-sweeps the corpses).
        // BUT ONLY WITH THE DOOR'S CORROBORATION: an unconditional fall-
        // through re-seeded rows a PARTITION had merely hidden and minted
        // split-brain dups (sweep split-0.5 seed 29: side B dups=18). Every
        // S1 seat is a greeter: the registry drops the DEAD instantly, while
        // a partitioned-but-alive row's members keep E3-knocking the shared
        // door and stay LISTED — so a hinted occupant present in my own last
        // greeter list means "hold the hole" (H1-S1), and a row of occupants
        // the door has forgotten is genuinely dead.
        {
          bool anyHint=false, doorHolds=false;
          for(int j=0;j<C&&!doorHolds;j++){ int x=occGet(ckey({0,(uint8_t)t,(uint8_t)j})); if(x<0) continue; anyHint=true;
            for(int g:lastGreeters) if(g==x){ doorHolds=true; break; } }
          // POSITIVE corroboration only: fall through iff the row still NAMES
          // occupants and the door has forgotten every one of them. A row
          // whose hints have fully decayed gives no verdict — hold (a
          // partition starves hints and door-listings alike, and H1-S1 says
          // hold the hole when you cannot tell).
          if(doorHolds || !anyHint) continue;
        }
      }
      for(int j=0;j<C;j++){
        Coord cell={0,(uint8_t)t,(uint8_t)j}; uint64_t k=ckey(cell);
        // Soft / real occupant reserved. Phantom occ (dead or moved claimant)
        // is free for rejoin — but live peers we only know via gossip stay
        // reserved (avoids FIND ping-pong between greeters).
        if(cellReserved(k)) continue;
        // Frontier: block only on real/soft down-child, not phantom occ.
        uint64_t dk=ckey(down(cell));
        if(cellReserved(dk) && !occIsPhantom(dk)) continue;
        if(softSitting(dk)) continue;
        // HEADLESS-ROW admission (the H7 amendment; roadmap §3 gap):
        //  - the vacated HEAD of a LIVE row is an INTERNAL HOLE owned by its
        //    designated healer (the H2 scoocher / vertical promotion) — never
        //    an admission target (C1: an admission must not race a healer).
        if(j==0 && rowLive[t]) continue;
        Coord adm = (j>0)? Coord{0,(uint8_t)t,0} : Coord{0,(uint8_t)((t-1+C)%C),0};
        Coord adm0=adm; const char* devArm=nullptr; const char* devGuard=nullptr;
        // A: soft-only primary (sitting-down, no occ yet) — not a FIND peer.
        // Assigner who wrote the soft head may fill the rest of the row.
        // NEVER devolve on mere silence of an occ occupant (that is the
        // firstHandLive hand-off gate — breaks headless-row silent death).
        if(softSitting(ckey(adm)) && !occ.count(ckey(adm)) && j>0){
          auto it=sitting.find(ckey({0,(uint8_t)t,0}));
          if(it!=sitting.end() && it->second.assigner==id){
            if(TICK-(healTry.count(k)?healTry[k]:-999)>45){ healTry[k]=(int)TICK; ADMIT_SITE="s1-headless-soft"; admit(cell,mm); return; }
            continue;
          }
        }
        // H-CHAIN: devolve when admitter is not reserved (empty or phantom).
        // Prefer first-hand live row-mates as the devolved admitter.
        // V4 NARROWING (both devolution arms): devolve ONLY over a cell I have
        // AT SOME POINT heard first-hand (live[] ever set — the same
        // falsifiable-ghost discipline as the E1 inheritance narrowing). A
        // genuine row-mate always hears its admitter within a couple of D1
        // beats; a fresh frontier seat that has NEVER coexisted with the
        // admitter is reading a gossip gap, and devolving on it minted the
        // second seed of every run (DEVOLVE guard=no-occ).
        if(!cellReserved(ckey(adm)) && fhEver.count(ckey(adm)) && rowLive[adm.r]){
          devGuard=freeReason(ckey(adm));
          Coord d={0,adm.r,0};
          for(int dj=1;dj<C;dj++){ d.i=(uint8_t)dj; if(cellReserved(ckey(d))&&!occIsPhantom(ckey(d))){ adm=d; devArm="rowmate"; break; } }
        }
        // S1 column-clique admission: ONLY when we once knew the primary
        // admitter (s1seen) and it is not reserved — never when simply unknown.
        // Devolve only to STRICTLY DEEPER same-column seats (no wrap into denser
        // upper rows). Gossip-lag wrap dual-PLACE'd /1.2 (N=9 serial → /0.4 hole).
        if(!cellReserved(ckey(adm)) && fhEver.count(ckey(adm)) && s1seen.count(ckey(adm))){
          if(!devGuard) devGuard=freeReason(ckey(adm));
          for(int rr=cell.r+1;rr<C;rr++){
            Coord d={0,(uint8_t)rr,cell.i};
            if(cellReserved(ckey(d))&&!occIsPhantom(ckey(d))){ adm=d; devArm="col-deeper"; break; }
          }
        }
        if(ckey(coord)==ckey(adm)){                    // I am the designated (or devolved) admitter
          // V4 LEDGER GATE: as a vouched-in head I may not admit into MY OWN
          // row before my assigner's SITXFER arrives — my empty view of the
          // row is definitionally lagged (its cells may be promised to
          // admittees still in flight). The 60-tick window outlives any
          // in-flight vouch's confirm; past it a silent assigner is dead and
          // its vouches died with it.
          if(coord.i==0 && cell.r==coord.r && !rowLedger && TICK-seatedAt<=60){ FINDLOG("skip cell 0/%d.%d ledger-gate",(int)cell.r,(int)cell.i); continue; }
          if(TICK-(healTry.count(k)?healTry[k]:-999)>45){
            healTry[k]=(int)TICK;
            if(occIsPhantom(k)){ if(getenv("MESH_DUPLOG")) fprintf(stderr,"PHANTOMCLR t=%lld me=%d cell=%u/%d.%d holder=%d seeker=%d\n",(long long)TICK,id,(unsigned)cell.pc,(int)cell.r,(int)cell.i,occGet(k),findNc); occDrop(k,"phantomclr"); live.erase(k); s1seen.erase(k); kidful.erase(k); tlForget(k); }
            if(devArm){
              if(getenv("MESH_DUPLOG")) fprintf(stderr,"DEVOLVE t=%lld me=%d cell=0/%d.%d adm0=0/%d.%d guard=%s arm=%s seeker=%d\n",
                (long long)TICK,id,(int)cell.r,(int)cell.i,(int)adm0.r,(int)adm0.i,devGuard?devGuard:"?",devArm,findNc);
              ADMIT_SITE="s1-devolved";
            } else ADMIT_SITE="s1-designated";
            admit(cell,mm); return;
          }
          continue;                                    // admit gate cooling — consider the next cell
        }
        // Hand off to a reachable real admitter. Never emit to a corpse id.
        // Silent-but-real heads stay reachable (headless-row C / hchain D).
        if(admitterReachable(ckey(adm))){
          FINDLOG("handoff -> %d@0/%d.%d for cell 0/%d.%d",occGet(ckey(adm)),(int)adm.r,(int)adm.i,(int)cell.r,(int)cell.i);
          Msg m;m.t=FIND;m.nc=mm.nc;m.ttl=mm.ttl-1;m.spread=mm.spread; emit(occGet(ckey(adm)),m); return;
        }
        // admitter unknown/dead/phantom: keep scanning
      }
    }
    // Only go deep when no ADMISSIBLE S1 free cell remains. Live-row heads are
    // never admission targets (healer's hole). Phantoms count as free.
    int s1admFree=0;
    for(int t=0;t<C;t++){
      bool liveR=rowLive[t];
      for(int j=0;j<C;j++){
        if(j==0 && liveR) continue; // head of live row: not an admit target
        if(!cellReserved(ckey({0,(uint8_t)t,(uint8_t)j}))) s1admFree++;
      }
    }
    // NOTE: this bounce must stay unconditional. Falling through to the deep
    // path when home's free cells look unservable FAST-TRACKS SILENT DEATH past
    // the H1-S1 ring-hold (headless-row leg C), and it buys nothing: the
    // partitioned half recovers on the reachable-forward fix below alone.
    if(s1admFree>0){ if(descOn()) descEnd(5,200-mm.ttl); FINDLOG("NOROOM s1admFree=%d",s1admFree); Msg m;m.t=NOROOM;m.id=id; emit(mm.nc,m); return; }
  }
  Coord f; if(firstFreeInRoster(f)){
    if(getenv("MESH_DUPLOG")) fprintf(stderr,"DEEPADM t=%lld me=%d my=%u/%d.%d cell=%u/%d.%d seeker=%d\n",
      (long long)TICK,id,(unsigned)coord.pc,(int)coord.r,(int)coord.i,(unsigned)f.pc,(int)f.r,(int)f.i,mm.nc);
    FINDLOG("ADMIT deep %u/%d.%d",(unsigned)f.pc,(int)f.r,(int)f.i);
    // Phantom occ on the admitted cell: clear it first-hand, exactly as the S1
    // designated arm does (a stale echo must not survive under a fresh admit).
    { uint64_t fk=ckey(f); if(occIsPhantom(fk)){ if(getenv("MESH_DUPLOG")) fprintf(stderr,"PHANTOMCLR-DEEP t=%lld me=%d cell=%u/%d.%d holder=%d seeker=%d\n",(long long)TICK,id,(unsigned)f.pc,(int)f.r,(int)f.i,occGet(fk),mm.nc); occDrop(fk,"phantomclr-deep"); live.erase(fk); s1seen.erase(fk); kidful.erase(fk); tlForget(fk); } }
    ADMIT_SITE="deep-firstFree"; admit(f,mm); return; }
  // Descend — but NEVER into the void. The S1 hand-off above is careful to pick
  // a reachable admitter; this forward used raw occ, so it happily emitted the
  // FIND at an occupant on the far side of a partition (or a corpse), where it
  // is silently swallowed. The seeker then waits out its whole timeout and
  // retries, forever. That is why the starved half of a split room seats its
  // home row and NOTHING deeper: its greeters kept forwarding newcomers at
  // peers they cannot reach (seed 8: side A 16/200 seated, 184 searching).
  // TWO PASSES, and the order is the whole point. To my own evidence a peer
  // across a partition and a SILENT-BUT-REAL head are the same thing — both
  // alive, neither phoning me (`split` cuts delivery without any transport
  // event, so no TRANSLOST ever arrives). So:
  //   pass 0 — a hop I have heard from FIRST-HAND. Demonstrably deliverable,
  //            which is what the starved half of a split needs.
  //   pass 1 — fall back to any reachable-by-occ hop, which is what a silent
  //            head needs (headless-row C, hchain D: gating those on liveness
  //            fast-tracks silent death past H1-S1 ring-hold).
  // Only when neither pass finds anyone is it honestly NOROOM.
  // THE DEPTH WALL (scale-audit defect 3): pc is a uint32 of base-6 digits —
  // 6^12 fits, 6^13 does not, and an overflowed path SILENTLY ALIASES another
  // cell (poisoned occupancy; and the JS twin on plain Numbers has no wall, so
  // the twins diverge exactly where the storm goes). A seat whose child row
  // would be depth 13 must not forward the FIND downward — NOROOM is honest
  // (a depth-12 stadium is ~2 billion sections; admission never legitimately
  // needs the 13th floor — reaching it IS the dup-war signature).
  if(pcDepth(coord.pc)>=12){ if(descOn()) descEnd(2,200-mm.ttl); FINDLOG("NOROOM depth-wall"); Msg m;m.t=NOROOM;m.id=id; emit(mm.nc,m); return; }
  Coord rc[C]; rosterCells(rc); vector<int> idx=shufCols();
  // FRONT 3 (measurement only, MESH_DESC=1): classify the candidate set BEFORE
  // the choice is made, so the tally can ask whether the pass-0 filter is what
  // steers the seeker. Zero effect on the protocol.
  int dcls[C], dkid[C];
  if(descOn()) for(int q=0;q<C;q++){ uint64_t rk=ckey(rc[q]); int x=occGet(rk);
    dcls[q] = (x<0||x==id) ? 0 : (firstHandLive(rk) ? 2 : (admitterReachable(rk) ? 1 : 3));
    auto kf=kidful.find(rk); dkid[q] = (kf==kidful.end()) ? 2 : (kf->second ? 1 : 0); }
  for(int pass=0;pass<2;pass++)
    for(int q:idx){ uint64_t rk=ckey(rc[q]); int x=occGet(rk); if(x<0||x==id) continue;
      // T7 SPREAD-AFTER-NOROOM (docs/front3-descent-2026-08-06.md). Measured:
      // at the N=5000 plateau, 100.0% of pass-0 descents offer exactly ONE
      // candidate — the child-row head, the only child a parent owns a link to
      // and therefore the only one it ever hears first-hand. Every FIND walked
      // that spine 12 levels to the wall while 11,259 free cells sat under
      // columns 1..C-1. The descent was not choosing badly; it had no choice.
      //
      // So on a FIND whose seeker has ALREADY been told NOROOM to its face,
      // let a reachable-but-unheard sibling compete in pass 0. First contact is
      // untouched, and a partitioned seeker never gets here (it fails silent,
      // not loud), so the seed-8 starvation guarantee pass 0 exists for is
      // exactly as strong as before. The hop is still strictly DOWNWARD into
      // the child row, so depth increases every time and no cycle is possible.
      if(pass==0 ? (firstHandLive(rk) || (mm.spread && admitterReachable(rk))) : admitterReachable(rk)){ if(descOn()) descNote(rc,dcls,dkid,q,pass,pcDepth(coord.pc)); FINDLOG("descend pass=%d spread=%d -> %d@%u/%d.%d",pass,(int)mm.spread,x,(unsigned)rc[q].pc,(int)rc[q].r,(int)rc[q].i); Msg m;m.t=FIND;m.nc=mm.nc;m.ttl=mm.ttl-1;m.spread=mm.spread; emit(x,m); return; } }
  if(descOn()){ descNote(rc,dcls,dkid,-1,-1,pcDepth(coord.pc)); descEnd(3,200-mm.ttl); }
  FINDLOG("NOROOM deep-dead-end");
  Msg m;m.t=NOROOM;m.id=id; emit(mm.nc,m);
}
// Q2 — COMPACTION service (the UP-CHAIN walk). A compaction FIND (tag==1) climbs
// the seeker's OWN up-chain — every hop an ALIVE link (row → head → owner) — and
// joins the NEAREST strictly-shallower OCCUPIED row (densify). Reliable (no long
// route over a fragmented mesh, no reliance on stale S1 knowledge of deep rows),
// monotone (the seeker's depth strictly decreases), and it empties lone-row deep
// sections into their ancestors' rows — the media-plane payoff. The seeker's
// coord rides in mm.coord; sd = its depth.
void Seat::serveCompact(Msg& mm){
  if(!hasCoord||state!=3||mm.ttl<=0) return;
  int sd = pcDepth(mm.coord.pc);
  if(coord.pc==0) COMPACT_ATS1++;   // V5 funnel gauge: probes that reached a Section-1 seat
  // Only a ROW HEAD decides — it holds the whole row FIRST-HAND (row-mates are
  // meshed), so its frontier view is fresh (unlike an S1 seat's stale view of a
  // deep row). A non-head hands the probe to its own row head (a direct link).
  if(coord.i!=0){ int h=occGet(ckey({coord.pc,coord.r,0})); if(h>=0&&h!=id){ Msg m=mm; m.ttl=mm.ttl-1; emit(h,m); } return; }
  // I am a row head. If my row is a DEEP row STRICTLY shallower than the seeker,
  // offer the first free DENSIFYING slot in it (a trailing frontier: free +
  // down-child empty, so the seeker lands a childless leaf and never displaces a
  // healer). NEVER Section 1 (coord.pc==0): the home is filled only under H1-S1
  // ring-conservatism — compaction filling an S1 cell whose occupant is merely
  // unreachable (not confirmed dead) could mint a divergent home. So the chain
  // climbs THROUGH S1 but never seats a compactor there.
  if(coord.pc!=0 && pcDepth(coord.pc) < sd){
    for(int j=1;j<C;j++){ Coord cell={coord.pc,coord.r,(uint8_t)j};
      if(occ.count(ckey(cell))) continue;                 // occupied (I know my row first-hand)
      if(occGet(ckey(down(cell)))>=0) continue;           // internal hole — its down-child heals it (C1)
      ADMIT_SITE="compact-densify"; admit(cell,mm); return; // densify: seat the seeker beside me, PLACE routed back (tag==1)
    }
  }
  // My row is full or not shallower than the seeker — climb one level toward the
  // home and let a shallower ancestor row take it.
  // V5 CAP (`problvl n`, default 0=unlimited): the probe may not climb above
  // n levels over its seeker. The funnel cost is the CLIMB — every unservable
  // probe walking to the S1 wall aggregates the whole room onto 25 fixed
  // seats. Dying here instead leaves the leaf to retry next period, and
  // deeper-than-cap compaction arrives via `offeron` (frontier-proportional)
  // and chained moves. My owner sits one level up: forward only if that level
  // is still within the cap.
  if(PROBLVL>0 && pcDepth(coord.pc)-1 < sd-PROBLVL) return;
  Coord o; if(ownerCoord(o)){ int oid=occGet(ckey(o)); if(oid>=0&&oid!=id){ Msg m=mm; m.ttl=mm.ttl-1; emit(oid,m); } }
}

// Q2 — COMPACTION probe. A settled DEEP LEAF (childless: P — only leaves move,
// so its departure strands nobody) periodically re-FINDs from the home for a
// STRICTLY-SHALLOWER frontier and, if one is found + reserved, is routed a PLACE
// and atomically moves up (law T). Rate-limited + settle-gated so a healing
// boundary never sloshes; strict-improvement makes depth a monotone potential ⇒
// MOVES provably settle. Never a Section-1 seat (already shallowest; greeter
// role) and never a non-leaf (would strand its subtree).
// Q2/V5 — the MOVER GATES, shared by tryCompact (periodic self-probe) and
// serveOffer (a head's invitation): am I a seat whose departure is safe and
// whose neighbourhood is quiet enough to move? Everything here is the original
// tryCompact logic, factored so an OFFER cannot recruit a mover the periodic
// probe would have refused.
bool Seat::compactEligible(){
  if(!COMPACTION) return false;
  if(!hasCoord||state!=3||coord.pc==0||moving) return false;   // S1 is the top; a mover finishes first
  // NOTE: the compactAt PERIOD lives in tryCompact, not here — it is the
  // self-probe's backoff, and an eligible leaf re-arms it the instant it
  // expires, so gating an OFFER on it would refuse every invitation ever
  // (measured: 6 offers, 0 fires). serveOffer carries its own
  // one-outstanding-probe guard (lastProbeTick) instead.
  // HYSTERESIS: compact only from a QUIESCENT neighbourhood. A LEAVE/heal/move I
  // saw nearby resets lastChurn, so during a heal storm compaction lies dormant
  // region-wide and only wakes once the dust settles — this is what stops
  // compaction from sloshing seats while a heal is still converging.
  if(TICK-seatedAt<COMPACT_SETTLE || TICK-healAt<COMPACT_SETTLE || TICK-lastChurn<COMPACT_SETTLE) return false;
  if(hasChildren()) return false;                              // P: only a leaf may move
  // CLEAN-DEPARTURE gate: only the RIGHTMOST occupant of my row may compact, so
  // my leaving shortens the row (a trailing hole, C2) and never orphans a
  // row-mate into a headless row. In a lone-row section this drains it right-to-
  // left, the head (col 0) leaving LAST — minimal, churn-free collapse.
  for(int j=coord.i+1;j<C;j++) if(occGet(ckey({coord.pc,coord.r,(uint8_t)j}))>=0) return false;
  return true;
}
void Seat::tryCompact(){
  if(!PROBEON) return;                                   // offers-only arm (V5 arm E) — the periodic self-probe off, everything else alive
  if(TICK<compactAt) return;                             // rate limit / hysteresis
  if(!compactEligible()) return;
  compactAt=TICK+COMPACT_PERIOD+(long long)(rng()*COMPACT_PERIOD);
  lastProbeTick=TICK;
  // Send a compaction probe UP my own chain: to my row head (a direct row link),
  // or, if I AM a childless head, straight to my owner. Every hop rides an ALIVE
  // link, so the probe never depends on routing across a fragmented mesh or on a
  // shallow seat's stale view. serveCompact climbs to the nearest strictly-
  // shallower OCCUPIED row and seats me beside it (densify); the admitter routes
  // the PLACE back. A dropped probe just retries next period.
  int up1 = (coord.i!=0) ? occGet(ckey({coord.pc,coord.r,0})) : -1;
  Coord o; if(coord.i==0 && ownerCoord(o)) up1=occGet(ckey(o));
  if(up1<0||up1==id) return;
  COMPACT_PROBES++;
  Msg m; m.t=FIND; m.nc=id; m.tag=1; m.coord=coord; m.ttl=COMPACT_TTL; emit(up1,m);
}
// V5 — HEAD OFFER (`offeron`, default OFF). The inversion of the probe: instead
// of ~N leaves asking "any room shallower?", the few heads that OWN a free cell
// say so. A row head with a first-hand-known free densifying slot sends one
// OFFER down its subtree per period; work per window is proportional to the
// FRONTIER, not to N. The offer is an INVITATION ONLY — the mover answers with
// a targeted tag==1 probe at the offering head, and serveCompact/admit re-check
// everything first-hand at admit time, so a stale offer (cell taken, head
// moved) degrades to a dropped probe, never a bad admit. Depth still strictly
// decreases at admit (serveCompact's `< sd`), so the monotone-potential
// termination argument is untouched.
void Seat::tryOffer(){
  if(!COMPACTION||!OFFERON) return;
  if(!hasCoord||state!=3||coord.i!=0||coord.pc==0||moving) return;   // deep ROW HEADS only — S1 never seats a compactor
  if(TICK<offerAt) return;
  // Same quiescence as the probe: never stir a region a heal is still settling.
  if(TICK-seatedAt<COMPACT_SETTLE || TICK-healAt<COMPACT_SETTLE || TICK-lastChurn<COMPACT_SETTLE) return;
  offerAt=TICK+COMPACT_PERIOD+(long long)(rng()*COMPACT_PERIOD);
  // A free DENSIFYING slot in my row, known first-hand — the exact scan
  // serveCompact serves from (free + down-child empty, so the mover lands a
  // childless leaf and never displaces a healer).
  bool slot=false;
  for(int j=1;j<C;j++){ Coord cell={coord.pc,coord.r,(uint8_t)j};
    if(occ.count(ckey(cell))) continue;
    if(occGet(ckey(down(cell)))>=0) continue;
    slot=true; break; }
  if(!slot) return;
  // Send it DOWN: to a random live down-child head under my row. The walk
  // (serveOffer) descends until it finds an eligible mover.
  vector<int> kids;
  for(int j=0;j<C;j++){ int x=occGet(ckey(down({coord.pc,coord.r,(uint8_t)j}))); if(x>=0&&x!=id) kids.push_back(x); }
  if(kids.empty()) return;
  COMPACT_OFFERS++;
  Msg m; m.t=OFFER; m.id=id; m.coord=coord; m.ttl=14; emit(kids[(int)(rng()*kids.size())],m);
}
// The OFFER down-walk. Strictly downward (plus at most one lateral hop per row,
// head -> its rightmost occupant — the only cell whose departure keeps the row
// clean), so no cycle is possible and ttl bounds the walk. Every hop is cheap
// and unprivileged; only the eventual admit carries authority, and that stays
// at the offering head, first-hand.
#define OFFERLOG(fmt,...) do{ if(getenv("MESH_OFFERLOG")) fprintf(stderr,"OFFERLOG t=%lld me=%d@%u/%d.%d ttl=%d " fmt "\n",(long long)TICK,id,(unsigned)coord.pc,(int)coord.r,(int)coord.i,mm.ttl,##__VA_ARGS__); }while(0)
void Seat::serveOffer(Msg& mm){
  if(!COMPACTION||!OFFERON) return;
  if(!hasCoord||state!=3||mm.ttl<=0){ OFFERLOG("drop unseated-or-ttl"); return; }
  // Eligible mover: STRICTLY deeper than the offered row (the same strict
  // improvement serveCompact enforces again at admit), and every tryCompact
  // gate. Answer with a TARGETED probe — small ttl: the offering head serves
  // it from its own row or it dies; a capped climb must not reopen the funnel.
  // One outstanding probe at a time: 12 ticks comfortably covers the probe's
  // serve + routed-PLACE round trip, so a second fire can only happen once the
  // first is resolved (a won move flips `moving`, which compactEligible
  // refuses). 45 was over-cautious and refused the only eligible mover the
  // shrink trace found — the leaf had just fired its own periodic probe.
  if(TICK-lastProbeTick>=12 && pcDepth(coord.pc)>pcDepth(mm.coord.pc) && compactEligible()){
    compactAt=TICK+COMPACT_PERIOD+(long long)(rng()*COMPACT_PERIOD);
    lastProbeTick=TICK;
    COMPACT_PROBES++; COMPACT_OFFERFIRES++;
    OFFERLOG("FIRE targeted probe at %d (offer depth %d, mine %d)",mm.id,pcDepth(mm.coord.pc),pcDepth(coord.pc));
    Msg f; f.t=FIND; f.nc=id; f.tag=1; f.coord=coord; f.ttl=3; emit(mm.id,f);
    return;
  }
  { bool rm=true; for(int j=coord.i+1;j<C;j++) if(occGet(ckey({coord.pc,coord.r,(uint8_t)j}))>=0){ rm=false; break; }
    OFFERLOG("not-mover cool=%d deeper=%d elig=%d mov=%d kids=%d rmost=%d ageS=%lld ageH=%lld ageC=%lld",
      (int)(TICK-lastProbeTick<12),(int)(pcDepth(coord.pc)>pcDepth(mm.coord.pc)),(int)compactEligible(),
      (int)moving,(int)hasChildren(),(int)rm,(long long)(TICK-seatedAt),(long long)(TICK-healAt),(long long)(TICK-lastChurn)); }
  // Not the mover. A head hands the offer to its row's RIGHTMOST occupant (a
  // first-hand row link; that seat's lateral target is itself, so no bounce);
  // anyone else descends to a random live down-child under their row.
  if(coord.i==0){
    int rm=-1; for(int j=C-1;j>=1;j--){ int x=occGet(ckey({coord.pc,coord.r,(uint8_t)j})); if(x>=0&&x!=id){ rm=x; break; } }
    if(rm>=0){ OFFERLOG("lateral -> %d",rm); Msg m2=mm; m2.ttl=mm.ttl-1; emit(rm,m2); return; }
  }
  vector<int> kids;
  for(int j=0;j<C;j++){ int x=occGet(ckey(down({coord.pc,coord.r,(uint8_t)j}))); if(x>=0&&x!=id) kids.push_back(x); }
  if(kids.empty()){ OFFERLOG("drop no-kids"); return; }
  int tgt=kids[(int)(rng()*kids.size())];
  OFFERLOG("descend -> %d",tgt);
  Msg m2=mm; m2.ttl=mm.ttl-1; emit(tgt,m2);
}
void Seat::heal(Coord hole){
  if(!hasCoord||state!=3||TICK-healAt<12) return;
  lastChurn=(int)TICK;   // Q2 hysteresis: I'm healing — my region is churning
  uint64_t hk=ckey(hole); if(TICK-(healTry.count(hk)?healTry[hk]:-999)<45) return;
  healAt=(int)TICK; healTry[hk]=(int)TICK;
  vector<KV> nbrs; Coord ol[MAXLINKS]; int n=ownedLinks(hole,ol);
  for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id) nbrs.push_back({ckey(ol[k]),x}); }
  bool selfNb=false; for(int k=0;k<n;k++) if(ckey(ol[k])==ckey(coord)) selfNb=true; if(selfNb) nbrs.push_back({ckey(coord),id});
  Coord oc; if(ownerCoordOf(hole,oc)){ int oid=occGet(ckey(oc)); bool has=false; for(auto&x:nbrs) if(x.k==ckey(oc))has=true; if(oid>=0&&!has) nbrs.push_back({ckey(oc),oid}); }
  // Gather EVERY candidate leaf-source, then pick ONE at random. A single fixed
  // source (my one known down-child) can have a broken/stale deep chain that
  // silently swallows the FINDLEAF forever — the stuck-home-hole bug. Diversifying
  // across my subtree children, my kidful row-mates, AND (for a home hole) other
  // Section-1 seats' subtrees means repeated heals eventually reach a live leaf; a
  // rare double-promotion is culled by E2's first-hand HELLO yield.
  // FINDLEAF sources must be FIRST-HAND LIVE — phantoms in occ (stale after a
  // cascade LEAVE) swallow FINDLEAF forever and leave home holes unfilled
  // (atomic-move leg D: seated=7/9 with /0.1+/0.2 empty forever).
  vector<int> src;
  { Coord rc[C]; rosterCells(rc); for(int q=0;q<C;q++){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id&&firstHandLive(ckey(rc[q]))) src.push_back(x); } }
  if(hole.pc==coord.pc && hole.r==coord.r){ Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ if(ckey(rm[q])==ckey(hole)) continue; if(!(kidful.count(ckey(rm[q]))&&kidful[ckey(rm[q])])) continue; int x=occGet(ckey(rm[q])); if(x>=0&&x!=id&&firstHandLive(ckey(rm[q]))) src.push_back(x); } }
  if(hole.pc==0 && coord.pc==0){ auto r=s1Roster(); for(auto&e:r) if(e.v!=id && e.k!=ckey(hole) && firstHandLive(e.k)) src.push_back(e.v); }
  // Immediate LEFT-PACK designee (hole is my left neighbour): try my subtree
  // first, then scooch. If FINDLEAF has been tried repeatedly and the head
  // hole is still open (healTry aged), scooch myself even with children so the
  // home cannot stay short forever (seed-10 mass-kill left /3.0 empty).
  if(hole.pc==coord.pc && hole.r==coord.r && hole.i==coord.i-1 && occGet(ckey(down(hole)))<0){
    vector<int> mysrc;
    { Coord rc[C]; rosterCells(rc); for(int q=0;q<C;q++){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id&&firstHandLive(ckey(rc[q]))) mysrc.push_back(x); } }
    uint64_t hk=ckey(hole);
    int tried=healTry.count(hk)?healTry[hk]:-999;
    if(!mysrc.empty() && (int)TICK-tried<90){ int who=mysrc[(int)(rng()*mysrc.size())]; Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=40; emit(who,m); return; }
    if(!hasChildren() || (int)TICK-tried>=90){ promoteInto(hole,nbrs); return; }
    if(!mysrc.empty()){ int who=mysrc[(int)(rng()*mysrc.size())]; Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=40; emit(who,m); return; }
  }
  // H-CHAIN S1 column-pack scooch UP only (hole.r < coord.r) BEFORE FINDLEAF.
  // Downward holes fall through to FINDLEAF (deep leaves), never raid denser rows.
  if(!hasChildren() && coord.pc==0 && hole.pc==0 && hole.i==coord.i && hole.r<coord.r){
    bool rowRightEmpty=true;
    for(int j=hole.i+1;j<C;j++) if(firstHandLive(ckey({0,hole.r,(uint8_t)j}))){ rowRightEmpty=false; break; }
    if(rowRightEmpty){ promoteInto(hole,nbrs); return; }
  }
  if(!src.empty()){ int who=src[(int)(rng()*src.size())]; Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=40; emit(who,m); return; }
  if(!hasChildren() && hole.pc==coord.pc && hole.r==coord.r && hole.i==coord.i-1) promoteInto(hole,nbrs);   // 11a left-pack leaf scooch
}
void Seat::findLeaf(Coord hole, vector<KV>& nbrs, int ttl){
  if(!hasCoord) return;
  if(ttl>0){ Coord rc[C]; rosterCells(rc); vector<int> idx=shufCols();
    for(int q:idx){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id&&firstHandLive(ckey(rc[q]))){ Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=ttl-1; emit(x,m); return; } } }
  // Same-row non-head hole: only LEFT-PACK (hole to my left). Old unconditional
  // return dropped FINDLEAF on live row-mates — head s1Fill then starved when
  // every deep leaf was gone and phantoms had polluted the source list.
  if(coord.pc==hole.pc && coord.r==hole.r && hole.i!=0){
    if(!(hole.i<coord.i) || hasChildren()) return;
    promoteInto(hole,nbrs); return;
  }
  promoteInto(hole,nbrs);
}
void Seat::promoteInto(Coord hole, vector<KV>& nbrs){
  if(!hasCoord||ckey(coord)==ckey(hole)) return;
  if(moving) return;                                 // T1: one move at a time
  if(coord.pc==0 && hole.pc!=0) return;
  // 11a left-pack: scooch LEFT within the row. H-CHAIN S1 column: scooch UP
  // into a denser (strictly lower row index) same-column hole when the row
  // chain is exhausted. Never scooch DOWN — that raids H7-dense upper rows
  // into sparser lower ones (N=9 serial: /0.2 → /1.2 left /0.4 empty forever).
  if(coord.pc==0 && hole.pc==0){
    bool leftPack = (hole.r==coord.r && hole.i<coord.i);
    bool colPack  = (hole.i==coord.i && hole.r<coord.r);
    if(!leftPack && !colPack) return;
    // E2, PREEMPTIVE. Every S1 pack move — left along the row, up the column —
    // targets a ROOK NEIGHBOUR of mine, so I am directly linked to whoever is
    // sitting there and am the best-placed node to answer "is that chair
    // actually empty?". The healer that declared the hole often cannot: a head
    // severed from its own row-mate confirms it dead via the D5 early probe
    // (correct from ITS vantage) and hands the hole to a neighbour that still
    // hears the occupant perfectly. Moving in anyway mints a duplicate, and the
    // id tie-break takes the INCUMBENT, not the mover (sweep sever leg: 197/200
    // via the column, 199/200 via the row).
    // The threshold must be heldRightNow, NOT firstHandLive: a crashed occupant
    // stays firstHandLive for 60 ticks, and blocking heals that long starves
    // mass-kill and partition recovery (churn seed 5, split 7, D5 crash leg).
    if(heldRightNow(ckey(hole))) return;
  }
  doMove(hole,-1,nbrs);
}
// T1 CLAIM-BEFORE-VACATE (dual-hold transit): take the NEW seat FIRST — the
// claim is ordinary seating (CLAIM/HELLO, S4-signed in production) — while the
// OLD seat is still held: no LEAVE has been sent, so to every neighbour the
// old cell is simply occupied (no admitter or healer touches it; tenure/E2
// protect it; its PHONEs are still answered). The old seat is vacated ONLY
// when the claim CONFIRMS: a new-neighbourhood frame arrives (PONG to my
// phone, a PHONE/HELLO/CLAIM from a new link), or the window closes with NO
// contradiction (a wiped region has nobody to answer — exactly the case the
// old direct move already handled). A CONTRADICTION at the new cell (E2
// yield, impostor CONFIRM) ROLLS BACK to the still-held old seat instead of
// requeueing — a mover is never homeless.
void Seat::doMove(Coord hole, int owner, vector<KV>& nbrs){
  if(!hasCoord||ckey(coord)==ckey(hole)||moving) return;
  bumpMoves(); lastChurn=(int)TICK;   // Q2 hysteresis: a move is churn
  oldCoord=coord; oldCk=ckey(coord);
  oldNbrIds.clear(); { Coord ol[MAXLINKS]; int n=ownedLinks(oldCoord,ol); unordered_set<int> seen;
    for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){ seen.insert(x); oldNbrIds.push_back(x); } } }
  holdOcc=occ; holdSeen=s1seen; holdCous=cousins;   // rollback snapshots
  occ.clear(); s1seen.clear(); cousins.clear(); tlClear();   // moving levels: old cousins / transport-loss obs are stale; rebuild fresh at the new position
  moving=true; moveAt=(int)TICK;
  take(hole,owner,nbrs);
  lastAck=(int)TICK; lastPhone=(int)TICK-100;
  bool anyNbr=false; { Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol);
    for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id){ anyNbr=true; break; } } }
  if(!anyNbr) confirmMove();                        // nobody to hear from and nobody to collide with: confirm now (the 2-person scooch stays same-tick)
}
// A frame that evidences my NEW neighbourhood (someone accepted me there).
bool Seat::moveEvidence(const Msg& m){
  if(m.t==PONG) return true;                                   // my new phone answered
  if(m.t==PHONE) return m.tock==ckey(coord);                   // a call TO my new cell
  if(m.t==HELLO||m.t==CLAIM){ Coord c=unck(m.ck); Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol);
    for(int k=0;k<n;k++) if(ckey(ol[k])==ckey(c)) return true; }
  return false;
}
// T3: the confirmed vacate — instant goodbye (D2) whose LEAVE carries WHERE I
// went (mvd), sent to the snapshotted old links; then a bounded FORWARDING
// TOMBSTONE: for LEASE_TTL I answer in-flight traffic addressed to the old
// cell (a PHONE gets MOVED, a routed frame is served from my new seat). A
// redirect, never occupancy.
void Seat::confirmMove(){
  if(!moving) return; moving=false;
  for(int x:oldNbrIds){ Msg m;m.t=LEAVE;m.ck=oldCk;m.id=id;m.mvd=ckey(coord); emit(x,m); }
  oldNbrIds.clear(); holdOcc.clear(); holdSeen.clear(); holdCous.clear();
  leaseCk=oldCk; leaseUntil=TICK+LEASE_TTL;
}
// T1 rollback: my claim at the new cell was contradicted (someone else is the
// rightful occupant). Un-announce the new cell and go home to the old seat,
// which was never vacated — nobody ever saw it empty.
void Seat::rollbackMove(){
  if(!moving) return; moving=false;
  uint64_t newCk=ckey(coord);
  { Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen;
    for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){ seen.insert(x); Msg m;m.t=LEAVE;m.ck=newCk;m.id=id; emit(x,m);} } }
  coord=oldCoord;
  occ=holdOcc; s1seen=holdSeen; cousins=holdCous;
  occ[oldCk]=id;
  oldNbrIds.clear(); holdOcc.clear(); holdSeen.clear(); holdCous.clear();
  healTry[newCk]=(int)TICK; healAt=(int)TICK;      // pace any re-attempt at that hole
  lastAck=(int)TICK; lastPhone=(int)TICK-100;      // fresh grace; re-announce below
  announce(); wake(id);
}
void Seat::attack(){ if(!hasCoord) return; Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id){ Msg m;m.t=HELLO;m.ck=ckey(ol[k]);m.id=id; emit(x,m);} } }
void Seat::requeue(const char* why){ {const char* _t=getenv("MESH_TRACE"); if(_t&&atoi(_t)==id) fprintf(stderr,"TRACE t=%lld #%d REQUEUE why=%s coord=%u/%d.%d hasCoord=%d state=%d\n",(long long)TICK,id,(why&&*why)?why:"?",(unsigned)coord.pc,(int)coord.r,(int)coord.i,(int)hasCoord,state);} if(!evil) bumpEvict(); bumpMoves(); moving=false; oldNbrIds.clear(); holdOcc.clear(); holdSeen.clear(); holdCous.clear(); leaseCk=0; leaseUntil=-1; if(hasCoord){ Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(coord);m.id=id; emit(x,m);}} }
  hasCoord=false; occ.clear(); s1seen.clear(); tlClear(); drainAt=0; join(); }

void Seat::drainOrReenter(){
  // E1 LAST RESORT, checked FIRST: owner-chain dead >220 ticks with no mesh
  // route to Section 1 → re-enter the front door. This was previously below the
  // drain branch and thus UNREACHABLE for a seat holding a STALE roster (branch
  // 1 returned every tick), stranding it forever phoning a ghost owner. Drop the
  // dead roster and requeue → join() re-knocks the relay for fresh greeters.
  if(TICK-lastAck>220){ haveRoster=false; roster.clear(); drainAt=0; requeue("E1-stale-roster"); return; }
  if(haveRoster && !roster.empty()){ if(!drainAt){ Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++){int x=occGet(ckey(rc[c])); if(x>=0&&x!=id){ Msg m;m.t=DRAIN;m.roster=roster; emit(x,m);} } drainAt=(int)TICK+25+(int)(rng()*10);} return; }
  if(TICK-rosterAskAt>40){ rosterAskAt=(int)TICK; Coord x; int xid=-1; if(crossLink(coord,x)) xid=occGet(ckey(x)); if(xid>=0&&xid!=id){ Msg m;m.t=WHOHOME;m.from=id;m.via=id;m.ttl=60; emit(xid,m);} else { Coord rm[C-1]; rowMates(coord,rm); vector<int> ri={0,1,2,3}; for(int k=3;k>0;k--){int j=(int)(rng()*(k+1));swap(ri[k],ri[j]);} for(int q:ri){int rr=occGet(ckey(rm[q])); if(rr>=0&&rr!=id){ Msg m;m.t=WHOHOME;m.from=id;m.via=id;m.ttl=60; emit(rr,m); break;}} } }
}
// NOTE (law T5 — REJECTED, kept vacate-first ON PURPOSE): a keep-old drain
// re-seat (stay seated while FINDing, vacate on PLACE) was built and REVERTED.
// It breaks E1's dissolution guarantee: the drain's vacate is what DISSOLVES a
// doomed fragment; kept alive, the fragment's mutually-live stale seats keep
// phoning, answering, serving and HEALING each other, promote one another into
// the home cells of their stale world, and mint a divergent phantom home (a
// sealed bubble no E2 witness can reach — found as persistent Section-1 dup
// pairs by the full churn sweep at kill 0.2-0.6). The atomic transit (T1-T4)
// covers moves WITHIN a live neighbourhood; a drain is the opposite case — its
// whole neighbourhood is confirmed dead, and E1 deliberately dissolves it.
void Seat::reseatViaRoster(){ bumpMoves();
  if(hasCoord){ Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(coord);m.id=id; emit(x,m);}} }
  hasCoord=false; occ.clear(); s1seen.clear(); tlClear(); drainAt=0; seatTries=0;
  int t=(haveRoster&&!roster.empty())?pickRoster():-1; if(t>=0) askSeat(t); else join(); }

bool Seat::nextHopCoord(Coord t, Coord& out){
  Coord c=coord;
  if(c.pc==t.pc&&c.r==t.r&&c.i==t.i) return false;
  if(c.pc==t.pc){                                    // SAME section — stay inside it, over owned links only
    if(c.pc==0){                                     // W7: Section 1 = 5x5 ROOK'S GRAPH — row+column are all owned links
      if(c.r==t.r){ out={0,c.r,t.i}; return true; }  // same row: one hop to the target column
      out={0,t.r,c.i}; return true;                  // else: column-mate straight into the target row (then a row-mate to t.i)
    }
    if(c.r==t.r){ out={c.pc,c.r,t.i}; return true; } // same row: row-mate straight to the target column
    // Different row: reach row t.r via ONE transpose cross-link. crossLink(pc,r,col)
    // lands in row: (col==r ⇒ 0), (r==0 ⇒ col), else col. So the column whose
    // cross-link lands in row t.r is t.r itself, except when t.r==0 use my diagonal (col r).
    int tcol = (t.r==0)? c.r : t.r;                   // never 0 (t.r!=c.r), so my cross-link exists there
    if(c.i!=tcol){ out={c.pc,c.r,(uint8_t)tcol}; return true; }   // hop 1: row-mate to that column
    Coord x; crossLink(c,x); out=x; return true;      // hop 2: transpose across to row t.r (then row-mate to t.i)
  }
  // DIFFERENT section: climb to the common ancestor, or descend toward t (up/down
  // preserve the row, so the same-section logic fixes the row once we arrive).
  auto digs=[&](uint32_t pc,vector<int>&v){ while(pc){ v.push_back(lastDigit(pc)); pc=parentPath(pc);} for(int a=0,b=(int)v.size()-1;a<b;a++,b--)swap(v[a],v[b]); };
  vector<int> pa,pb; digs(c.pc,pa); digs(t.pc,pb);
  int l=0; while(l<(int)pa.size()&&l<(int)pb.size()&&pa[l]==pb[l])l++;
  if(l<(int)pa.size()){ if(c.i!=0){out={c.pc,c.r,0};return true;} return up(c,out); }   // climb: to col 0, then up
  int d=pb[pa.size()]; if(c.i!=d){out={c.pc,c.r,(uint8_t)d};return true;} out=down(c); return true;  // descend toward child digit d
}
int Seat::nextHopToward(Coord target,int exclude){
  if(!hasCoord) return -1; Coord ideal; if(nextHopCoord(target,ideal)){ int x=occGet(ckey(ideal)); if(x>=0&&x!=id&&x!=exclude) return x; }
  if(coord.pc==0){   // W7: Section 1 rook — many redundant paths; any live column- or row-mate can carry it onward
    Coord cm[C-1]; colMates(coord,cm); for(int q=0;q<C-1;q++){ int x=occGet(ckey(cm[q])); if(x>=0&&x!=id&&x!=exclude) return x; }
    Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ int x=occGet(ckey(rm[q])); if(x>=0&&x!=id&&x!=exclude) return x; }
    return -1;
  }
  Coord xc; if(crossLink(coord,xc)){ int x=occGet(ckey(xc)); if(x>=0&&x!=id&&x!=exclude) return x; }
  Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ Coord cx; if(!crossLink(rm[q],cx))continue; int x=occGet(ckey(cx)); if(x>=0&&x!=id&&x!=exclude) return x; }
  return -1;
}
void Seat::routeTo(Coord target,int tag){ int nh=nextHopToward(target,-1); if(ckey(coord)==ckey(target)) return; if(nh>=0){ Msg m;m.t=ROUTE;m.target=target;m.asker=id;m.tag=tag;m.ttl=60;m.via=id; emit(nh,m);} }
// routeToProbe: the D5 translost probe. THE PROBE TRAVELS THE MESH, NOT THE
// DEAD LINK: the first hop excludes the probed occupant itself (my direct link
// to it is exactly what died), and the frame carries my coord (m.coord) so the
// answer can route back AROUND the dead link too (tag 3). A live severed peer
// therefore still answers; only a truly unreachable one stays silent. No
// alternate hop at all => no probe => the confirm window runs — in a room that
// sparse the dead link WAS the only path.
void Seat::routeToProbe(Coord target){
  uint64_t tk=ckey(target); if(!hasCoord||ckey(coord)==tk) return;
  int nh=probeHop(target,occGet(tk));
  if(nh>=0){ Msg m;m.t=ROUTE;m.target=target;m.asker=id;m.tag=2;m.ttl=60;m.via=id;m.coord=coord; emit(nh,m); }
}
// probeHop: first hop for a probe (or its answer) that must NOT use the direct
// link to `target`. Prefer a hop that is itself a DIRECT neighbour of the
// target — for a same-row target another ROW-mate, for a same-column target
// another COLUMN-mate (the rook's parallel independent paths); the generic
// nextHopToward fallback can otherwise pick a path that funnels straight back
// into the dead link.
int Seat::probeHop(Coord target,int excludeId){
  if(hasCoord && target.pc==coord.pc){
    if(target.r==coord.r){ Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ if(ckey(rm[q])==ckey(target)) continue; int x=occGet(ckey(rm[q])); if(x>=0&&x!=id&&x!=excludeId) return x; } }
    else if(coord.pc==0 && target.i==coord.i){ Coord cm[C-1]; colMates(coord,cm); for(int q=0;q<C-1;q++){ if(ckey(cm[q])==ckey(target)) continue; int x=occGet(ckey(cm[q])); if(x>=0&&x!=id&&x!=excludeId) return x; } }
  }
  return nextHopToward(target,excludeId);
}

// ---- mesh routing (Option A) -------------------------------------------------
// route(): deliver `inner` to coord rdst over LINKS only. If I already sit at
// rdst it is delivered locally; otherwise it is handed to the next hop toward
// rdst (or, when I am an unseated newcomer, out through my gateway link). No
// teleport: if there is no next hop it is simply dropped and the caller retries.
// strictNextHop: the ideal step toward rdst, but ONLY if it is one of MY owned
// links and occupied. Unlike nextHopToward it never falls back to a non-link
// (a row-mate's cross-link) — a vacant ideal returns -1 and the frame is dropped
// so healing fills the gap and the sender retries. This is what makes routed
// delivery travel strictly over real DataChannels (no teleport).
int Seat::strictNextHop(Coord rdst){
  if(!hasCoord) return -1;
  Coord ideal; if(!nextHopCoord(rdst,ideal)) return -1;   // already at rdst / no direction
  uint64_t ik=ckey(ideal);
  Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol);
  for(int k=0;k<n;k++) if(ckey(ol[k])==ik){ int x=occGet(ik); return (x>=0&&x!=id)?x:-1; }
  return -1;                                               // ideal isn't a direct link — drop
}
void Seat::route(Coord rdst,int rfinal,Msg inner){
  inner.routing=true; inner.rdst=rdst; inner.rfinal=rfinal; inner.rttl=64; inner.rvia=id;
  if(hasCoord && ckey(coord)==ckey(rdst)){                // I'm the destination cell
    inner.routing=false;
    if(rfinal<0 || rfinal==id){ emit(id,inner); return; } // deliver to MYSELF via the bus (never re-entrant recv → no stack blowup)
    if(rfinal<(int)seats.size() && seats[rfinal]->hasCoord && ckey(seats[rfinal]->coord)!=ckey(coord)){ emit(rfinal,inner); return; } // rfinal SEATED since — route to its coord (no teleport)
    inner.direct=true; emit(rfinal,inner); return;        // still an unseated newcomer (or a dup at my cell) — direct hand-off
  }
  int nh = hasCoord ? strictNextHop(rdst) : gateway;      // unseated ⇒ leave via the gateway link
  if(nh>=0) emit(nh,inner);
}
// routeStep(): a routing frame arrived at me mid-flight. Return true iff it is
// FOR me (routing cleared, fall through to normal dispatch); false if I forwarded
// it on (or dropped it — no route / TTL spent).
bool Seat::routeStep(Msg& m){
  bool leaseHit = hasCoord && ((leaseUntil>=0 && TICK<=leaseUntil && ckey(m.rdst)==leaseCk)   // T3: in-flight frames for my just-vacated cell land HERE (served from the new seat)
                            || (moving && ckey(m.rdst)==oldCk));                              // T1 dual-hold: ...and frames for the still-held old cell
  if(hasCoord && (ckey(coord)==ckey(m.rdst) || leaseHit)){
    if(m.rfinal<0 || m.rfinal==id){ m.routing=false; return true; }
    Msg h=m; h.routing=false;
    if(m.rfinal<(int)seats.size() && seats[m.rfinal]->hasCoord && ckey(seats[m.rfinal]->coord)!=ckey(coord)){ emit(m.rfinal,h); return false; } // rfinal SEATED since — route to it (no teleport)
    h.direct=true; emit(m.rfinal,h); return false;   // still unseated (or dup at my cell) — direct hand-off over the link
  }
  if(m.rttl<=0) return false;                              // give up — sender retries
  int nh = strictNextHop(m.rdst);
  if(nh<0) return false;                                   // no link toward rdst — drop
  Msg f=m; f.rttl=m.rttl-1; f.rvia=id; emit(nh,f); return false;
}

void Seat::onPhone(Msg& m){
  if(hasCoord && moving && m.tock==oldCk && m.tock!=ckey(coord)){   // T1 dual-hold: the OLD seat still answers while the claim is in flight — its callers keep first-hand liveness, nobody heals it
    Msg p;p.t=PONG;p.coord=oldCoord; emit(m.id,p); return; }
  if(hasCoord && leaseUntil>=0 && TICK<=leaseUntil && m.tock==leaseCk && m.tock!=ckey(coord)){   // T3: a call to my just-vacated cell — answer MOVED so the caller confirms the vacancy NOW (no silent-decay wait)
    Msg r;r.t=MOVED;r.ck=leaseCk;r.mvd=ckey(coord);r.id=id; emit(m.id,r); return; }
  if(!hasCoord || m.tock!=ckey(coord)) return;   // tock is always set for a PHONE; ckey(0,0,0)==0 is a REAL coord, so never skip the check
  // § G UP-LEG: the phoner's digest arrives as PAYLOAD on the beat it already
  // sends (G0). Which scope it names is decided by the phoner's RELATION to me,
  // which I read from its coord — never from anything it asserts.
  if(DIGEST && state==3 && m.dgUp.at>=0){ uint64_t pk=ckey(m.coord);
    if(pk==ckey(down(coord)))                                                        downDig=m.dgUp;                 // my down-child head published MY OWNED CHILD ROW
    else if(coord.pc==0 && m.coord.pc==0){ auto it=s1tab.find(pk);                                                   // a rook peer published ITS SECTION
      if(it==s1tab.end() || it->second.at<=m.dgUp.at) s1tab[pk]=m.dgUp; }
    else if(coord.pc!=0 && coord.i==0 && m.coord.pc==coord.pc && m.coord.r==coord.r) rowKids[pk]=m.dgUp;             // a row-mate published ITS SUBTREE
  }
  uint64_t ck=ckey(m.coord); int prev=occGet(ck);
  // D5: my first-hand hearing of prev ENDS at my own transport loss (an
  // unanswered translost) — a corpse whose last PHONE is still inside the
  // 40-tick window must not out-tenure the legitimate healer's fill. An
  // answered probe erases the observation, restoring full tenure protection
  // (S5: "has itself, first-hand, stopped hearing the prior occupant").
  if(prev>=0&&prev!=m.id&&m.id>prev && live.count(ck) && TICK-live[ck]<=40 && !translost.count(ck)){ Msg y;y.t=YIELD;y.ck=ck; emit(m.id,y); return; }
  setOcc(ck,m.id); liveMark(ck); noteS1(ck); kidful[ck]=m.kids?1:0; if(m.child>=0) childOf[ck]=m.child; else childOf.erase(ck);
  int owner=-1; uint64_t oCk=0; Coord myoc; if(ownerCoord(myoc)){ oCk=ckey(myoc); owner=occGet(oCk); }
  vector<Ent> row;
  if(coord.i==0 && m.coord.pc==coord.pc && m.coord.r==coord.r){ row.push_back({ckey(coord),id, occGet(ckey(down(coord)))}); for(int c=1;c<C;c++){ Coord rc={coord.pc,coord.r,(uint8_t)c}; int x=occGet(ckey(rc)); if(x>=0&&x!=m.id) row.push_back({ckey(rc),x, childOf.count(ckey(rc))?childOf[ckey(rc)]:-1}); } }
  vector<KV> cous;
  if(ckey(m.coord)==ckey(down(coord))){   // my DOWN-CHILD is phoning: teach it the heirs at its FUTURE owned-links, so if I die it promotes into me and re-links with no relay
    Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ auto it=childOf.find(ckey(rm[q])); if(it!=childOf.end()&&it->second>=0) cous.push_back({ckey(rm[q]),it->second}); }
    if(coord.pc==0){   // W7: my future owned-links are my whole ROW + whole COLUMN (rook) — teach the column heirs too
      Coord cm[C-1]; colMates(coord,cm); for(int q=0;q<C-1;q++){ auto it=childOf.find(ckey(cm[q])); if(it!=childOf.end()&&it->second>=0) cous.push_back({ckey(cm[q]),it->second}); }
    } else { Coord xl; if(crossLink(coord,xl)){ auto it=childOf.find(ckey(xl)); if(it!=childOf.end()&&it->second>=0) cous.push_back({ckey(xl),it->second}); } }
  } else if(coord.i==0 && m.coord.pc==coord.pc && m.coord.r==coord.r){   // a ROW-MATE phoned me (the head): share MY cousins, so if it scooches/heals into head (H2/C2) it inherits the relay-free promote-up neighborhood
    for(auto&c:cousins) cous.push_back({c.first,c.second});
  }
  Msg p;p.t=PONG;p.owner=owner;p.oCk=oCk;p.row=row;p.nbrs=cous;p.coord=coord;
  // § G DOWN-LEG (rides the PONG I already send, G0): the room fold, plus the
  // fold I PUBLISH BACK TO THIS PEER. The published fold is the whole of G4 —
  // it hands every author the one value it is uniquely qualified to refute:
  //   to my DOWN-CHILD  -> my SUBTREE claim, whose sole input is the row digest
  //                        that child authored (checker = the down-child, which
  //                        is already its owner's C3-designated healer)
  //   to a ROW-MATE     -> my ROW fold, which must contain that mate's own
  //                        contribution (checker = each mate, for itself only)
  if(DIGEST && state==3){ p.dgRoot=rootDig;
    bool isDownKid = ckey(m.coord)==ckey(down(coord));
    p.dgPub  = pubDig( isDownKid ? myDig : ((coord.pc!=0&&coord.i==0)?rowDig:myDig) );
    // ...and the ECHO: the report I actually folded FROM THIS PEER. A liar that
    // strips its fold strips this too (that is the strongest adversary, and it
    // is what `lie 1` models) — which is precisely what check (1) catches, since
    // the peer holds the original.
    // NB: the echo is what I FOLDED (downUsed/rowUsed, snapshotted at rollup),
    // not what I currently hold. My fold ran on my own beat and a newer report
    // may have landed since; echoing the newer one accuses me of suppression I
    // did not commit (measured: 3,310 false fires at N=600 with the live-value
    // echo — always pub.refuse == echo.refuse-1, one beat of lag).
    if(isDownKid) p.dgEcho=pubDig(downUsed);
    else if(coord.pc!=0 && coord.i==0){ auto it=rowUsed.find(ckey(m.coord)); if(it!=rowUsed.end()) p.dgEcho=pubDig(it->second); } }
  emit(m.id,p);   // p.coord: my coord, so the phoner gains FIRST-HAND liveness for me (bidirectional heartbeat)
  if(prev>=0&&prev!=m.id){ Msg y;y.t=YIELD;y.ck=ck; emit(prev,y); }
}
void Seat::phoneHome(){
  Coord tc; bool have=false; if(hasCoord){ if(coord.i!=0){ tc={coord.pc,coord.r,0}; have=true; } else have=ownerCoord(tc); }
  {const char* _t=getenv("MESH_TRACE"); if(_t&&atoi(_t)==id){ int _tid=have?occGet(ckey(tc)):-2; fprintf(stderr,"TRACE t=%lld #%d phoneHome have=%d tc=%u/%d.%d tid=%d lastAckAge=%lld\n",(long long)TICK,id,(int)have,have?(unsigned)tc.pc:0,have?(int)tc.r:-1,have?(int)tc.i:-1,_tid,(long long)(TICK-lastAck));} }
  if(!have) return; int tid=occGet(ckey(tc)); if(tid<0) return;
Msg m;m.t=PHONE;m.coord=coord;m.tock=ckey(tc);m.id=id;m.kids=hasChildren();m.child=occGet(ckey(down(coord)));
  // § G UP-LEG (payload on the beat, G0): a deep HEAD contributes its whole ROW
  // fold (its owner is linked to it and to nobody else in that row); everyone
  // else contributes its own subtree. Section-1 rows do NOT roll up — every S1
  // seat is a forest root — so an S1 seat always publishes its subtree.
  if(DIGEST && state==3){ m.dgUp=pubDig((coord.pc!=0 && coord.i==0) ? rowDig : myDig); noteUp(m.dgUp); }
  emit(tid,m);
  // A GHOST PHONE TARGET MUST BE FALSIFIABLE (2026-08-05, churn-combos leg C).
  // The gap: an occupant that MOVED before I arrived (its LEAVE went to a cell
  // that was empty at the time, so nobody could address it to me) leaves a
  // ghost occ entry no rule could falsify — occGet never goes <0, no transport
  // event ever fires (we never shared a live DC), so the VERTICAL/HORIZONTAL
  // healers' guards stay shut while my lastAck rots to E1's 220-tick last
  // resort: a healthy deep seat E1-suicides out of a healthy room, exactly the
  // "waiting for a seat" a bystander sees after somebody ELSE's link blipped.
  // The remedy is a VIEW-ONLY delete at the healers' OWN horizons, probe-gated:
  // past OWNER_SILENT (5 silent beats) I probe the cell across the mesh every
  // beat — a live-but-severed occupant answers HELLO, becomes first-hand, and
  // this branch resets; only a target silent through the SAME confirm horizon
  // the healers use (60 deep, RING_HOLD in Section 1 — H1-S1 conservatism
  // unchanged) has its occ entry erased, which is what lets the EXISTING
  // occGet<0 healer branches finally fire, with all their own pacing intact.
  // (First cut of this registered a translost observation instead — that
  // borrows the DC-death EARLY_HOLD confirm, and a mass-kill storm then minted
  // a duplicate: probe loss under storm is not death evidence. Measured, and
  // the horizons went back to the healers' own.)
  // NARROWED (2026-08-05, second cut): only an occupant I have NEVER heard
  // first-hand — a pure inheritance ghost (live has no entry at all) — is
  // falsifiable by silence. An occupant I once heard and lost is the severed-
  // but-alive case, and that belongs to D5/E2's transport-event + ring
  // conservatism, never to a silence clock: under continuous link churn
  // (repro-adversary "links dying underneath the room") probes die with the
  // links, and the broad !firstHandLive form falsified LIVE severed neighbours
  // — measured RED in-gate on the first cut, green again with this narrowing.
  { uint64_t tk=ckey(tc);
    if(TICK-lastAck>OWNER_SILENT && !live.count(tk)){
      routeTo(tc,1);
      long long confirmH=(tc.pc==0)?RING_HOLD:90;   // deep: 1.5x the healer horizon — silence is weaker evidence than a LEAVE, and 60 measurably degraded post-mass-kill packing (compaction leg 1); 120 lost the E1 race (leg C s5)
      if(TICK-lastAck>confirmH && occ.count(tk)){ occDrop(tk,"ack-horizon"); kidful.erase(tk); s1seen.erase(tk); } } }
}
// D1 heartbeat over the RICH ROOK (W7): a Section-1 seat phones every live rook
// neighbour — its whole row AND whole column — each beat, so first-hand liveness is
// maintained across all redundant home paths. This is what lets phantoms decay
// (no heartbeat ⇒ not first-hand ⇒ probed and cleared) and lets ringConfirmDead /
// the head-vacancy test rely on first-hand truth instead of gossip. The deep
// down-link is still covered by the deep child phoning UP (phoneHome).
void Seat::s1Heartbeat(){
  if(!hasCoord || coord.pc!=0) return;
  Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol);
  for(int k=0;k<n;k++){ Coord t=ol[k]; if(t.pc!=0) continue;   // rook (Section-1) links only
    int tid=occGet(ckey(t)); if(tid<0||tid==id) continue;
    Msg m;m.t=PHONE;m.coord=coord;m.tock=ckey(t);m.id=id;m.kids=hasChildren();m.child=occGet(ckey(down(coord)));
    if(DIGEST && state==3) m.dgUp=pubDig(myDig);   // § G: rook peers exchange SECTION digests (no row fold in Section 1 — every S1 seat is a forest root)
    emit(tid,m); }
}
void Seat::s1Sync(){
  vector<Ent> ent; ent.push_back({ckey(coord),id,0, occGet(ckey(down(coord))), born.count(ckey(coord))?born[ckey(coord)]:(int)TICK});   // carry MY heir (my down-child)
  for(auto&e:occ){ if((e.first>>16)==0 && e.second!=id){ auto it=s1seen.find(e.first); if(it!=s1seen.end()&&TICK-it->second<120) ent.push_back({e.first,e.second,(int)(TICK-it->second), childOf.count(e.first)?childOf[e.first]:-1, born.count(e.first)?born[e.first]:-1}); } }
  // W7: sync S1SYNC over the whole rook neighbourhood — every live row-mate AND
  // column-mate (heads included). This is the S1SYNC that keeps the full C^2 home
  // roster consistent across the richly-meshed section.
  unordered_set<int> tg; Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){int t=occGet(ckey(rm[q])); if(t>=0&&t!=id)tg.insert(t);}
  Coord cm[C-1]; colMates(coord,cm); for(int q=0;q<C-1;q++){int t=occGet(ckey(cm[q])); if(t>=0&&t!=id)tg.insert(t);}
  // § G ROOT FOLD: the rook has diameter 2, so a Section-1 seat hears 2(C-1) of
  // the C^2 sections first-hand and needs ONE relay hop for the rest. S1SYNC is
  // already that relay (it carries the C^2 occupancy table), so the digest table
  // rides it — no new frame (G0), and the fold completes in two beats. Relaying
  // another section's digest is second-hand BY CONSTRUCTION; that is safe for
  // exactly one reason (G1): a digest can never actuate. Entries carry their
  // AUTHOR's stamp, relayed unchanged, so a relayed fold can never look fresher
  // than it is.
  vector<DigE> digs;
  if(DIGEST && state==3){ digs.push_back({ckey(coord),pubDig(myDig)});
    for(auto&e:s1tab) if(e.first!=ckey(coord) && TICK-e.second.at<=DIG_TTL) digs.push_back({e.first,e.second}); }
  for(int t:tg){ Msg m;m.t=S1SYNC;m.ent=ent;m.digs=digs; emit(t,m); }
}
void Seat::rowSweep(){
  // 11a: the head no longer HEALS its row cells (each is healed by its own
  // down-child (VERTICAL) or its right-neighbour (LEFT-PACK) — a fixed unique
  // designation). rowSweep is now pure cleanup: forget a row cell gone silent
  // past the horizon so a corpse stops riding the head's PONG. A severed-but-alive
  // cell that gets forgotten here re-announces (PHONE/HELLO) on recovery.
  if(coord.i!=0) return;
  vector<uint64_t> del;
  for(auto&e:live){ if(TICK-e.second<=50) continue; Coord c=unck(e.first); if(c.pc==coord.pc&&c.r==coord.r&&c.i>0) del.push_back(e.first); }
  // A SILENCE-forget is NOT a free chair (2026-08-02): the occupant may be
  // merely severed from ME while my row-mates still hear it — their next
  // S1SYNC re-seeds my occ within a beat, but the gap between this forget and
  // that re-seed was an ADMISSION WINDOW: a seeker could be seated on a live
  // peer's cell and the E2 contest then churned one of them out (mesh-harness
  // D5-sever: a revolving door at the severed cell). Stamp healTry — the
  // head's own 45-tick admission pace — so the window is closed; every
  // EXPLICIT free (LEAVE, MOVED, D5 confirm, check-back) still clears healTry
  // and stays instantly admissible.
  for(auto k:del){ live.erase(k); occDrop(k,"drain-sweep"); kidful.erase(k); s1seen.erase(k); tlForget(k); healTry[k]=(int)TICK; }
  // (D5's early corpse-forget lives in tlSweep — every observer, not just
  // heads — so a confirmed corpse stops riding rosters in ~probe-time.)
}
// tlSweep — D5 cleanup at EVERY observer (D3's "a corpse stops riding rosters",
// started early): once my own observation CONFIRMS (probe unanswered on every
// path past the early window), the corpse leaves MY occ/roster view even when I
// am not the designated healer — healing stays exclusively the healer's (C3);
// this deletes a view, never fills a seat. The standing translost then keeps
// gossip echoes from re-seating the corpse until the cell genuinely refills
// (setOcc/admit clear it).
void Seat::tlSweep(){
  if(translost.empty()) return;
  vector<uint64_t> tl; for(auto&e:translost) tl.push_back(e.first);
  for(auto k:tl){ if(!translostConfirmed(k)) continue;
    if(occ.count(k)){ occDrop(k,"tlsweep"); live.erase(k); kidful.erase(k); s1seen.erase(k); healTry.erase(k); } }   // freed ⇒ admissible now
}
void Seat::s1Fill(){
  // Section 1 must stay full (25). A cell {0,r,j} is normally refilled from below
  // by its down-child (VERTICAL Rule V). s1Fill is the head's backstop AND the only
  // thing that clears a Section-1 PHANTOM (a stale gossip echo of an occupant that
  // requeued OUT of Section 1 — its claim keeps re-circulating and never expires,
  // blocking the cell from ever refilling; the echo-immune live signal is inc 29).
  // It fires on DIRECT-evidence staleness: `live[]` is set only by a real PHONE
  // (not by gossip), so a genuine occupant keeps it fresh, a phantom or a corpse
  // does not. (A severed-but-alive cell can trip this too — the rare re-heal is
  // ≤1 per cell and the head, linked to both claimants, resolves it via onPhone.)
  if(TICK-seatedAt<80) return;
  // The HEAD is the row backstop: it refills each of its row cells (0,r,1..4). Every
  // fill is probe-gated (ringConfirmDead) so a merely-unreachable occupant is held as
  // a hole, never duplicated. One heal per pass.
  for(int j=1;j<C;j++){ Coord c={0,coord.r,(uint8_t)j}; uint64_t ck=ckey(c);
    if(translost.count(ck) && hasDownChild(c)) continue;   // D5: on the EARLY path defer a cell that owns a down-child to its VERTICAL healer (bug #3's rule) — that child holds the same first-hand loss and heals it in ~probe-time; racing it here minted duplicates. The RING_HOLD horizon path below is unchanged (translost clears once the cell refills or answers).
    // (the translost observation deliberately STANDS after the clear — it keeps
    // S1SYNC echoes from re-seating the corpse in my occ until the cell
    // genuinely refills; setOcc/admit clear it on an occupant change)
    if(ringConfirmDead(c)){ if(occ.count(ck)){occDrop(ck,"ring-dead");live.erase(ck);s1seen.erase(ck);kidful.erase(ck);} holeSince.erase(ck); heal(c); return; }
  }
}
// H1-S1 RING-HEAL CONSERVATISM, probe-gated (NOT gossip-gated). A home cell I don't
// hear first-hand is a hole, a phantom (a stale gossip echo — s1Fresh can NEVER
// distinguish it from life, so it is useless as a liveness test), or an occupant
// merely unreachable to me. So I actively PROBE it across the whole rook (routeTo
// walks every redundant path): a live-and-reachable occupant answers with a HELLO
// and becomes first-hand next round (=> not dead); a true hole / phantom / genuinely
// -partitioned occupant stays silent. Only after the occupant is unreachable via ALL
// paths for the full ring window is it declared dead. Holding a home coord as a
// temporary hole is a recoverable dip; duplicating it is an unrecoverable divergence.
bool Seat::ringConfirmDead(Coord h){
  uint64_t hk=ckey(h);
  // D5 EARLY-PROBE: my own transport to this occupant died (first-hand) and the
  // confirm probe went unanswered across the whole rook for the settled early
  // window — confirmed dead NOW; the horizon below remains the backstop when no
  // transport event fired. (An answered probe clears the observation inside
  // translostConfirmed — no eviction, E2 stands.)
  if(translostConfirmed(hk)) return true;
  if(firstHandLive(hk)){ holeSince.erase(hk); return false; }
  routeTo(h,1);                                             // probe across the rook
  int since = live.count(hk)? live[hk] : (holeSince.count(hk)? holeSince[hk] : (holeSince[hk]=(int)TICK));
  return TICK-since>RING_HOLD;
}
// ---- D5 EARLY-PROBE intake (transport loss is FIRST-HAND evidence) ----------
// transportLost(pid): MY modelled DataChannel to `pid` died — my own direct
// observation (a fabric event; no peer message and no gossip can mint it). It
// evicts NOBODY by itself: it registers the observation, edge-triggered per
// coord (one probe burst per transition — a flapping link cannot storm), and
// fires the EXISTING confirm probe immediately so the probe-gated death
// confirmation can start now instead of after the silence horizon.
void Seat::transportLost(int pid){
  if(!hasCoord||state!=3||pid<0||pid==id) return;
  Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol);
  for(int q=0;q<n;q++){ uint64_t k=ckey(ol[q]);
    if(occGet(k)!=pid||translost.count(k)) continue;
    translost[k]=(int)TICK; tlProbeAt[k]=(int)TICK; routeToProbe(ol[q]); }   // probe NOW — across the mesh, not the dead link
  wake(id);
}
// translostConfirmed(k): TRUE only when a transport loss is registered for k AND
// the probe has gone unanswered on every mesh path for EARLY_HOLD. ANY answer
// since the loss — first-hand contact (live) or a probe answer (probeAck) —
// clears the observation and re-arms the edge trigger: their link to me died;
// they may be fine (the probe travels the mesh, not the dead link). While
// pending it re-probes every ~6 ticks (the first probe can be lost).
bool Seat::translostConfirmed(uint64_t k){
  auto it=translost.find(k); if(it==translost.end()) return false;
  int at=it->second;
  auto lv=live.find(k); auto pa=probeAck.find(k);
  if((lv!=live.end()&&lv->second>=at)||(pa!=probeAck.end()&&pa->second>=at)){ tlForget(k); return false; }
  auto pt=tlProbeAt.find(k);
  if(pt==tlProbeAt.end()||TICK-pt->second>=6){ tlProbeAt[k]=(int)TICK; routeToProbe(unck(k)); }
  return TICK-at>EARLY_HOLD;
}

// ============================================================================
// V1 ROLLUP DIGEST — healing-laws.md § G. Kill the O(N) status flood by folding
// the room along the tree that already exists.
//
// THE TREE. A seat's aggregator is the owner of its ROW — up({pc,r,0}) — so the
// C seats of a row share one parent and reach it only through their head, and
// the C^2 Section-1 seats are the forest roots (walk up from anywhere and you
// land on exactly one of them, so their subtrees PARTITION the room).
//
// THE FLOW, per pulse period, per node:
//   deep i>0  : publish MY subtree digest to my head            (rides my PHONE)
//   deep i==0 : fold C-1 row-mates + myself -> ONE row digest    (rides my PHONE)
//               to my owner; my owner folds that single report.
//   S1        : fold my subtree; exchange the C^2 section table over the rook
//               (rides S1SYNC, diameter 2 => two beats to a complete room fold)
//   down      : the room fold rides every PONG back down, one level per period
// => <= C reports in, ONE out. N never appears. G0: not one new frame.
// ============================================================================
Dig Seat::pubDig(const Dig& d){
  Dig o=d;
  // The adversary knob. Mode 1 SUPPRESSES — it publishes a fold with the
  // refusals (and the partial flag) stripped. That is the ONE dangerous
  // direction (G4.2) and the only one the checker needs to catch; mode 2
  // inflates n, which G2 makes harmless by construction.
  if(lie==1){ o.refuse=0; o.part=0; }
  else if(lie==2){ o.n+=1000; }
  return o;
}
// G4: remember every report I published upward, keyed by its own stamp. The
// aggregator must ECHO the report it folded, and this ring is the ground truth
// that echo is checked against.
void Seat::noteUp(const Dig& d){ upLog[upLogI&15]={d.at,d.n,d.refuse}; upLogI++; if(upSince<0) upSince=TICK; }
// (the ring is keyed by stamp; echo.by==id is checked by the caller before lookup)
// G4, THE AUTHOR'S REFUTATION — the only check any node performs, and it is over
// a value that node itself authored. No votes (G4.4), no adjudication (G5).
//
// WHY AN ECHO AND NOT A WINDOW. The first cut compared the published fold
// against a sliding minimum of my own recent reports, and that cannot be made
// to work. Guarding it tightly enough to survive a SETTLING aggregator — which
// legitimately publishes a fold stamped before my first report ever reached it
// (me n=1, it n=1, base 1 => "short by one"; 473 false fires in one clean N=600
// join) — makes it blind to a SHRINKING scope, where the aggregator legitimately
// folds a NEWER, SMALLER value than my window minimum (the residual family that
// survived the first fix). Both directions cannot be covered by any bound on my
// own history, because the fact that decides it is WHICH of my reports the
// aggregator used. So it has to say. That is one more small field on a frame it
// already sends (G0), and it makes the check exact:
//
//   (1) ECHO FIDELITY     — what it says it took from me IS what I sent.
//   (2) FOLD MONOTONICITY — the fold it published contains what it echoed.
//   (3) ECHO FRESHNESS    — it is not acknowledging an ancient report of mine
//       while quietly ignoring every newer one (suppression by omission).
//
// A liar cannot dodge by back-stamping either: a stale stamp is exactly what G3
// fail-closes on, so the dodge blurs the room the lie was trying to clear.
// `base` is what the aggregator legitimately adds atop my report — 1 for an
// owner folding itself with my row digest, 0 for a head folding my subtree into
// its row.
bool Seat::upRefuted(const Dig& pub,const Dig& echo,int base){
  digArm=0;
  if(upLogI==0) return false;
  // (3) OMISSION. "I folded nothing from you" (echo.at<0) is honest for a beat —
  // my report lands between the aggregator's folds, so the very PONG that
  // acknowledges it still echoes the previous fold — and a standing lie if it
  // persists. The evidence is therefore CONSECUTIVE empty echoes, not elapsed
  // time: a wall-clock window fires on the one-fold lag of a first report
  // (measured, seed 5 at N=600). One full staleness window of folds, and the
  // counter resets the moment anything is acknowledged or the aggregator
  // changes.
  if(echo.at<0){ emptyEcho++; digArm=3; return emptyEcho>2*DIG_TTL/8; }
  emptyEcho=0;
  if(TICK-echo.at>2*DIG_TTL){ digArm=3; return true; }
  if(echo.by!=id) return false;   // the echo names a DIFFERENT author — my cell's previous occupant's report, not mine. Not evidence.
  const UpRec* r=nullptr; for(int q=0;q<16;q++) if(upLog[q].at==echo.at){ r=&upLog[q]; break; }
  if(!r) return false;                                     // older than my ring — no record, so no accusation
  if(echo.n!=r->n || echo.refuse!=r->refuse){ digArm=1; return true; }  // (1)
  if(pub.n < base+echo.n || pub.refuse < echo.refuse){ digArm=2; return true; }  // (2)
  return false;
}
// G3's fail-closed predicate, FALSIFIABLE (the E1/V4 amendment restated for the
// fold): is this scope member a PERSON I have lost, or just a stale occ entry?
// The first must blur the room; the second must NEVER, because it never clears —
// a permanent unclearable blur would be exactly the "one lost message splits the
// room's view of reality forever" bug the flood was invented to fix, wearing new
// clothes. Measured: a settled N=600 room carries a couple of inheritance ghosts
// (occ entries for cells `find` says are EMPTY) that no sweep owns; the raw
// occ.count() form pinned refuse>=2 and partial=100% forever.
// So the fold reads the SAME phantom-aware evidence the admission layer reads
// (V5's "ONE reservation semantics at every site"): a requeued/moved echo is not
// a member, while a SILENTLY DEAD occupant — occ entry held, alive[] false, no
// LEAVE — still is, and still blurs. Pure read: occIsPhantom mutates nothing.
// ...and BOUNDED BY THE HEALING HORIZON. Even phantom-aware, a raw occ read
// blurs forever: after a 20% churn at N=2000 two heads still hold occ for row
// cells `find` reports EMPTY whose occupants died with no deliverable LEAVE
// (alive[x]==false, so occIsPhantom deliberately says "not a free chair" —
// silent death must stay ring-hold conservative). Nothing owns those entries,
// so partial stuck at 100% and refuse at +3 over truth, permanently. A member
// blurs the room only while its loss is ACTIONABLE: I heard it first-hand
// within the horizon its cell's healer works to (DIG_LOSS_H spans RING_HOLD,
// the longest confirm window in the system) and now cannot hear its digest.
// Past that the cell is either healed — a new occupant publishes and is counted
// — or it is a ghost nobody owns, and a ghost may not hold a room blurred for
// the rest of its life. Same shape as firstHandLive's decay and E1's
// falsifiable-ghost amendment: evidence has a horizon.
// Residual, honest: a member alive, refusing, and severed from its aggregator
// for longer than DIG_LOSS_H drops out of both n and refuse. That is the mesh's
// own "we have lost that subtree" case (E3 partition), not a digest fact.
bool Seat::scopeGap(uint64_t k){
  if(!occ.count(k) || occIsPhantom(k)) return false;
  auto it=live.find(k); return it!=live.end() && TICK-it->second<=DIG_LOSS_H;
}
void Seat::rollup(){
  if(!DIGEST || !hasCoord || state!=3) return;
  // occIsPhantom's 03c knock-is-evidence rule is scoped to the FIND scan in
  // progress — a display fold is not that scan. Clearing findNc for the fold
  // keeps the rollup's phantom read independent of a mid-flight FIND, and stops
  // it emitting spurious KNOCKCLR lines into the V4 dup forensics.
  int svFind=findNc; findNc=-1;
  struct R{ int* p; int v; ~R(){ *p=v; } } _r{&findNc,svFind};
  // --- (1) my SUBTREE = me + the child row I own -----------------------------
  Dig d; d.n=1; d.refuse=refuses?1:0; d.at=(int)TICK; d.by=id; d.part=0; d.freeC=0;
  // G7 free-space, MEASURED ONLY: how many of my owned child row's cells look
  // admissible. Deliberately a PURE read (occ/sitting membership, no
  // cellReserved) — the reservation helpers lazily expire soft marks, and a
  // display fold must not be able to mutate admission state at all.
  if(pcDepth(coord.pc)<12){ Coord rc[C]; rosterCells(rc);
    for(int c2=0;c2<C;c2++){ uint64_t k=ckey(rc[c2]); if(occ.count(k)||sitting.count(k)) continue; uint64_t dk2=ckey(down(rc[c2])); if(occ.count(dk2)||sitting.count(dk2)) continue; d.freeC++; }
    if(d.freeC) d.dmin=pcDepth(coord.pc)+1; }
  uint64_t dk=ckey(down(coord)); digGap=0; downUsed=Dig();
  if(downDig.at>=0 && TICK-downDig.at<=DIG_TTL){ d.n+=downDig.n; d.refuse+=downDig.refuse; d.freeC+=downDig.freeC; if(downDig.dmin<d.dmin)d.dmin=downDig.dmin; if(downDig.part)d.part=1; downUsed=downDig; }
  else if(scopeGap(dk)){ d.part=1; d.refuse+=1; digGap=1; }   // G3 FAIL-CLOSED: a subtree I believe populated but cannot currently hear counts as REFUSING, never as zero
  myDig=d;
  // --- (2) deep ROW HEAD: fold my row (my owner is linked only to me) --------
  if(coord.pc!=0 && coord.i==0){
    Dig r=myDig; r.at=(int)TICK; r.by=id; rowUsed.clear();
    for(int j=1;j<C;j++){ uint64_t rk=ckey({coord.pc,coord.r,(uint8_t)j}); auto it=rowKids.find(rk);
      if(it!=rowKids.end() && TICK-it->second.at<=DIG_TTL){ r.n+=it->second.n; r.refuse+=it->second.refuse; r.freeC+=it->second.freeC; if(it->second.dmin<r.dmin)r.dmin=it->second.dmin; if(it->second.part)r.part=1; rowUsed[rk]=it->second; }
      else if(scopeGap(rk)){ r.part=1; r.refuse+=1; digGap|=2; } }
    rowDig=r;
  }
  // --- (3) SECTION 1: fold the ROOT from the C^2 section digests -------------
  // Section 1 has no owner, so the room fold happens HERE, C^2 times over (each
  // S1 seat computes it independently — there is no root to fight over, § P).
  if(coord.pc==0){
    Dig R; R.at=(int)TICK; R.by=id;
    for(int r0=0;r0<C;r0++) for(int i0=0;i0<C;i0++){ uint64_t k=ckey({0,(uint8_t)r0,(uint8_t)i0});
      if(hasCoord && k==ckey(coord)){ R.n+=myDig.n; R.refuse+=myDig.refuse; R.freeC+=myDig.freeC; if(myDig.dmin<R.dmin)R.dmin=myDig.dmin; if(myDig.part)R.part=1; continue; }
      auto it=s1tab.find(k);
      if(it!=s1tab.end() && TICK-it->second.at<=DIG_TTL){ R.n+=it->second.n; R.refuse+=it->second.refuse; R.freeC+=it->second.freeC; if(it->second.dmin<R.dmin)R.dmin=it->second.dmin; if(it->second.part)R.part=1; }
      else if(scopeGap(k)){ R.part=1; R.refuse+=1; digGap|=4; } }
    rootDig=R;
  }
}

void Seat::recv(Msg& m){
  if(!alive[id]) return;
  framesIn++;   // GAUGE only (the V1 law's actual subject: frames per node per tick must not grow with N)
  if(m.routing && !routeStep(m)) return;   // Option A: in-transit routing frame — forward it (or drop); only fall through when it is FOR me
  if(moving && state==3 && moveEvidence(m)) confirmMove();   // T1: a new-neighbourhood frame is the claim's CONFIRMATION — vacate the old seat now
  switch(m.t){
    case GREETERS: {
      if(m.list.empty()){ if(state==0){ genKey=myKey; vector<KV> e; take({0,0,0},-1,e);} return; }   // R3: empty list => I minted the genesis key & found the home (also R6 TAKE-OVER: a stranded newcomer whose room finally emptied)
      if((state==0||state==1) && joinStart>=0 && TICK-joinStart>STRAND_TTL && (lastReach<0 || TICK-lastReach>STRAND_TTL)){ stranded=true; strandedAt=(int)TICK; return; }   // R6: greeters exist (meeting alive) but I've REACHED none (no HOME roster came back) for a full TTL => voted off / unreachable subnet. A seat that keeps reaching greeters (lastReach fresh) but only gets NOROOM is competing for a slot in a busy heal — NOT stranded — so it keeps retrying.
      lastGreeters=m.list; greetersAt=(int)TICK;   // stamped: entry-resume trusts this list only while registry-fresh
      if(state==0){ int g=m.list[(int)(rng()*m.list.size())]; gateway=g; Msg w;w.t=WHOHOME;w.from=id;w.ttl=60; emit(g,w); state=1; retryAt=(int)TICK; }   // pick a RANDOM greeter (spreads intro load); it is my ENTRY GATEWAY — replies route back through it while I'm unseated
      // E3 (stripped): a seated Section-1 seat knocks ONLY to keep an honest
      // greeter in the pool (anti-poison floor); it IGNORES the greeters it gets
      // back. The roster self-audit is gone — genesis/fork convergence is E4/R5.
      // EXCEPT the split-off fragment: a burst race can seat a newcomer into an
      // already-taken cell with an empty occ and NO links (the admitter that
      // placed it was itself confused). It then can't phone (heartbeat is occ-
      // gated) or route-probe (no link), so E2 never yields it — a permanent
      // isolated duplicate. Its ONE shared channel with the real ring is this
      // relay re-knock: if I have heard NO rook neighbour first-hand for a full
      // strand window yet the pool lists OTHER live greeters, I am split off —
      // requeue and rejoin cleanly. A genuinely-alone genesis lists no other
      // greeter, so it never trips. (Surfaced by the C=2/C=3 sweep, where the
      // sparse rook mesh makes the seating race and the isolation both likely.)
      if(state==3 && coord.pc==0 && TICK-rookSeenAt>STRAND_TTL){
        bool other=false; for(int g:m.list) if(g!=id && g>=0){ other=true; break; }
        if(other){ requeue("rook-silent-split"); return; }
      }
      // TWO-RING RECONCILIATION (2026-08-02): the lone-fragment rescue above
      // needs a seat hearing NOBODY — but a churn can rebuild TWO complete
      // home rings in one session (each ring hears its own rook, so neither
      // is "isolated"), a stable split-brain the sweep found at C=2 (three
      // duplicated home cells for 20k ticks). Both rings' greeters share the
      // ONE door: a pool-listed id that appears NOWHERE in my occ is a
      // greeter of a ring I cannot see — greet it; if we contest a cell, E2
      // settles it (lower id wins, the loser requeues through the door into
      // the winning ring), and mutual occ learning cascades the rest. Under
      // a TRUE partition the HELLO is undeliverable, so two-clean-homes is
      // untouched. THREE dormancy gates keep it out of ordinary life:
      //   QUIESCENCE (Q2 hysteresis — mid-churn a "full" home view is
      //   routinely full of corpses while the pool lists replacements;
      //   greeting through that fired 157× in the compaction shrink),
      //   FULL HOME (a stranger while my home has holes is a transient),
      //   PERSISTENCE (eight consecutive E3 sightings — any legit
      //   staleness resolves in one or two; a rival ring never does).
      if(state==3&&coord.pc==0&&TICK-seatedAt>80&&TICK-lastChurn>300&&TICK-healAt>300){
        bool full=true;
        for(int r=0;r<C&&full;r++) for(int i=0;i<C&&full;i++) if(!occ.count(ckey({0,(uint8_t)r,(uint8_t)i}))) full=false;
        if(full){
          unordered_set<int> known; for(auto&e:occ) known.insert(e.second);
          unordered_map<int,int> next;
          for(int g:m.list) if(g>=0&&g!=id&&!known.count(g)){
            int seen=(strangeSeen.count(g)?strangeSeen[g]:0)+1; next[g]=seen;
            if(seen>=8){ Msg h;h.t=HELLO;h.ck=ckey(coord);h.id=id; emit(g,h); next.erase(g); }   // 8 consecutive E3 cycles ≈ 1600-3200 ticks: an order past any legit staleness window (live mates' S1SYNC overwrites a non-first-hand corpse cell within beats), far inside a standoff's lifetime
          }
          strangeSeen.swap(next);   // ids no longer listed/known drop out
        } else strangeSeen.clear();
      }
      return; }
    case WHOHOME: {
      if(!hasCoord){ Msg h;h.t=HOME; emit(m.from,h); return; }
      if(m.ttl<=0) return;
      if(coord.pc==0){ Msg h;h.t=HOME;h.roster=s1Roster();h.id=id;h.gkey=genKey; emit(m.from,h); return; }   // the newcomer dance hands over THIS meeting's genesis key
      auto fwd=[&](int x)->bool{ if(x>=0&&x!=id&&x!=m.via){ Msg w;w.t=WHOHOME;w.from=m.from;w.via=id;w.ttl=m.ttl-1; emit(x,w); return true;} return false; };
      if(coord.i!=0){ if(fwd(occGet(ckey({coord.pc,coord.r,0})))) return; } else { if(fwd(ownerId())) return; }
      Coord x; if(crossLink(coord,x)&&fwd(occGet(ckey(x)))) return;
      Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ Coord cx; if(crossLink(rm[q],cx)&&fwd(occGet(ckey(cx)))) return; }
      return; }
    case HOME: {
      if(m.gkey) genKey=m.gkey;   // learn THIS meeting's genesis key from the greeter (the newcomer dance)
      if(state==1){ if(m.roster.empty()){ retryAt=(int)TICK-10; return; } roster=m.roster; haveRoster=true; lastReach=(int)TICK; seatTries=0; resumeTries=0; int t=pickRoster(); if(t>=0)askSeat(t); else retryAt=(int)TICK-10; }   // reached a greeter (HOME roster came back): note it for R6; a landed HOME re-arms the resume budget. genesis is ONLY via an empty greeter LIST.
      else if(state==3&&m.roster.size()){ roster=m.roster; haveRoster=true; }   // E3 stripped: store the roster (a draining DEEP seat re-seats against it via E1) but do NO Section-1 self-audit
      return; }
    case FIND: if(m.tag==1) serveCompact(m); else { findNc=m.nc; serveFind(m); findNc=-1; } return;
    case OFFER: serveOffer(m); return;   // V5: a head's free-slot invitation walking down (`offeron`)   // Q2: tag==1 is a compaction probe (up-chain walk), never newcomer admission. Untagged: the seeker is at the door for the whole scan (knock-is-evidence phantom scope — 03c)
    case FINDLEAF: findLeaf(m.hole,m.nbrs,m.ttl); return;
    case PLACE:
      if(state==2){ take(m.coord,m.owner,m.nbrs); return; }
      // Q2: a compaction PLACE for a seated leaf — atomically MOVE (law T dual-
      // hold) into the shallower cell, keeping the old seat warm until confirm.
      // Re-validate at the moment of action (the frontier may have shifted while
      // the PLACE routed): still a leaf, not already moving, and STRICTLY
      // shallower — else drop and let the next probe retry.
      if(state==3 && m.tag==1 && m.nc==id) COMPACT_PLACES++;
      if(state==3 && m.tag==1 && m.nc==id && hasCoord && !moving && !hasChildren()
         && pcDepth(m.coord.pc) < pcDepth(coord.pc) && !firstHandLive(ckey(m.coord))){
        bool trailing=true; for(int j=coord.i+1;j<C;j++) if(occGet(ckey({coord.pc,coord.r,(uint8_t)j}))>=0){ trailing=false; break; }   // re-validate clean departure (a row-mate may have arrived while the PLACE routed)
        if(trailing){ COMPACT_MOVES++; doMove(m.coord,m.owner,m.nbrs); } }   // a contested destination is caught by E2 → rollbackMove (law T: never homeless)
      return;
    // An answer (even a refusal) lifts the silent mark — for the chain-tail
    // that AUTHORED it (m.id) and for the target I ASKED (lastAsked): a FIND
    // that descends is answered by a descendant, and erasing only the author
    // left every successfully-FORWARDING admitter permanently marked. Under a
    // join storm the retries then scattered AWAY from the funnel admitters and
    // deep sections filled row 1 before row 0 (H7 dense-fill broken — hchain E
    // + c-sweep, 2026-07-29). A corpse still answers NOTHING, so its mark
    // stands — the corpse-avoid win is untouched. (A late NOROOM from a
    // superseded ask can lift the CURRENT target's mark early; that errs
    // toward the old behavior — one wasted re-pick — never toward a wedge.)
    // T7: an EXPLICIT NOROOM is the evidence that licenses spreading. It came
    // back over a path that demonstrably delivered, so the branch was reachable
    // and simply full. A partitioned FIND is swallowed in silence and lands on
    // the timeout path instead, never here — so a split can never set this.
    case NOROOM: if(state==2){ noroomSeen++; triedSilent.erase(m.id); if(lastAsked>=0) triedSilent.erase(lastAsked); retryAt=(int)TICK; if(haveRoster&&roster.size()&&++seatTries<=6){int t=pickRoster(); if(t>=0){askSeat(t);return;}} seatTries=0; join(); } return;
    case HELLO: {
      // A HELLO is FIRST-HAND: its sender (m.id) is speaking on a link it holds to
      // me, claiming coord m.ck. So it sets first-hand liveness for m.ck.
      if(hasCoord&&state==3&&m.ck==ckey(coord)&&m.id!=id&&m.id<id){ if(TICK-challAt>20){ challAt=(int)TICK; Msg c;c.t=CHALLENGE;c.ck=m.ck;c.from=id; emit(m.id,c);} return; }
      int prev=occGet(m.ck);
      // E2: yield only between FIRST-HAND-LIVE claimants. A prev that is only gossip
      // (a phantom) is NOT first-hand live ⇒ no yield ⇒ the real sender is accepted.
      // D5: an unanswered transport loss ends my first-hand hearing of prev.
      bool prevFresh = (prev>=0) && firstHandLive(m.ck) && !translost.count(m.ck);
      if(prev>=0&&prev!=m.id&&prevFresh){ Msg y;y.t=YIELD;y.ck=m.ck; emit(m.id>prev?m.id:prev,y); }   // two live seats at one coord: lower id wins, higher yields
      if(prev!=m.id){ setOcc(m.ck,m.id); if(hasCoord){ Msg h;h.t=HELLO;h.ck=ckey(coord);h.id=id; emit(m.id,h);} }
      liveMark(m.ck);   // first-hand: I just heard m.id directly at m.ck
      noteS1(m.ck);
      // A, ATTRIBUTABLE (V4): HELLO from THE SOFT-SIT JOINER ITSELF self-
      // confirms the seat — but a HELLO from any OTHER claimant (a dup-war
      // rival, a promoted healer announcing) must not wipe a vouch it does
      // not own: the wipe plus a LEAVE echo read the cell FREE and the same
      // head re-placed it every ~3 ticks (SIT+ joiner=120 killed same-tick
      // by why=hello at N=3000 det — the deep-firstFree feedstock).
      { auto sit=sitting.find(m.ck); if(sit!=sitting.end() && sit->second.joiner==m.id) clearSoft(m.ck,"hello"); }
      return; }
    case YIELD: if(hasCoord&&state==3&&ckey(coord)==m.ck){ if(moving) rollbackMove(); else requeue("T1-yield"); } return;   // T1: a mover contradicted at its NEW cell goes home, not homeless
    case CLAIM:
      // A: joiner self-confirm — upgrade sitting-down → seated.
      confirmSeated(m.ck, m.id);
      return;
    case LEAVE: {
      lastChurn=(int)TICK;   // Q2 hysteresis: a departure near me — hold off compaction until quiescent
      if(occGet(m.ck)==m.id){ occDrop(m.ck,"leave"); live.erase(m.ck); kidful.erase(m.ck); s1seen.erase(m.ck); tlForget(m.ck); healTry.erase(m.ck); }   // freed ⇒ admissible now
      // A, ATTRIBUTABLE (V4): only the LEAVER'S OWN vouch clears. A soft sit
      // exists only for a cell that read FREE at admit time, so a LEAVE naming
      // this cell from anyone else is a PRIOR tenant's departure echo (MOVED/
      // LEAVE double-report, cascade scoot) arriving after the cell was
      // re-vouched — clearing on it wiped the fresh vouch mid-flight and the
      // same admitter re-placed the cell 3 ticks later (the V4 same-admitter
      // double-place, 10 of 19 S1 seed pairs at N=3000 det).
      { auto sit=sitting.find(m.ck); if(sit!=sitting.end() && sit->second.joiner==m.id){ sitLog("SIT-",m.ck,m.id,"leave-own"); sitting.erase(sit); } }
      if(m.mvd){ setOcc(m.mvd,m.id); noteS1(m.mvd); }   // T3: the goodbye says WHERE it went — routing hint, first-hand
      // H-CHAIN vertical: when a DOWN-CHILD vacates, clear childOf on its
      // owner. childOf never expired before, so hasDownChild stayed true
      // forever and LEFT-PACK deferred to a dead vertical healer (the hole
      // then rode the slow E1 drain). Depth rule: vacated = confirmed gone.
      { Coord left=unck(m.ck); Coord par;
        if(left.i==0 && up(left,par)) childOf.erase(ckey(par));
      }
      // H-CHAIN LEFT-PACK (reactive): a row-mate to my LEFT just LEFT. I heal
      // it if I am the first OCCUPIED seat strictly right of the hole with
      // every intermediate column empty (confirmed vacated) — i.e. the
      // right-neighbour, or the next row-mate after a vacated chain of
      // right-neighbours (healing-laws H-CHAIN). I defer if the hole owns a
      // LIVE down-child (VERTICAL rule). The old "only col-1 heals the head"
      // is the chain length-1 case.
      if(HEALING&&hasCoord&&state==3){
        Coord c=unck(m.ck);
        // Defer to VERTICAL only when down-child OCC is present — stale childOf
        // on neighbours (who never saw the down-child LEAVE) must not block
        // LEFT-PACK forever (same lesson as column-clique).
        if(c.pc==coord.pc&&c.r==coord.r&&coord.i>c.i&&occGet(ckey(down(c)))<0){
          bool first=true;
          for(int j=c.i+1;j<coord.i;j++) if(occGet(ckey({c.pc,c.r,(uint8_t)j}))>=0){ first=false; break; }
          if(first){ heal(c); return; }
        }
        // H-CHAIN S1 COLUMN-clique (reactive): I share the hole's column on
        // the home rook and sit in a STRICTLY DEEPER row (coord.r > hole.r) so
        // the scooch is UP into denser H7 territory — never the reverse.
        // Act only when no FIRST-HAND-LIVE row-right designee exists and I am
        // the first occupied column-mate walking hole.r+1 .. (no wrap raid of
        // upper rows). Defer to VERTICAL only when down-child is OCCUPIED.
        if(coord.pc==0&&c.pc==0&&coord.i==c.i&&coord.r>c.r&&occGet(ckey(down(c)))<0){
          bool rowRightEmpty=true;
          for(int j=c.i+1;j<C;j++) if(firstHandLive(ckey({0,c.r,(uint8_t)j}))){ rowRightEmpty=false; break; }
          if(rowRightEmpty){
            bool first=true;
            for(int rr=c.r+1;rr<coord.r;rr++){
              if(occGet(ckey({0,(uint8_t)rr,c.i}))>=0){ first=false; break; }
            }
            if(first){ heal(c); return; }
          }
        }
      }
      return; }
    case GREETWALK: return;   // H6 RETIRED — folded into E3 (Section-1 seats knock directly as the greeter pool)
    case S1SYNC: {
      // § G root fold: merge the relayed section table, freshest AUTHOR stamp
      // wins. Purely additive display state — it touches nothing below.
      if(DIGEST && state==3 && hasCoord && coord.pc==0)
        for(auto&e:m.digs){ if((e.k>>16)!=0) continue; if(hasCoord && e.k==ckey(coord)) continue;   // never take a relayed claim about MY OWN section — I fold that first-hand
          if(TICK-e.d.at>DIG_TTL) continue; auto it=s1tab.find(e.k); if(it==s1tab.end()||it->second.at<e.d.at) s1tab[e.k]=e.d; }
      // GOSSIP updates the ROSTER HINT (occ/s1seen) only — it NEVER evicts a seat
      // and NEVER overwrites a cell I hold FIRST-HAND. (E2: gossip may inform
      // routing, but liveness is first-hand only. The old gossip-requeue and
      // gossip-YIELD were phantom weapons — a stale echo could evict a live seat.)
      for(auto&e:m.ent){ uint64_t ck=e.k; int eid=e.v; int age=e.age;
        if(e.ch>=0) childOf[ck]=e.ch;   // learn this Section-1 cell's heir (its down-child) — feeds cousins-in-PONG
        if(hasCoord&&ck==ckey(coord)&&eid!=id) continue;   // gossip claims MY seat: IGNORE. A genuine duplicate is settled by a first-hand witness (onPhone/HELLO), never by an echo.
        if(firstHandLive(ck)) continue;                    // I have first-hand truth here — gossip can't resurrect a moved/dead occupant over it
        if(translost.count(ck)) continue;                  // D5: my standing first-hand observation (transport died, probe unanswered) outranks an echo — gossip must not re-seat the corpse; any answer or a genuine refill clears it and gossip resumes
        int seen=(int)TICK-age-2; int cur=occGet(ck); int curSeen=s1seen.count(ck)?s1seen[ck]:-999;
        // CLAIM BIRTH (2026-08-02): the ±8 lower-id tie-break exists to resolve
        // SIMULTANEOUS claims, but the freshness stamps it compares are hop-
        // laundered — `max(curSeen, seen)` lets a displacing entry inherit the
        // displaced occupant's freshness, so a join-era ghost claim re-won
        // ties FOREVER (an immortal gossip echo that, when a sever opened a
        // first-hand gap at one arbiter, evicted a live seat — mesh-harness
        // D5-sever). Honest hop-ages broke legit races instead (a tie-win
        // stored stale went phantom and double-admitted: c-sweep dups). The
        // launder-proof signal is END-TO-END: every entry carries b — the
        // tick its (cell → claimant) pairing was first established, relayed
        // UNCHANGED — and a claim BORN more than S1B_HORIZON ago may never
        // win a tie. A ghost's birth is ancient by definition; every legit
        // contender's is recent.
        if(seen>curSeen+8 || (seen>=curSeen-8&&cur>=0&&eid<cur && (e.b<0 || TICK-e.b<=600))){ s1seen[ck]=max(curSeen,seen); if(cur!=eid){ setOcc(ck,eid); born[ck]=(e.b>=0?e.b:(int)TICK); } }
        else if(cur<0&&seen>-999){ s1seen[ck]=seen; setOcc(ck,eid); born[ck]=(e.b>=0?e.b:(int)TICK); }
      } return; }
    case DRAIN: {
      if(!hasCoord||state!=3||coord.pc==0||drainAt) return;
      roster=m.roster; haveRoster=true; Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++){int x=occGet(ckey(rc[c])); if(x>=0&&x!=id){ Msg d;d.t=DRAIN;d.roster=m.roster; emit(x,d);} } drainAt=(int)TICK+6+(int)(rng()*12); wake(id); return; }
    case CHALLENGE: if(evil){ Msg c;c.t=CONFIRM;c.ck=m.ck;c.id=id; emit(m.from,c); return;} if(hasCoord&&state==3&&ckey(coord)==m.ck){ Msg c;c.t=CONFIRM;c.ck=m.ck;c.id=id; emit(m.from,c);} return;
    case CONFIRM: if(hasCoord&&state==3&&ckey(coord)==m.ck&&m.id!=id&&m.id<id){ if(moving) rollbackMove(); else requeue("CONFIRM-lower-id"); } return;
    case MOVED: {   // T3: the cell I phoned was vacated by a MOVE — first-hand vacancy + redirect, right now
      if(occGet(m.ck)==m.id){ occDrop(m.ck,"moved"); live.erase(m.ck); kidful.erase(m.ck); s1seen.erase(m.ck); healTry.erase(m.ck); }   // freed ⇒ admissible now
      if(m.mvd){ setOcc(m.mvd,m.id); liveMark(m.mvd); noteS1(m.mvd); }
      wake(id); return; }
    case SITXFER: {
      // V4: my assigner hands me my row's outstanding vouch ledger — I am now
      // the row's admitter, and these cells are already promised.
      if(hasCoord&&coord.pc==0&&coord.i==0&&ckey(coord)==m.ck){
        for(auto&kv:m.nbrs) if(!occ.count(kv.k) && !sitting.count(kv.k)) sitting[kv.k]={kv.v,id,(int)TICK,-1};
        for(auto&e:m.row) if(!occ.count(e.k)){ setOcc(e.k,e.v); noteS1(e.k); }   // the assigner's CONFIRMED row occ — first-hand at the assigner, ledger-grade here
        rowLedger=true;
      }
      return; }
    case SITPING: {
      // V4: my assigner asks whether its vouch for me at m.ck is still live.
      // Answer ONLY about the vouched cell: seated there (tag=1, a re-CLAIM),
      // or still seeking with the PLACE possibly in flight (tag=0, hold the
      // chair). Seated ELSEWHERE = stay silent — the vouch should free.
      if(m.id==id){
        if(hasCoord&&state==3&&ckey(coord)==m.ck){ Msg p;p.t=SITPONG;p.ck=m.ck;p.id=id;p.tag=1; emit(m.from,p); }
        else if(!hasCoord&&state==2){ Msg p;p.t=SITPONG;p.ck=m.ck;p.id=id;p.tag=0; emit(m.from,p); }
      }
      return; }
    case SITPONG: {
      auto sit=sitting.find(m.ck);
      if(sit!=sitting.end() && sit->second.joiner==m.id){
        if(m.tag==1){ confirmSeated(m.ck,m.id); }               // the lost CLAIM, replayed first-hand
        else { sit->second.at=(int)TICK; sit->second.pingAt=-1; } // alive and still seeking: restart the clock
      }
      return; }
    case PHONE: onPhone(m); return;
    case PONG: { lastAck=(int)TICK; if(hasCoord&&m.coord.pc==0&&m.from>=0){ setOcc(ckey(m.coord),m.from); liveMark(ckey(m.coord)); noteS1(ckey(m.coord)); }   // FIRST-HAND: the responder spoke to me directly on our rook link
      if(m.owner>=0&&occGet(m.oCk)!=m.owner){ setOcc(m.oCk,m.owner); noteS1(m.oCk);} for(auto&e:m.row){ if(occGet(e.k)!=e.v) setOcc(e.k,e.v); noteS1(e.k); if(e.age>=0) childOf[e.k]=e.age; } for(auto&kv:m.nbrs) cousins[kv.k]=kv.v;
      // ---- § G DOWN-LEG + the AUTHOR'S REFUTATION ----------------------------
      if(DIGEST && state==3 && hasCoord && coord.pc!=0){
        if(m.dgRoot.at>=0 && m.dgRoot.at>rootDig.at) rootDig=m.dgRoot;   // the room fold, one level per period (staleness O(depth x period))
        if(m.dgPub.at>=0){
          Coord oc; bool isOwner = coord.i==0 && ownerCoord(oc) && ckey(m.coord)==ckey(oc);
          bool isHead  = coord.i>0 && m.coord.pc==coord.pc && m.coord.r==coord.r && m.coord.i==0;
          // G4: I check ONE thing — that the fold my aggregator published still
          // contains the contribution I authored. An owner's subtree is exactly
          // 1 + the row digest I (its down-child) sent it; a head's row fold must
          // contain my subtree digest. A SHORTFALL below my recent minimum is
          // suppression; anything else is staleness or growth, never evidence.
          // G5: the remedy is to raise it and blur. It evicts NOTHING — an
          // eviction lever here would hand an attacker exactly what G1 denies.
          // G4 grace on a CHANGED AGGREGATOR. A healer that has just promoted
          // into my owner's or my head's cell has folded nothing from me yet
          // and legitimately echoes nothing; my own upSince is old, so without
          // this the omission arm accuses every fresh aggregator (115 false
          // fires at N=600). The relationship, not my history, is what has to
          // be 2*DIG_TTL old.
          if((isOwner||isHead) && m.from!=lastAgg){ lastAgg=m.from; upSince=TICK; emptyEcho=0; }
          else if((isOwner && upRefuted(m.dgPub,m.dgEcho,1)) || (isHead && upRefuted(m.dgPub,m.dgEcho,0))){
            digMismatch++; if(!PAR) DIG_MISMATCH++;
            if(getenv("MESH_DIGLOG")){ int mn=-1,mr=-1; for(int q=0;q<16;q++) if(upLog[q].at==m.dgEcho.at){ mn=upLog[q].n; mr=upLog[q].refuse; break; }
              fprintf(stderr,"DIGMISMATCH arm=%d t=%lld me=%d(%u/%d.%d) aggregator=%d(%u/%d.%d) pub{n=%d refuse=%d} echo{at=%d n=%d refuse=%d} isent{n=%d refuse=%d}\n",
                digArm,(long long)TICK,id,(unsigned)coord.pc,(int)coord.r,(int)coord.i,m.from,(unsigned)m.coord.pc,(int)m.coord.r,(int)m.coord.i,
                m.dgPub.n,m.dgPub.refuse,m.dgEcho.at,m.dgEcho.n,m.dgEcho.refuse,mn,mr); }
          }
        }
      }
      return; }   // W: learn the heirs at my future owned-links (cousins) for relay-free promote-up
    case ROUTE: {
      if(!hasCoord) return;
      if(ckey(coord)==ckey(m.target)){
        if(m.tag==3){ probeAck[m.ck]=(int)TICK; return; }   // a D5 probe ANSWER routed back around the dead link — the probed peer LIVES
        if(m.tag==2){
          // D5 translost probe reached me: I am alive — answer AROUND the dead
          // link (first hop excludes the asker; my direct link to it is
          // presumably the one that died), so the answer survives a one-sided
          // severance. The plain ROUTED below still covers the healthy path.
          int nh2=probeHop(m.coord,m.asker);
          if(nh2>=0){ Msg a;a.t=ROUTE;a.target=m.coord;a.asker=id;a.tag=3;a.ttl=60;a.via=id;a.ck=ckey(coord); emit(nh2,a); }
        }
        Msg r;r.t=ROUTED;r.tag=m.tag;r.target=m.target;r.id=id; emit(m.asker,r); return; }
      if(m.ttl<=0){ Msg r;r.t=ROUTED;r.tag=m.tag;r.target=m.target;r.id=-1; emit(m.asker,r); return; }
      // FORWARD WITH THE PROBE PAYLOAD (2026-08-02): the re-minted hop used to
      // drop `ck` (the tag-3 answer's ack coord) and `coord` (the tag-2
      // probe's return address), so any D5 answer that actually ROUTED AROUND
      // the dead link arrived empty — probeAck stamped key 0, the observation
      // never cleared, and a LIVE severed peer was early-confirmed dead. The
      // answer-around machinery had never worked past one hop.
      int nh=nextHopToward(m.target,m.via); if(nh>=0){ Msg r;r.t=ROUTE;r.target=m.target;r.asker=m.asker;r.tag=m.tag;r.ttl=m.ttl-1;r.via=id;r.ck=m.ck;r.coord=m.coord; emit(nh,r); return; }
      Msg r;r.t=ROUTED;r.tag=m.tag;r.target=m.target;r.id=-1; emit(m.asker,r); return; }
    case ROUTED: if(m.tag==1||m.tag==2){ if(m.id>=0&&hasCoord){ setOcc(ckey(m.target),m.id); noteS1(ckey(m.target)); probeAck[ckey(m.target)]=(int)TICK; Msg h;h.t=HELLO;h.ck=ckey(coord);h.id=id; emit(m.id,h);} } return;   // probeAck AFTER setOcc (a changed occupant clears the observation first)
    case TRANSLOST: transportLost(m.id); return;   // D5: fabric event — MY OWN transport to m.id died
    default: return;
  }
}
void Seat::leave(){ alive[id]=0; active.erase(id); moving=false; leaseCk=0; leaseUntil=-1; if(!hasCoord) return; uint64_t ck=ckey(coord); Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ck;m.id=id; emit(x,m);}} Coord o; if(ownerCoord(o)){int oid=occGet(ckey(o)); if(oid>=0&&!seen.count(oid)){ Msg m;m.t=LEAVE;m.ck=ck;m.id=id; emit(oid,m);}} }
void Seat::tick(){
  if(!alive[id]){ return; }
  if(state!=3){ if(stranded){ if(TICK-strandedAt>STRAND_TTL){ stranded=false; lastReach=-1; joinStart=-1; join(); } wake(id); return; }   // R6: stranded shows "network settings won't let you connect", but the client RETRIES after a backoff — if a greeter is now reachable (e.g. my side's pool stabilised after a partition) I re-seat; a genuinely cut-off seat just strands again.
    if(reAsk||reJoin){ bool a=reAsk; reAsk=false; reJoin=false;   // ENTRY PACING: fire the ask/knock deferred from a same-tick repeat
      if(a&&haveRoster&&roster.size()){ int t=pickRoster(); if(t>=0){ askSeat(t); wake(id); return; } }
      join(); wake(id); return; }
    if((state==0||state==1)&&TICK-retryAt>20){ if(!resumeAsk()) join(); } else if(state==2){ int rc=0; for(auto&e:roster) if(e.v!=id) rc++; if(TICK-retryAt>((seatTries==0&&rc==1)?12:60)){ if(haveRoster&&roster.size()&&++seatTries<=6){int t=pickRoster(); if(t>=0)askSeat(t); else if(!resumeAsk()) join(); } else { seatTries=0; if(!resumeAsk()) join(); } } } wake(id); return; }   // ENTRY RESUME: re-enter at WHOHOME while the greeter list is registry-fresh; full knock only when it isn't
  if(evil) attack();
  // T: transit bookkeeping — a claim window that closes with NO contradiction
  // CONFIRMS (a wiped region has nobody to answer; a contradiction would have
  // rolled back already); the tombstone self-expires (T3).
  if(moving && TICK-moveAt>CONFIRM_TTL) confirmMove();
  if(leaseUntil>=0 && TICK>leaseUntil){ leaseCk=0; leaseUntil=-1; }
  recheckSitting();   // A: assigner frees soft sitting-down if PLACE never confirmed
  if(coord.pc==0){
    if(anyRookLive()) rookSeenAt=(int)TICK;   // fragment detector: reset while I hear anyone
    if(TICK-lastPhone>=8){ lastPhone=(int)TICK; rollup(); s1Heartbeat(); s1Sync(); }   // § G: ONE fold per node per period, O(C) work, before the beat carries it. D1 over the rook: phone every live row+column neighbour (maintains first-hand liveness across all redundant paths)
    tlSweep();   // D5: a confirmed corpse leaves my view early (cleanup, not healing)
    if(coord.i==0 && ((TICK%12)==0 || !translost.empty())){ rowSweep(); s1Fill(); }   // 11a: every Section-1 cell {0,r,i} is refilled by its down-child {i+1,r,0} (VERTICAL Rule V); s1Fill is the LAST-RESORT backstop only for a cell whose own subtree is gone (hasDownChild==false), so the two never race. D5: while a transport-loss observation is pending, check every beat — heal()'s cooldowns keep it storm-free
    // H2 LEFT-PACK backstop (probe-gated): when my row has NO live head, the head
    // can't run its row backstop, so the row rebuilds itself leftward — I heal my
    // immediate LEFT neighbour (the head if I am column 1). This cascades toward the
    // head: (0,r,3)->heals(0,r,2)->heals(0,r,1)->heals(0,r,0), each only once its
    // left is confirmed dead. Restricted to headless rows so it never races the
    // head's s1Fill. This is what rebuilds an all-heads-dead column-0.
    if(coord.i>=1 && TICK-healAt>20 && (!firstHandLive(ckey({0,coord.r,0})) || translost.count(ckey({0,coord.r,0})))){ Coord lft={0,coord.r,(uint8_t)(coord.i-1)}; uint64_t lk=ckey(lft);   // head NOT first-hand alive (phantom-proof) ⇒ headless row ⇒ rebuild leftward. D5: a pending transport-loss for the head counts as "no live head" (my own link to it died; firstHandLive may linger up to 60 ticks)
      bool defer = translost.count(lk) && occGet(ckey(down(lft)))>=0;   // D5: defer to VERTICAL only when down-child OCC present (not stale childOf)
      if(!defer && ringConfirmDead(lft)){ if(occ.count(lk)){occDrop(lk,"ring-dead-left");live.erase(lk);s1seen.erase(lk);kidful.erase(lk);} holeSince.erase(lk); heal(lft); } }
    if(TICK>=xlinkAt){ xlinkAt=(int)TICK+150+(int)(rng()*100); Coord cm[C-1]; colMates(coord,cm); for(int q=0;q<C-1;q++) if(occGet(ckey(cm[q]))<0) routeTo(cm[q],1); }   // W7: keep column links live — re-ping any vacant column-mate (standby path, cross-links heal fast)
    if(s1CheckAt<0) s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD);
    if(TICK>=s1CheckAt){ s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD); emitRelay(genKey); }   // E3 (folds H6): re-knock each ~E3_PERIOD to refresh my greeter entry. Section-1 seats ARE the greeter pool.
    wake(id); return;
  }
  if(TICK-lastPhone>=8){ lastPhone=(int)TICK; rollup(); phoneHome(); }   // § G: ONE fold per node per period (<= C reports in, ONE out), then the beat carries it up
  tlSweep();   // D5: a confirmed corpse leaves my view early (cleanup, not healing)
  if(coord.i==0 && (TICK%12)==0) rowSweep();
  // 11a HORIZONTAL: only a CHILDLESS head needs a horizontal healer (its row
  // depends on it, nothing below to pull up); its fixed healer is {pc,r,1}. A
  // head WITH a subtree is healed by its down-child (VERTICAL, below). occGet<0
  // = definite LEAVE, so severance never false-heals. D5 early path: my own DC
  // to the head died and the confirm probe went unanswered — confirmed dead
  // now; the occGet<0 + lastAck>60 branch remains the horizon backstop.
  if(coord.i==1 && TICK-healAt>20){ Coord hd={coord.pc,coord.r,0}; uint64_t hdk=ckey(hd);
    bool hdEarly=translostConfirmed(hdk);
    if((hdEarly || (TICK-lastAck>60 && occGet(hdk)<0)) && !hasDownChild(hd)){
      if(hdEarly){ occDrop(hdk,"head-early"); live.erase(hdk); s1seen.erase(hdk); kidful.erase(hdk); }
      heal(hd); } }
  if(coord.i>0 && TICK>=xlinkAt){ xlinkAt=(int)TICK+150+(int)(rng()*100); Coord x; if(crossLink(coord,x)&&occGet(ckey(x))<0) routeTo(x,1); }
  if(drainAt && TICK>=drainAt){ reseatViaRoster(); return; }
  // 11a VERTICAL (down-child is the fixed healer of its owner; generalizes H8):
  // I am a head, so my owner cell O = up(me) is the cell whose down-child I am. If
  // O is DEAD (occGet<0 — a definite LEAVE cleared it, NOT mere severance), I HEAL
  // O by promoting a LEAF from my subtree up into it (I stay put — P: only leaves
  // move; I move only when I am childless), wired with my cousins (O's heir
  // neighbourhood, learned from O's PONG). This is the primary heal for every cell
  // that owns a subtree; the row-mate LEFT-PACK covers only childless holes.
  bool didHeal=false;
  if(coord.i==0 && TICK-healAt>20){ Coord oc;   // cousins may be EMPTY: a head whose owner never PONGed (ghost owner) has no heir neighbourhood — it still must heal; nbrs fall back to the hole's owned-link occupants below   // TICK-lastAck>confirm (horizon branch): POSITIVE DEATH CONFIRMATION — the owner is not just occ-cleared but has stopped PONGing me for a settled window, so I don't promote a leaf on a transient occ glitch (that manufactures split-brains during a mass-heal)
    // H1-S1 CONSERVATISM: promoting into a SECTION-1 owner (oc.pc==0) is the one
    // move that can mint a divergent home, so it waits the full ring-hold window —
    // far longer than a deep hole (60). Under the rook, an owner unreachable this
    // long really is gone; a merely-unreachable-but-alive owner recovers first.
    // D5 early path: I hold the down-link DC to my owner; it died and the confirm
    // probe went unanswered across the mesh — first-hand confirmed death
    // (equivalent to a LEAVE), no silence horizon to wait out. An owner whose
    // probe answers is never touched; the horizon branch remains the backstop.
    bool haveOc=ownerCoord(oc); uint64_t ok=haveOc?ckey(oc):0;
    long long confirm = (haveOc&&oc.pc==0) ? RING_HOLD : 60;
    bool ownEarly = haveOc && translostConfirmed(ok);
    if(haveOc && (ownEarly || (occGet(ok)<0 && TICK-lastAck>confirm)) && TICK-(healTry.count(ok)?healTry[ok]:-999)>45){
      if(ownEarly){ occDrop(ok,"owner-early"); live.erase(ok); s1seen.erase(ok); kidful.erase(ok); }
      healTry[ok]=(int)TICK; healAt=(int)TICK; didHeal=true;
      vector<KV> nb; for(auto&c:cousins) nb.push_back({c.first,c.second});
      if(nb.empty()){ Coord ol2[MAXLINKS]; int n2=ownedLinks(oc,ol2); for(int q2=0;q2<n2;q2++){ int x2=occGet(ckey(ol2[q2])); if(x2>=0&&x2!=id) nb.push_back({ckey(ol2[q2]),x2}); } }
      Coord rc[C]; rosterCells(rc); vector<int> ix=shufCols();
      bool sent=false; for(int q:ix){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id){ Msg m;m.t=FINDLEAF;m.hole=oc;m.nbrs=nb;m.ttl=40; emit(x,m); sent=true; break; } }
      if(!sent) promoteInto(oc,nb);   // I'm childless => I AM the leaf
    }
  }
  // 11a: draining is severance-immune, like healing. A seat drains (vacates its
  // healthy seat to re-enter) only when its ANCHOR is CONFIRMED dead (occGet<0 —
  // a LEAVE cleared it), not merely silent: a severed-but-alive anchor stays
  // occupied here, so a 40-200-tick severance window recovers WITHOUT the seat
  // churning out and back (the old lastAck>80 alone made every severance a drain →
  // reseat → LEAVE → heal cascade). The lastAck>220 E1 last-resort still catches a
  // genuinely orphaned seat whose anchor died without a deliverable LEAVE.
  bool ancDead=false; if(hasCoord){ Coord anc; if(coord.i!=0){ ancDead = occGet(ckey({coord.pc,coord.r,0}))<0; } else if(ownerCoord(anc)){ ancDead = occGet(ckey(anc))<0; } }
  if(!didHeal && TICK-lastAck>80 && (ancDead || TICK-lastAck>220)) drainOrReenter();
  else if(!didHeal){ tryCompact(); tryOffer(); }   // Q2: only when not draining/healing this tick — pack the tree upward when settled (V5: heads also offer known slots down)
  wake(id);
}
