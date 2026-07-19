static inline Coord unck(uint64_t k){ return {(uint32_t)(k>>16),(uint8_t)((k>>8)&0xff),(uint8_t)(k&0xff)}; }
static inline bool ownerCoordOf(Coord c, Coord& o){ if(c.pc==0) return false; return up({c.pc,c.r,0},o); }

void Seat::take(Coord c,int owner,vector<KV>&nbrs){
  if(c.i>=C||c.r>=C){ return; }   // sanity: never take a malformed coord
  coord=c; hasCoord=true; state=3; joinStart=-1; stranded=false; occ[ckey(c)]=id; noteS1(ckey(c));
  for(auto&kv:nbrs) if(!occ.count(kv.k)){ setOcc(kv.k,kv.v); noteS1(kv.k); }
  drainAt=0; seatTries=0; seatedAt=(int)TICK;
  lastAck=(int)TICK; lastPhone=(int)TICK;
  if(owner>=0){ Msg m; m.t=CLAIM; m.ck=ckey(c); m.id=id; emit(owner,m); }
  if(c.pc==0){ s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD); emitRelay(genKey); }   // E3: a Section-1 seat registers as a greeter on seating (present the MEETING genesis key)
  announce(); wake(id);
}
void Seat::announce(){ Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){ seen.insert(x); Msg m;m.t=HELLO;m.ck=ckey(coord);m.id=id; emit(x,m);} } }

void Seat::admit(Coord c,int nc){
  tlForget(ckey(c));   // the cell genuinely refills — any standing D5 observation of the old occupant ends here
  occ[ckey(c)]=nc; noteS1(ckey(c));
  vector<KV> nbrs; Coord ol[MAXLINKS]; int n=ownedLinks(c,ol);
  for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=nc) nbrs.push_back({ckey(ol[k]),x}); }
  bool selfNb=false; for(int k=0;k<n;k++) if(ckey(ol[k])==ckey(coord)) selfNb=true;
  if(selfNb) nbrs.push_back({ckey(coord),id});
  Msg m; m.t=PLACE; m.coord=c; m.owner=id; m.nbrs=nbrs; emit(nc,m);
}
void Seat::serveFind(Msg& mm){
  if(!hasCoord||mm.ttl<=0){ Msg m;m.t=NOROOM; emit(mm.nc,m); return; }
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
    for(int t=0;t<C;t++){
      bool liveRow=false, everSeen=false;
      for(int j=0;j<C;j++){ uint64_t k=ckey({0,(uint8_t)t,(uint8_t)j}); if(s1Fresh(k)) liveRow=true; if(s1seen.count(k)) everSeen=true; }
      if(!liveRow && everSeen){
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
          if(TICK-(healTry.count(k)?healTry[k]:-999)>45){ healTry[k]=(int)TICK; admit({0,(uint8_t)t,coord.i},mm.nc); return; }
          continue; }
        int aid=occGet(ckey({0,(uint8_t)((t+1)%C),coord.i}));
        if(aid<0||aid==id) aid=occGet(ckey({0,(uint8_t)((t+1)%C),0}));   // my column-mate there is a hole — hand to that row's head instead
        if(aid>=0&&aid!=id){ Msg m;m.t=FIND;m.nc=mm.nc;m.ttl=mm.ttl-1; emit(aid,m); return; }
        continue;                                      // that row is dead too — resolve bottom-up
      }
      for(int j=0;j<C;j++){
        Coord cell={0,(uint8_t)t,(uint8_t)j}; uint64_t k=ckey(cell);
        if(occ.count(k)) continue;                     // taken (or a stale phantom — the heal machinery clears those)
        // Frontier test by DIRECT knowledge only (the old 11a admit-liveness:
        // occGet(down)<0) — NOT hasDownChild, whose childOf arm never expires:
        // a stale heir entry would permanently steer arrivals away from a
        // clear cell, leaving it to the much slower leaf-promotion backstop.
        if(occGet(ckey(down(cell)))>=0) continue;      // internal hole — its down-child heals it (C1 frontier rule)
        Coord adm = (j>0)? Coord{0,(uint8_t)t,0} : Coord{0,(uint8_t)((t-1+C)%C),0};
        if(coord.i==0 && coord.r==adm.r){              // I am the designated admitter
          if(TICK-(healTry.count(k)?healTry[k]:-999)>45){ healTry[k]=(int)TICK; admit(cell,mm.nc); return; }
          continue;                                    // admit gate cooling — consider the next cell
        }
        int aid=occGet(ckey(adm));
        if(aid>=0&&aid!=id){ Msg m;m.t=FIND;m.nc=mm.nc;m.ttl=mm.ttl-1; emit(aid,m); return; }
        // admitter unknown/dead: its own cell sits earlier in the scan (or is
        // being healed) — keep scanning so growth never deadlocks on one head
      }
    }
    // no admissible S1 cell (home full, or every hole is a healer's) ⇒ deep
  }
  Coord f; if(firstFreeInRoster(f)){ admit(f,mm.nc); return; }
  Coord rc[C]; rosterCells(rc); vector<int> idx={0,1,2,3,4}; for(int k=(int)idx.size()-1;k>0;k--){int j=(int)(rng()*(k+1));swap(idx[k],idx[j]);}
  for(int q:idx){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id){ Msg m;m.t=FIND;m.nc=mm.nc;m.ttl=mm.ttl-1; emit(x,m); return; } }
  Msg m;m.t=NOROOM; emit(mm.nc,m);
}

