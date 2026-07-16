static inline Coord unck(uint64_t k){ return {(uint32_t)(k>>16),(uint8_t)((k>>8)&0xff),(uint8_t)(k&0xff)}; }
static inline bool ownerCoordOf(Coord c, Coord& o){ if(c.pc==0) return false; return up({c.pc,c.r,0},o); }

void Seat::take(Coord c,int owner,vector<KV>&nbrs){
  coord=c; hasCoord=true; state=3; occ[ckey(c)]=id; noteS1(ckey(c));
  for(auto&kv:nbrs) if(!occ.count(kv.k)){ setOcc(kv.k,kv.v); noteS1(kv.k); }
  drainAt=0; seatTries=0; seatedAt=(int)TICK;
  lastAck=(int)TICK; lastPhone=(int)TICK;
  if(owner>=0){ Msg m; m.t=CLAIM; m.ck=ckey(c); m.id=id; emit(owner,m); }
  if(c.pc==0){ s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD); emitRelay(genKey); }   // E3: a Section-1 seat registers as a greeter on seating (present the MEETING genesis key)
  announce(); wake(id);
}
void Seat::announce(){ Coord ol[C+2]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){ seen.insert(x); Msg m;m.t=HELLO;m.ck=ckey(coord);m.id=id; emit(x,m);} } }

void Seat::admit(Coord c,int nc){
  occ[ckey(c)]=nc; noteS1(ckey(c));
  vector<KV> nbrs; Coord ol[C+2]; int n=ownedLinks(c,ol);
  for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=nc) nbrs.push_back({ckey(ol[k]),x}); }
  bool selfNb=false; for(int k=0;k<n;k++) if(ckey(ol[k])==ckey(coord)) selfNb=true;
  if(selfNb) nbrs.push_back({ckey(coord),id});
  Msg m; m.t=PLACE; m.coord=c; m.owner=id; m.nbrs=nbrs; emit(nc,m);
}
void Seat::serveFind(Msg& mm){
  if(!hasCoord||mm.ttl<=0){ Msg m;m.t=NOROOM; emit(mm.nc,m); return; }
  if(coord.pc==0){
    int ar=(coord.r-1+C)%C; bool empty=true; for(int j=0;j<C;j++) if(s1Fresh(ckey({0,(uint8_t)ar,(uint8_t)j}))){empty=false;break;}
    if(empty){ admit({0,(uint8_t)ar,coord.i},mm.nc); return; }
    if(coord.i==0){ for(int j=1;j<C;j++){ Coord rc={0,coord.r,(uint8_t)j}; uint64_t rck=ckey(rc); if(!occ.count(rck) && TICK-(healTry.count(rck)?healTry[rck]:-999)>45){ healTry[rck]=(int)TICK; admit(rc,mm.nc); return; } } }
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
  vector<KV> nbrs; Coord ol[C+2]; int n=ownedLinks(hole,ol);
  for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id) nbrs.push_back({ckey(ol[k]),x}); }
  bool selfNb=false; for(int k=0;k<n;k++) if(ckey(ol[k])==ckey(coord)) selfNb=true; if(selfNb) nbrs.push_back({ckey(coord),id});
  Coord oc; if(ownerCoordOf(hole,oc)){ int oid=occGet(ckey(oc)); bool has=false; for(auto&x:nbrs) if(x.k==ckey(oc))has=true; if(oid>=0&&!has) nbrs.push_back({ckey(oc),oid}); }
  Coord rc[C]; rosterCells(rc); vector<int> idx={0,1,2,3,4}; for(int k=4;k>0;k--){int j=(int)(rng()*(k+1));swap(idx[k],idx[j]);}
  for(int q:idx){ int x=occGet(ckey(rc[q])); if(x>=0&&x!=id){ Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=40; emit(x,m); return; } }
  if(hole.pc==coord.pc && hole.r==coord.r){ Coord rm[C-1]; rowMates(coord,rm); vector<int> ri={0,1,2,3}; for(int k=3;k>0;k--){int j=(int)(rng()*(k+1));swap(ri[k],ri[j]);}
    for(int q:ri){ if(ckey(rm[q])==ckey(hole)) continue; if(!(kidful.count(ckey(rm[q]))&&kidful[ckey(rm[q])])) continue; int x=occGet(ckey(rm[q])); if(x>=0&&x!=id){ Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=40; emit(x,m); return; } } }
  if(hole.pc==0 && coord.pc==0){ auto r=s1Roster(); vector<KV> rr; for(auto&e:r) if(e.v!=id && e.k!=ckey(hole)) rr.push_back(e); if(!rr.empty()){ Msg m;m.t=FINDLEAF;m.hole=hole;m.nbrs=nbrs;m.ttl=40; emit(rr[(int)(rng()*rr.size())].v,m); return; } }
  if(hole.i==0 && coord.i>0 && !hasChildren()) promoteInto(hole,nbrs);
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
  if(coord.pc==0 && hole.pc==0 && !(hole.i==0&&hole.r==coord.r)) return;
  bumpMoves();
  Coord oldC=coord; Coord ol[C+2]; int n=ownedLinks(oldC,ol); unordered_set<int> seen;
  for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){ seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(oldC);m.id=id; emit(x,m);} }
  occ.clear(); s1seen.clear();
  take(hole,-1,nbrs);
  lastAck=(int)TICK; lastPhone=(int)TICK-100;
}
void Seat::attack(){ if(!hasCoord) return; Coord ol[C+2]; int n=ownedLinks(coord,ol); for(int k=0;k<n;k++){ int x=occGet(ckey(ol[k])); if(x>=0&&x!=id){ Msg m;m.t=HELLO;m.ck=ckey(ol[k]);m.id=id; emit(x,m);} } }
void Seat::requeue(){ if(!evil) bumpEvict(); bumpMoves(); if(hasCoord){ Coord ol[C+2]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(coord);m.id=id; emit(x,m);}} }
  hasCoord=false; occ.clear(); s1seen.clear(); drainAt=0; join(); }

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
void Seat::reseatViaRoster(){ bumpMoves(); if(hasCoord){ Coord ol[C+2]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&x!=id&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ckey(coord);m.id=id; emit(x,m);}} }
  hasCoord=false; occ.clear(); s1seen.clear(); drainAt=0; seatTries=0;
  int t=(haveRoster&&!roster.empty())?pickRoster():-1; if(t>=0) askSeat(t); else join(); }