void Seat::heal(Coord hole){
  if(!hasCoord||state!=3||TICK-healAt<12) return;
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
  vector<int> src;
  { Coord rc[C]; rosterCells(rc); for(int q=0;q<C;q++){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id) src.push_back(x); } }
  if(hole.pc==coord.pc && hole.r==coord.r){ Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ if(ckey(rm[q])==ckey(hole)) continue; if(!(kidful.count(ckey(rm[q]))&&kidful[ckey(rm[q])])) continue; int x=occGet(ckey(rm[q])); if(x>=0&&x!=id) src.push_back(x); } }
  if(hole.pc==0 && coord.pc==0){ auto r=s1Roster(); for(auto&e:r) if(e.v!=id && e.k!=ckey(hole)) src.push_back(e.v); }
  if(!src.empty()){ int who=src[(int)(rng()*src.size())]; Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=40; emit(who,m); return; }
  if(!hasChildren() && hole.pc==coord.pc && hole.r==coord.r && hole.i==coord.i-1) promoteInto(hole,nbrs);   // 11a: childless right-neighbour SCOOCHES left into its left-neighbour hole (head when coord.i==1) — left-pack base case (only a leaf moves)
}
void Seat::findLeaf(Coord hole, vector<KV>& nbrs, int ttl){
  if(!hasCoord) return;
  if(ttl>0){ Coord rc[C]; rosterCells(rc); vector<int> idx={0,1,2,3,4}; for(int k=4;k>0;k--){int j=(int)(rng()*(k+1));swap(idx[k],idx[j]);}
    for(int q:idx){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id){ Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=ttl-1; emit(x,m); return; } } }
  if(coord.pc==hole.pc && coord.r==hole.r && hole.i!=0) return;
  promoteInto(hole,nbrs);
}
void Seat::promoteInto(Coord hole, vector<KV>& nbrs){
  if(!hasCoord||ckey(coord)==ckey(hole)) return;
  if(coord.pc==0 && hole.pc!=0) return;
  if(coord.pc==0 && hole.pc==0 && !(hole.r==coord.r && hole.i<coord.i)) return;   // 11a: a Section-1 seat may scooch LEFT within its row (left-pack), not just into the head
  bumpMoves();
  Coord oldC=coord; Coord ol[MAXLINKS]; int n=ownedLinks(oldC,ol); unordered_set<int> seen;
  for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){ seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(oldC);m.id=id; emit(x,m);} }
  occ.clear(); s1seen.clear(); cousins.clear(); tlClear();   // moving levels: old cousins are stale; rebuild fresh at the new position
  take(hole,-1,nbrs);
  lastAck=(int)TICK; lastPhone=(int)TICK-100;
}
void Seat::attack(){ if(!hasCoord) return; Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id){ Msg m;m.t=HELLO;m.ck=ckey(ol[k]);m.id=id; emit(x,m);} } }
void Seat::requeue(){ if(!evil) bumpEvict(); bumpMoves(); if(hasCoord){ Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(coord);m.id=id; emit(x,m);}} }
  hasCoord=false; occ.clear(); s1seen.clear(); tlClear(); drainAt=0; join(); }