bool Seat::nextHopCoord(Coord t, Coord& out){
  Coord c=coord;
  if(c.pc==t.pc&&c.r==t.r&&c.i==t.i) return false;
  if(c.r!=t.r){ if(c.pc!=0){ if(c.i!=0){out={c.pc,c.r,0};return true;} return up(c,out); }
    for(int j=1;j<C;j++){ Coord x; if(crossLink({0,c.r,(uint8_t)j},x)&&x.r==t.r){ out= (c.i==j)? x : Coord{0,c.r,(uint8_t)j}; return true; } } return false; }
  // same row: navigate by path
  if(c.pc!=t.pc){ // climb to common ancestor or descend
    // build depth of each via repeated parent
    // find if t is descendant of c or vice versa by comparing path prefixes:
    // simpler: if depth(c) > depth via LCA... emulate JS: compare path strings.
    // Reconstruct digit paths:
    auto digs=[&](uint32_t pc,vector<int>&v){ while(pc){ v.push_back(lastDigit(pc)); pc=parentPath(pc);} for(int a=0,b=(int)v.size()-1;a<b;a++,b--)swap(v[a],v[b]); };
    vector<int> pa,pb; digs(c.pc,pa); digs(t.pc,pb);
    int l=0; while(l<(int)pa.size()&&l<(int)pb.size()&&pa[l]==pb[l])l++;
    if(l<(int)pa.size()){ if(c.i!=0){out={c.pc,c.r,0};return true;} return up(c,out); }
    if((int)pa.size()<(int)pb.size()){ int d=pb[pa.size()]; if(c.i!=d){out={c.pc,c.r,(uint8_t)d};return true;} out=down(c); return true; }
  }
  out={c.pc,c.r,t.i}; return true;
}
int Seat::nextHopToward(Coord target,int exclude){
  if(!hasCoord) return -1; Coord ideal; if(nextHopCoord(target,ideal)){ int x=occGet(ckey(ideal)); if(x>=0&&x!=id&&x!=exclude) return x; }
  Coord xc; if(crossLink(coord,xc)){ int x=occGet(ckey(xc)); if(x>=0&&x!=id&&x!=exclude) return x; }
  Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){ Coord cx; if(!crossLink(rm[q],cx))continue; int x=occGet(ckey(cx)); if(x>=0&&x!=id&&x!=exclude) return x; }
  return -1;
}
void Seat::routeTo(Coord target,int tag){ int nh=nextHopToward(target,-1); if(ckey(coord)==ckey(target)) return; if(nh>=0){ Msg m;m.t=ROUTE;m.target=target;m.asker=id;m.tag=tag;m.ttl=60;m.via=id; emit(nh,m);} }