void Seat::drainOrReenter(){
  // E1 LAST RESORT, checked FIRST: owner-chain dead >220 ticks with no mesh
  // route to Section 1 → re-enter the front door. This was previously below the
  // drain branch and thus UNREACHABLE for a seat holding a STALE roster (branch
  // 1 returned every tick), stranding it forever phoning a ghost owner. Drop the
  // dead roster and requeue → join() re-knocks the relay for fresh greeters.
  if(TICK-lastAck>220){ haveRoster=false; roster.clear(); drainAt=0; requeue(); return; }
  if(haveRoster && !roster.empty()){ if(!drainAt){ Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++){int x=occGet(ckey(rc[c])); if(x>=0&&x!=id){ Msg m;m.t=DRAIN;m.roster=roster; emit(x,m);} } drainAt=(int)TICK+25+(int)(rng()*10);} return; }
  if(TICK-rosterAskAt>40){ rosterAskAt=(int)TICK; Coord x; int xid=-1; if(crossLink(coord,x)) xid=occGet(ckey(x)); if(xid>=0&&xid!=id){ Msg m;m.t=WHOHOME;m.from=id;m.via=id;m.ttl=60; emit(xid,m);} else { Coord rm[C-1]; rowMates(coord,rm); vector<int> ri={0,1,2,3}; for(int k=3;k>0;k--){int j=(int)(rng()*(k+1));swap(ri[k],ri[j]);} for(int q:ri){int rr=occGet(ckey(rm[q])); if(rr>=0&&rr!=id){ Msg m;m.t=WHOHOME;m.from=id;m.via=id;m.ttl=60; emit(rr,m); break;}} } }
}
void Seat::reseatViaRoster(){ bumpMoves(); if(hasCoord){ Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(coord);m.id=id; emit(x,m);}} }
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
  if(hasCoord && ckey(coord)==ckey(m.rdst)){
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
  if(!hasCoord || m.tock!=ckey(coord)) return;   // tock is always set for a PHONE; ckey(0,0,0)==0 is a REAL coord, so never skip the check
  uint64_t ck=ckey(m.coord); int prev=occGet(ck);
  // D5: my first-hand hearing of prev ENDS at my own transport loss (an
  // unanswered translost) — a corpse whose last PHONE is still inside the
  // 40-tick window must not out-tenure the legitimate healer's fill. An
  // answered probe erases the observation, restoring full tenure protection
  // (S5: "has itself, first-hand, stopped hearing the prior occupant").
  if(prev>=0&&prev!=m.id&&m.id>prev && live.count(ck) && TICK-live[ck]<=40 && !translost.count(ck)){ Msg y;y.t=YIELD;y.ck=ck; emit(m.id,y); return; }
  setOcc(ck,m.id); live[ck]=(int)TICK; noteS1(ck); kidful[ck]=m.kids?1:0; if(m.child>=0) childOf[ck]=m.child; else childOf.erase(ck);
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
  Msg p;p.t=PONG;p.owner=owner;p.oCk=oCk;p.row=row;p.nbrs=cous;p.coord=coord; emit(m.id,p);   // p.coord: my coord, so the phoner gains FIRST-HAND liveness for me (bidirectional heartbeat)
  if(prev>=0&&prev!=m.id){ Msg y;y.t=YIELD;y.ck=ck; emit(prev,y); }
}
void Seat::phoneHome(){
  Coord tc; bool have=false; if(hasCoord){ if(coord.i!=0){ tc={coord.pc,coord.r,0}; have=true; } else have=ownerCoord(tc); }
  if(!have) return; int tid=occGet(ckey(tc)); if(tid<0) return;
Msg m;m.t=PHONE;m.coord=coord;m.tock=ckey(tc);m.id=id;m.kids=hasChildren();m.child=occGet(ckey(down(coord))); emit(tid,m);
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
    Msg m;m.t=PHONE;m.coord=coord;m.tock=ckey(t);m.id=id;m.kids=hasChildren();m.child=occGet(ckey(down(coord))); emit(tid,m); }
}
void Seat::s1Sync(){
  vector<Ent> ent; ent.push_back({ckey(coord),id,0, occGet(ckey(down(coord)))});   // carry MY heir (my down-child)
  for(auto&e:occ){ if((e.first>>16)==0 && e.second!=id){ auto it=s1seen.find(e.first); if(it!=s1seen.end()&&TICK-it->second<120) ent.push_back({e.first,e.second,(int)(TICK-it->second), childOf.count(e.first)?childOf[e.first]:-1}); } }
  // W7: sync S1SYNC over the whole rook neighbourhood — every live row-mate AND
  // column-mate (heads included). This is the S1SYNC that keeps the full C^2 home
  // roster consistent across the richly-meshed section.
  unordered_set<int> tg; Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){int t=occGet(ckey(rm[q])); if(t>=0&&t!=id)tg.insert(t);}
  Coord cm[C-1]; colMates(coord,cm); for(int q=0;q<C-1;q++){int t=occGet(ckey(cm[q])); if(t>=0&&t!=id)tg.insert(t);}
  for(int t:tg){ Msg m;m.t=S1SYNC;m.ent=ent; emit(t,m); }
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
  for(auto k:del){ live.erase(k); occ.erase(k); kidful.erase(k); s1seen.erase(k); tlForget(k); }
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
    if(occ.count(k)){ occ.erase(k); live.erase(k); kidful.erase(k); s1seen.erase(k); } }
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
    if(ringConfirmDead(c)){ if(occ.count(ck)){occ.erase(ck);live.erase(ck);s1seen.erase(ck);kidful.erase(ck);} holeSince.erase(ck); heal(c); return; }
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

void Seat::recv(Msg& m){
  if(!alive[id]) return;
  if(m.routing && !routeStep(m)) return;   // Option A: in-transit routing frame — forward it (or drop); only fall through when it is FOR me
  switch(m.t){
    case GREETERS: {
      if(m.list.empty()){ if(state==0){ genKey=myKey; vector<KV> e; take({0,0,0},-1,e);} return; }   // R3: empty list => I minted the genesis key & found the home (also R6 TAKE-OVER: a stranded newcomer whose room finally emptied)
      if((state==0||state==1) && joinStart>=0 && TICK-joinStart>STRAND_TTL && (lastReach<0 || TICK-lastReach>STRAND_TTL)){ stranded=true; strandedAt=(int)TICK; return; }   // R6: greeters exist (meeting alive) but I've REACHED none (no HOME roster came back) for a full TTL => voted off / unreachable subnet. A seat that keeps reaching greeters (lastReach fresh) but only gets NOROOM is competing for a slot in a busy heal — NOT stranded — so it keeps retrying.
      lastGreeters=m.list;
      if(state==0){ int g=m.list[(int)(rng()*m.list.size())]; gateway=g; Msg w;w.t=WHOHOME;w.from=id;w.ttl=60; emit(g,w); state=1; retryAt=(int)TICK; }   // pick a RANDOM greeter (spreads intro load); it is my ENTRY GATEWAY — replies route back through it while I'm unseated
      // E3 (stripped): a seated Section-1 seat knocks ONLY to keep an honest
      // greeter in the pool (anti-poison floor); it IGNORES the greeters it gets
      // back. The roster self-audit is gone — genesis/fork convergence is E4/R5.
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
      if(state==1){ if(m.roster.empty()){ retryAt=(int)TICK-10; return; } roster=m.roster; haveRoster=true; lastReach=(int)TICK; seatTries=0; int t=pickRoster(); if(t>=0)askSeat(t); else retryAt=(int)TICK-10; }   // reached a greeter (HOME roster came back): note it for R6. genesis is ONLY via an empty greeter LIST.
      else if(state==3&&m.roster.size()){ roster=m.roster; haveRoster=true; }   // E3 stripped: store the roster (a draining DEEP seat re-seats against it via E1) but do NO Section-1 self-audit
      return; }
    case FIND: serveFind(m); return;
    case FINDLEAF: findLeaf(m.hole,m.nbrs,m.ttl); return;
    case PLACE: if(state==2) take(m.coord,m.owner,m.nbrs); return;
    case NOROOM: if(state==2){ retryAt=(int)TICK; if(haveRoster&&roster.size()&&++seatTries<=6){int t=pickRoster(); if(t>=0){askSeat(t);return;}} seatTries=0; join(); } return;
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
      live[m.ck]=(int)TICK;   // first-hand: I just heard m.id directly at m.ck
      noteS1(m.ck); return; }
    case YIELD: if(hasCoord&&state==3&&ckey(coord)==m.ck) requeue(); return;
    case CLAIM: if(occGet(m.ck)!=m.id){ setOcc(m.ck,m.id); live[m.ck]=(int)TICK; } noteS1(m.ck); return;
    case LEAVE: {
      if(occGet(m.ck)==m.id){ occ.erase(m.ck); live.erase(m.ck); kidful.erase(m.ck); s1seen.erase(m.ck); tlForget(m.ck); }
      // 11a LEFT-PACK (reactive): a row-mate to my immediate LEFT just LEFT; I am
      // its fixed right-neighbour healer. I heal it UNLESS it owns a down-child
      // (then the VERTICAL rule — that down-child — heals it, so I defer).
      if(HEALING&&hasCoord&&state==3){ Coord c=unck(m.ck); if(c.pc==coord.pc&&c.r==coord.r&&c.i==0&&coord.i==1&&!hasDownChild(c)){ heal(c); return; } }
      return; }
    case GREETWALK: return;   // H6 RETIRED — folded into E3 (Section-1 seats knock directly as the greeter pool)
    case S1SYNC: {
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
        if(seen>curSeen+8 || (seen>=curSeen-8&&cur>=0&&eid<cur)){ s1seen[ck]=max(curSeen,seen); if(cur!=eid)setOcc(ck,eid); }
        else if(cur<0&&seen>-999){ s1seen[ck]=seen; setOcc(ck,eid); }
      } return; }
    case DRAIN: {
      if(!hasCoord||state!=3||coord.pc==0||drainAt) return;
      roster=m.roster; haveRoster=true; Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++){int x=occGet(ckey(rc[c])); if(x>=0&&x!=id){ Msg d;d.t=DRAIN;d.roster=m.roster; emit(x,d);} } drainAt=(int)TICK+6+(int)(rng()*12); wake(id); return; }
    case CHALLENGE: if(evil){ Msg c;c.t=CONFIRM;c.ck=m.ck;c.id=id; emit(m.from,c); return;} if(hasCoord&&state==3&&ckey(coord)==m.ck){ Msg c;c.t=CONFIRM;c.ck=m.ck;c.id=id; emit(m.from,c);} return;
    case CONFIRM: if(hasCoord&&state==3&&ckey(coord)==m.ck&&m.id!=id&&m.id<id) requeue(); return;
    case PHONE: onPhone(m); return;
    case PONG: { lastAck=(int)TICK; if(hasCoord&&m.coord.pc==0&&m.from>=0){ setOcc(ckey(m.coord),m.from); live[ckey(m.coord)]=(int)TICK; noteS1(ckey(m.coord)); }   // FIRST-HAND: the responder spoke to me directly on our rook link
      if(m.owner>=0&&occGet(m.oCk)!=m.owner){ setOcc(m.oCk,m.owner); noteS1(m.oCk);} for(auto&e:m.row){ if(occGet(e.k)!=e.v) setOcc(e.k,e.v); noteS1(e.k); if(e.age>=0) childOf[e.k]=e.age; } for(auto&kv:m.nbrs) cousins[kv.k]=kv.v; return; }   // W: learn the heirs at my future owned-links (cousins) for relay-free promote-up
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
      int nh=nextHopToward(m.target,m.via); if(nh>=0){ Msg r;r.t=ROUTE;r.target=m.target;r.asker=m.asker;r.tag=m.tag;r.ttl=m.ttl-1;r.via=id; emit(nh,r); return; }
      Msg r;r.t=ROUTED;r.tag=m.tag;r.target=m.target;r.id=-1; emit(m.asker,r); return; }
    case ROUTED: if(m.tag==1||m.tag==2){ if(m.id>=0&&hasCoord){ setOcc(ckey(m.target),m.id); noteS1(ckey(m.target)); probeAck[ckey(m.target)]=(int)TICK; Msg h;h.t=HELLO;h.ck=ckey(coord);h.id=id; emit(m.id,h);} } return;   // probeAck AFTER setOcc (a changed occupant clears the observation first)
    case TRANSLOST: transportLost(m.id); return;   // D5: fabric event — MY OWN transport to m.id died
    default: return;
  }
}
void Seat::leave(){ alive[id]=0; active.erase(id); if(!hasCoord) return; uint64_t ck=ckey(coord); Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ck;m.id=id; emit(x,m);}} Coord o; if(ownerCoord(o)){int oid=occGet(ckey(o)); if(oid>=0&&!seen.count(oid)){ Msg m;m.t=LEAVE;m.ck=ck;m.id=id; emit(oid,m);}} }
void Seat::tick(){
  if(!alive[id]){ return; }
  if(state!=3){ if(stranded){ if(TICK-strandedAt>STRAND_TTL){ stranded=false; lastReach=-1; joinStart=-1; join(); } wake(id); return; }   // R6: stranded shows "network settings won't let you connect", but the client RETRIES after a backoff — if a greeter is now reachable (e.g. my side's pool stabilised after a partition) I re-seat; a genuinely cut-off seat just strands again.
    if((state==0||state==1)&&TICK-retryAt>20) join(); else if(state==2&&TICK-retryAt>60){ if(haveRoster&&roster.size()&&++seatTries<=6){int t=pickRoster(); if(t>=0)askSeat(t); else join(); } else { seatTries=0; join(); } } wake(id); return; }
  if(evil) attack();
  if(coord.pc==0){
    if(TICK-lastPhone>=8){ lastPhone=(int)TICK; s1Heartbeat(); s1Sync(); }   // D1 over the rook: phone every live row+column neighbour (maintains first-hand liveness across all redundant paths)
    tlSweep();   // D5: a confirmed corpse leaves my view early (cleanup, not healing)
    if(coord.i==0 && ((TICK%12)==0 || !translost.empty())){ rowSweep(); s1Fill(); }   // 11a: every Section-1 cell {0,r,i} is refilled by its down-child {i+1,r,0} (VERTICAL Rule V); s1Fill is the LAST-RESORT backstop only for a cell whose own subtree is gone (hasDownChild==false), so the two never race. D5: while a transport-loss observation is pending, check every beat — heal()'s cooldowns keep it storm-free
    // H2 LEFT-PACK backstop (probe-gated): when my row has NO live head, the head
    // can't run its row backstop, so the row rebuilds itself leftward — I heal my
    // immediate LEFT neighbour (the head if I am column 1). This cascades toward the
    // head: (0,r,3)->heals(0,r,2)->heals(0,r,1)->heals(0,r,0), each only once its
    // left is confirmed dead. Restricted to headless rows so it never races the
    // head's s1Fill. This is what rebuilds an all-heads-dead column-0.
    if(coord.i>=1 && TICK-healAt>20 && (!firstHandLive(ckey({0,coord.r,0})) || translost.count(ckey({0,coord.r,0})))){ Coord lft={0,coord.r,(uint8_t)(coord.i-1)}; uint64_t lk=ckey(lft);   // head NOT first-hand alive (phantom-proof) ⇒ headless row ⇒ rebuild leftward. D5: a pending transport-loss for the head counts as "no live head" (my own link to it died; firstHandLive may linger up to 60 ticks)
      bool defer = translost.count(lk) && hasDownChild(lft);   // D5 early path defers to the VERTICAL healer when the hole owns a down-child (bug #3's rule) — racing it minted duplicates
      if(!defer && ringConfirmDead(lft)){ if(occ.count(lk)){occ.erase(lk);live.erase(lk);s1seen.erase(lk);kidful.erase(lk);} holeSince.erase(lk); heal(lft); } }
    if(TICK>=xlinkAt){ xlinkAt=(int)TICK+150+(int)(rng()*100); Coord cm[C-1]; colMates(coord,cm); for(int q=0;q<C-1;q++) if(occGet(ckey(cm[q]))<0) routeTo(cm[q],1); }   // W7: keep column links live — re-ping any vacant column-mate (standby path, cross-links heal fast)
    if(s1CheckAt<0) s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD);
    if(TICK>=s1CheckAt){ s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD); emitRelay(genKey); }   // E3 (folds H6): re-knock each ~E3_PERIOD to refresh my greeter entry. Section-1 seats ARE the greeter pool.
    wake(id); return;
  }
  if(TICK-lastPhone>=8){ lastPhone=(int)TICK; phoneHome(); }
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
      if(hdEarly){ occ.erase(hdk); live.erase(hdk); s1seen.erase(hdk); kidful.erase(hdk); }
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
  if(coord.i==0 && !cousins.empty() && TICK-healAt>20){ Coord oc;   // TICK-lastAck>confirm (horizon branch): POSITIVE DEATH CONFIRMATION — the owner is not just occ-cleared but has stopped PONGing me for a settled window, so I don't promote a leaf on a transient occ glitch (that manufactures split-brains during a mass-heal)
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
      if(ownEarly){ occ.erase(ok); live.erase(ok); s1seen.erase(ok); kidful.erase(ok); }
      healTry[ok]=(int)TICK; healAt=(int)TICK; didHeal=true;
      vector<KV> nb; for(auto&c:cousins) nb.push_back({c.first,c.second});
      Coord rc[C]; rosterCells(rc); vector<int> ix={0,1,2,3,4}; for(int k=4;k>0;k--){int j=(int)(rng()*(k+1));swap(ix[k],ix[j]);}
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
  wake(id);
}