void Seat::onPhone(Msg& m){
  if(!hasCoord|| (m.tock && m.tock!=ckey(coord))) return;
  uint64_t ck=ckey(m.coord); int prev=occGet(ck);
  if(prev>=0&&prev!=m.id&&m.id>prev && live.count(ck) && TICK-live[ck]<=40){ Msg y;y.t=YIELD;y.ck=ck; emit(m.id,y); return; }
  setOcc(ck,m.id); live[ck]=(int)TICK; noteS1(ck); kidful[ck]=m.kids?1:0; if(m.child>=0) childOf[ck]=m.child; else childOf.erase(ck);
  int owner=-1; uint64_t oCk=0; Coord myoc; if(ownerCoord(myoc)){ oCk=ckey(myoc); owner=occGet(oCk); }
  vector<Ent> row;
  if(coord.i==0 && m.coord.pc==coord.pc && m.coord.r==coord.r){ row.push_back({ckey(coord),id, occGet(ckey(down(coord)))}); for(int c=1;c<C;c++){ Coord rc={coord.pc,coord.r,(uint8_t)c}; int x=occGet(ckey(rc)); if(x>=0&&x!=m.id) row.push_back({ckey(rc),x, childOf.count(ckey(rc))?childOf[ckey(rc)]:-1}); } }
  Msg p;p.t=PONG;p.owner=owner;p.oCk=oCk;p.row=row; emit(m.id,p);
  if(prev>=0&&prev!=m.id){ Msg y;y.t=YIELD;y.ck=ck; emit(prev,y); }
}
void Seat::phoneHome(){
  Coord tc; bool have=false; if(hasCoord){ if(coord.i!=0){ tc={coord.pc,coord.r,0}; have=true; } else have=ownerCoord(tc); }
  if(!have) return; int tid=occGet(ckey(tc)); if(tid<0) return;
  Msg m;m.t=PHONE;m.coord=coord;m.tock=ckey(tc);m.id=id;m.kids=hasChildren();m.child=occGet(ckey(down(coord))); emit(tid,m);
}
void Seat::s1Sync(){
  vector<Ent> ent; ent.push_back({ckey(coord),id,0});
  for(auto&e:occ){ if((e.first>>16)==0 && e.second!=id){ auto it=s1seen.find(e.first); if(it!=s1seen.end()&&TICK-it->second<120) ent.push_back({e.first,e.second,(int)(TICK-it->second)}); } }
  unordered_set<int> tg; Coord x; if(crossLink(coord,x)){int t=occGet(ckey(x)); if(t>=0&&t!=id)tg.insert(t);} Coord rm[C-1]; rowMates(coord,rm); for(int q=0;q<C-1;q++){int t=occGet(ckey(rm[q])); if(t>=0&&t!=id)tg.insert(t);} int ab=occGet(ckey({0,(uint8_t)((coord.r-1+C)%C),coord.i})); if(ab>=0&&ab!=id)tg.insert(ab); int be=occGet(ckey({0,(uint8_t)((coord.r+1)%C),coord.i})); if(be>=0&&be!=id)tg.insert(be);
  for(int t:tg){ Msg m;m.t=S1SYNC;m.ent=ent; emit(t,m); }
}
void Seat::rowSweep(){
  if(coord.i!=0) return;
  vector<uint64_t> del;
  for(auto&e:live){ if(TICK-e.second<=50) continue; Coord c=unck(e.first); if(c.pc==coord.pc&&c.r==coord.r&&c.i>0){ bool kids=kidful.count(e.first)&&kidful[e.first]; del.push_back(e.first); if(kids||c.pc==0){ heal(c); } } }
  for(auto k:del){ live.erase(k); occ.erase(k); kidful.erase(k); s1seen.erase(k); }
}
void Seat::s1Fill(){
  if(TICK-seatedAt<80) return;
  for(int j=1;j<C;j++){ Coord c={0,coord.r,(uint8_t)j}; uint64_t ck=ckey(c); auto it=live.find(ck); if(it!=live.end()&&TICK-it->second<=60) continue; if(occ.count(ck)){occ.erase(ck);live.erase(ck);s1seen.erase(ck);kidful.erase(ck);} heal(c); return; }
}

void Seat::recv(Msg& m){
  if(!alive[id]) return;
  switch(m.t){
    case GREETERS: {
      if(m.list.empty()){ if(state==0){ genKey=myKey; vector<KV> e; take({0,0,0},-1,e);} return; }   // R3: empty list => I minted the genesis key (relay recorded it) and I found the home
      lastGreeters=m.list;
      if(state==0){ Msg w;w.t=WHOHOME;w.from=id;w.ttl=60; emit(m.list[0],w); state=1; retryAt=(int)TICK; }
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
      if(state==1){ if(m.roster.empty()){ retryAt=(int)TICK-10; return; } roster=m.roster; haveRoster=true; seatTries=0; int t=pickRoster(); if(t>=0)askSeat(t); else retryAt=(int)TICK-10; }   // genesis is ONLY via an empty greeter LIST (relay-serialised); an empty roster just means retry — never a second founder
      else if(state==3&&m.roster.size()){ roster=m.roster; haveRoster=true; }   // E3 stripped: store the roster (a draining DEEP seat re-seats against it via E1) but do NO Section-1 self-audit
      return; }
    case FIND: serveFind(m); return;
    case FINDLEAF: findLeaf(m.hole,m.nbrs,m.ttl); return;
    case PLACE: if(state==2) take(m.coord,m.owner,m.nbrs); return;
    case NOROOM: if(state==2){ retryAt=(int)TICK; if(haveRoster&&roster.size()&&++seatTries<=6){int t=pickRoster(); if(t>=0){askSeat(t);return;}} seatTries=0; join(); } return;
    case HELLO: {
      if(hasCoord&&state==3&&m.ck==ckey(coord)&&m.id!=id&&m.id<id){ if(TICK-challAt>20){ challAt=(int)TICK; Msg c;c.t=CHALLENGE;c.ck=m.ck;c.from=id; emit(m.id,c);} return; }
      int prev=occGet(m.ck);
      bool prevFresh=false; if(prev>=0){ if((m.ck>>16)==0) prevFresh=s1Fresh(m.ck); else prevFresh = live.count(m.ck)? (TICK-live[m.ck]<=40) : true; }
      if(prev>=0&&prev!=m.id&&prevFresh){ Msg y;y.t=YIELD;y.ck=m.ck; emit(m.id>prev?m.id:prev,y); }
      if(prev!=m.id){ setOcc(m.ck,m.id); if(hasCoord){ Msg h;h.t=HELLO;h.ck=ckey(coord);h.id=id; emit(m.id,h);} }
      noteS1(m.ck); return; }
    case YIELD: if(hasCoord&&state==3&&ckey(coord)==m.ck) requeue(); return;
    case CLAIM: if(occGet(m.ck)!=m.id){ setOcc(m.ck,m.id); live[m.ck]=(int)TICK; } noteS1(m.ck); return;
    case LEAVE: {
      bool hadKids=kidful.count(m.ck)&&kidful[m.ck];
      if(occGet(m.ck)==m.id){ occ.erase(m.ck); live.erase(m.ck); kidful.erase(m.ck); s1seen.erase(m.ck); }
      if(HEALING&&hasCoord&&state==3){ Coord c=unck(m.ck); if(c.pc==coord.pc&&c.r==coord.r&&c.i!=coord.i){ if(c.i==0&&coord.i>0&&lowestSurvivor()){ heal({c.pc,c.r,0}); return; } if(c.i>0&&coord.i==0&&(hadKids||c.pc==0)){ heal(c); return; } } }
      return; }
    case GREETWALK: return;   // H6 RETIRED — folded into E3 (Section-1 seats knock directly as the greeter pool)
    case S1SYNC: {
      for(auto&e:m.ent){ uint64_t ck=e.k; int eid=e.v; int age=e.age;
        if(hasCoord&&ck==ckey(coord)&&eid!=id){ int seen=(int)TICK-age-2; if(eid<id&&seen>seatedAt+4){ requeue(); return; } continue; }
        if(age==0&&hasCoord){ int cur=occGet(ck); if(cur>=0&&cur!=eid&&cur<eid && TICK-(s1seen.count(ck)?s1seen[ck]:-999)<60){ Msg y;y.t=YIELD;y.ck=ck; emit(eid,y);} }
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
    case PONG: { lastAck=(int)TICK; if(m.oCk&&m.owner>=0&&occGet(m.oCk)!=m.owner){ setOcc(m.oCk,m.owner); noteS1(m.oCk);} for(auto&e:m.row){ if(occGet(e.k)!=e.v) setOcc(e.k,e.v); noteS1(e.k); if(e.age>=0) childOf[e.k]=e.age; } return; }
    case ROUTE: {
      if(!hasCoord) return;
      if(ckey(coord)==ckey(m.target)){ Msg r;r.t=ROUTED;r.tag=m.tag;r.target=m.target;r.id=id; emit(m.asker,r); return; }
      if(m.ttl<=0){ Msg r;r.t=ROUTED;r.tag=m.tag;r.target=m.target;r.id=-1; emit(m.asker,r); return; }
      int nh=nextHopToward(m.target,m.via); if(nh>=0){ Msg r;r.t=ROUTE;r.target=m.target;r.asker=m.asker;r.tag=m.tag;r.ttl=m.ttl-1;r.via=id; emit(nh,r); return; }
      Msg r;r.t=ROUTED;r.tag=m.tag;r.target=m.target;r.id=-1; emit(m.asker,r); return; }
    case ROUTED: if(m.tag==1){ if(m.id>=0&&hasCoord){ setOcc(ckey(m.target),m.id); noteS1(ckey(m.target)); Msg h;h.t=HELLO;h.ck=ckey(coord);h.id=id; emit(m.id,h);} } return;
    default: return;
  }
}
void Seat::leave(){ alive[id]=0; active.erase(id); if(!hasCoord) return; uint64_t ck=ckey(coord); Coord ol[C+2]; int n=ownedLinks(coord,ol); unordered_set<int> seen; for(int k=0;k<n;k++){int x=occGet(ckey(ol[k])); if(x>=0&&!seen.count(x)){seen.insert(x); Msg m;m.t=LEAVE;m.ck=ck;m.id=id; emit(x,m);}} Coord o; if(ownerCoord(o)){int oid=occGet(ckey(o)); if(oid>=0&&!seen.count(oid)){ Msg m;m.t=LEAVE;m.ck=ck;m.id=id; emit(oid,m);}} }
void Seat::tick(){
  if(!alive[id]){ return; }
  if(state!=3){ if((state==0||state==1)&&TICK-retryAt>20) join(); else if(state==2&&TICK-retryAt>60){ if(haveRoster&&roster.size()&&++seatTries<=6){int t=pickRoster(); if(t>=0)askSeat(t); else join(); } else { seatTries=0; join(); } } wake(id); return; }
  if(evil) attack();
  if(coord.pc==0){
    if(TICK-lastPhone>=8){ lastPhone=(int)TICK; phoneHome(); s1Sync(); }
    if(coord.i==0 && (TICK%12)==0){ rowSweep(); s1Fill(); }
    if(coord.i>0 && TICK-lastAck>40 && TICK-healAt>20 && lowestSurvivor()) heal({0,coord.r,0});
    if(coord.i>0 && TICK>=xlinkAt){ xlinkAt=(int)TICK+150+(int)(rng()*100); Coord x; if(crossLink(coord,x)&&occGet(ckey(x))<0) routeTo(x,1); }
    if(s1CheckAt<0) s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD);
    if(TICK>=s1CheckAt){ s1CheckAt=TICK+E3_PERIOD+(long long)(rng()*E3_PERIOD); emitRelay(genKey); }   // E3 (folds H6): re-knock each ~E3_PERIOD to refresh my greeter entry. Section-1 seats ARE the greeter pool.
    wake(id); return;
  }
  if(TICK-lastPhone>=8){ lastPhone=(int)TICK; phoneHome(); }
  if(coord.i==0 && (TICK%12)==0) rowSweep();
  if(coord.i>0 && TICK-lastAck>40 && TICK-healAt>20 && lowestSurvivor()) heal({coord.pc,coord.r,0});
  if(coord.i>0 && TICK>=xlinkAt){ xlinkAt=(int)TICK+150+(int)(rng()*100); Coord x; if(crossLink(coord,x)&&occGet(ckey(x))<0) routeTo(x,1); }
  if(drainAt && TICK>=drainAt){ reseatViaRoster(); return; }
  if(TICK-lastAck>80) drainOrReenter();
  wake(id);
}
