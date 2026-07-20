// mesh.cpp — the GifOS mesh simulator in C++ (port of test/mesh-scale.js, the
// NO-ROOT topology + all healing laws). Compiled + shared-memory-threadable:
// single-threaded here, ~50x faster than the Node sim; threads land next.
//   ./mesh N [leaveFraction] [--workers=W]
#include "topo.h"
#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <string>
#include <chrono>
#include <algorithm>
#include <utility>
using namespace std;
typedef unordered_map<uint64_t,int> Occ;

// ---- message ----
enum MT { GREETERS,WHOHOME,HOME,FIND,FINDLEAF,PLACE,NOROOM,HELLO,YIELD,CLAIM,LEAVE,GREETWALK,S1SYNC,DRAIN,CHALLENGE,CONFIRM,PHONE,PONG,ROUTE,ROUTED,KNOCK,TRANSLOST,MOVED };   // TRANSLOST: a fabric EVENT (from=-1) — "MY transport to seat m.id died" (D5), never a peer message. MOVED: law-T3 forwarding tombstone — a vacated cell answers with where the mover went.
struct KV { uint64_t k; int v; };
struct Ent { uint64_t k; int v; int age; int ch=-1; };   // ch = the child (heir) of the seat at k — rides S1SYNC so every Section-1 seat learns every cell's heir
struct Msg {
  MT t; int to=-1;
  int from=-1,id=-1,owner=-1,nc=-1,asker=-1,via=-1,child=-1,ttl=0,tag=0,hold=0;
  uint64_t ck=0,oCk=0,tock=0,gkey=0,mvd=0;   // mvd: LEAVE/MOVED destination coord (law T3 — the goodbye carries where the mover went)
  Coord coord{0,0,0},hole{0,0,0},target{0,0,0};
  bool kids=false;
  vector<int> list; vector<KV> roster,nbrs; vector<Ent> ent,row;
  // ---- mesh routing (Option A) ----------------------------------------------
  // A frame with routing=true travels hop-by-hop over LINKS (nextHopToward)
  // until it reaches rdst. If rfinal>=0, the occupant of rdst hands it to rfinal
  // over a direct link (delivery to an unseated newcomer via its gateway). This
  // is how the protocol reaches a NON-adjacent seat without teleporting.
  bool routing=false; int rfinal=-1,rttl=0,rvia=-1; Coord rdst{0,0,0};
  bool direct=false;   // set on a gateway→attached-newcomer hand-off: deliver over the direct link, do NOT re-enter routing (breaks the emit↔route loop)
};

// ---- globals / fabric ----
static int N; static double LEAVEFRAC=0; static int W=1;
static long long TICK=0; static long long MOVES=0, EVICTIONS=0;
static long long COMPACT_PROBES=0, COMPACT_MOVES=0, COMPACT_ADMITS=0, COMPACT_PLACES=0, COMPACT_ATS1=0, COMPACT_SWEEP=0;   // Q2 diagnostics
static bool HEALING=true;
static bool COMPACTION=true;   // Q2 A/B toggle (`compacton 0|1`)
static const int GREET_PERIOD=800;
static uint32_t GSEED=20260714;
static uint32_t SEED0=20260714;   // the seed a run STARTS from; `seed N` sets it, initSim restores GSEED to it (reproducible sweeps)
static inline double grnd(){ GSEED=(uint32_t)((GSEED*1103515245u+12345u)&0x7fffffff); return GSEED/2147483648.0; }
// ---- TOTAL NETWORK PARTITION primitive ----
// `split` cuts ALL P2P links between two live seat-groups while keeping every seat
// ALIVE (distinct from kill, which removes seats). side[id] in {0,1}; a frame whose
// endpoints straddle the cut is silently DROPPED (as a severed transport would).
// The relay registry stays shared (both sides can still knock), but no seat on one
// side can reach a seat on the other — modelling a genuine transport-level split.
static bool PARTITIONED=false; static vector<char> partSide;
static inline bool cutBetween(int from,int to){ return PARTITIONED && from>=0 && to>=0 && from<(int)partSide.size() && to<(int)partSide.size() && partSide[from]!=partSide[to]; }
static unordered_map<long long, vector<Msg>> bus;
static unordered_set<uint64_t> openPairs; static uint64_t SEQ=0;
// R2 zero-knowledge relay: a per-hashed-URL registry holding ONLY H(genesis key)
// + a TTL'd list of SEALED greeter entries (in production each is a REAL
// Seal(K, address) — address = {peerId, coord} of a seated Section-1 greeter —
// under the meeting-URL key K the relay never holds; here the id MODELS that
// opaque blob — the relay only stores & hands it back, never reads it). Admits a
// knocker iff the list is empty (mint) or H(presented key)==stored hash.
static uint64_t relayGenesisKey=0; static unordered_map<int,long long> relayGreeters;   // sealed-entry(modelled as id) -> expiry tick; relayGenesisKey holds H(key), not the key
static inline uint64_t keyHash(uint64_t k){ k^=k>>33; k*=0xff51afd7ed558ccdull; k^=k>>33; k*=0xc4ceb9fe1a85ec53ull; k^=k>>33; return k?k:1; }
static const long long RELAY_TTL=500; static const int RELAY_CAP=72;
static const long long E3_PERIOD=200;   // Section-1 re-knock cadence (< RELAY_TTL so live seats stay listed)
static const long long STRAND_TTL=500;   // R6: a newcomer that cannot reach any greeter for this long (=RELAY_TTL) re-checks: empty list => take over, else => stranded (voted off / unreachable subnet)
// H1-S1 RING-HEAL CONSERVATISM (W7): a HOME (Section-1) cell is refilled only after
// its occupant has been unreachable via ALL its rook-redundant paths for this
// settled window — a far higher bar than an ordinary hole. A wrong ring-heal is the
// one act that mints a divergent home; holding the coord as a temporary hole is a
// recoverable availability dip, so the ring always chooses the hole. Much longer
// than the deep-tree confirmation (60), because the rook has many paths to exhaust.
static const long long RING_HOLD=220;
// D5 EARLY-PROBE (healing-laws D5): when MY OWN transport to a neighbour dies (a
// FIRST-HAND observation — the modelled DataChannel close, never gossip), the
// confirm probe may start immediately instead of waiting out the silence
// horizon. EARLY_HOLD is the settled window the probe gets on the mesh's
// redundant paths before death is confirmed: a probe round trip plus a retry
// (pending observations re-probe every ~6 ticks). The horizon (60/RING_HOLD)
// remains the backstop when no transport event fired; an answered probe clears
// the observation entirely — no eviction, E2 stands.
static const long long EARLY_HOLD=12;
// T — the mover's lease (atomic seat switching, law T in healing-laws.md).
// A self-move TAKES its new seat FIRST and vacates the old one only when the
// claim CONFIRMS (a new neighbour answers, or the window closes with no
// contradiction); a contradiction (E2 yield at the new cell) ROLLS the mover
// BACK to its still-held old seat — a mover is never homeless. During the
// transit window the node holds BOTH coords: the old seat still answers and
// stays tenure-protected. After confirm the old cell keeps a bounded
// FORWARDING TOMBSTONE: a redirect for in-flight traffic, never occupancy.
// All windows self-expire.
static const long long CONFIRM_TTL=16;
static const long long LEASE_TTL=40;
// Q2 — COMPACTION (roadmap §3, healing-laws law T): a settled deep LEAF that a
// fresh FIND would place STRICTLY SHALLOWER re-FINDs from the home and atomically
// moves up (law T dual-hold). Rate-limited + settle-gated so a healing boundary
// never sloshes seats. depth is a monotone potential ⇒ MOVES provably settle.
static const long long COMPACT_PERIOD=90;   // min ticks between one leaf's compaction probes (rate limit / hysteresis)
static const long long COMPACT_SETTLE=300;  // don't compact until settled this long since seating / last heal / last move / last local churn. Sized ABOVE the healing horizons (60 deep / RING_HOLD-scale) so a mass-heal fully re-converges before compaction stirs the tree — a shorter window let compaction ~2x the mass-heal convergence time (transient s1 dips) and flake the churn sweep.
static const int       COMPACT_TTL=30;      // FIND hop budget for a compaction probe

// ---- INTERNET-CONDITIONS MODEL (opt-in; all defaults reproduce the idealized fabric) ----
// Emergent: an unreachable-subnet or lost/severed frame is SILENTLY DROPPED — the
// existing heal/drain treats it as a dead link and routes/heals around it (no new
// transport law). A dedicated seeded rng (frnd) keeps clean runs byte-identical and
// conditioned runs --det-reproducible; it never touches the relay-shuffle rng.
static double NET_LOSS=0.0;       // base per-frame drop probability on a P2P link
static int    NET_LAT=1;          // established-link latency: delay ~ 1..NET_LAT (+ device/link penalty)
static double NET_SEVER=0.0;      // per-frame probability an established link severs (dead ~40-200 ticks)
static int    NUM_SUBNETS=1;      // participants split across this many subnets (1 = all reachable)
static double REACH_DENSITY=1.0;  // fraction of NON-spanning subnet pairs that are directly reachable
static double NET_QUAL_MIN=1.0;   // netQual drawn uniformly in [NET_QUAL_MIN, 1.0] (1.0 = all perfect)
static int    NET_SPINE=1;        // 1 = force the subnet graph CONNECTED (spanning chain); 0 = pure density (can partition!)
static int    RELAY_K=0;          // media relay-assist fan-out cap per node (0 = off; >0 = bounded-degree relay tree). "one taker per giver + chain" ~ small K.
// Owned-link delivery is now ENFORCED BY DEFAULT: a seated seat may only hand a
// frame to a real owned-link neighbour; a send to a non-neighbour ROUTES over the
// mesh (or relays between two socketed greeting-scope peers). A teleport is a bug
// and DETONATES (teleportExplode). Pass `--allow-teleport` to fall back to the old
// perfect-bus (teleports counted, not fatal) purely for A/B comparison.
static bool   ROUTE_ENFORCE=true;
static uint32_t FSEED=20260714;
static inline double frnd(){ FSEED=(uint32_t)((FSEED*1103515245u+12345u)&0x7fffffff); return FSEED/2147483648.0; }
static vector<vector<char>> reachMx;                    // reachMx[a][b]: subnets a<->b directly reachable
static unordered_map<uint64_t,long long> severedUntil;  // pairKey -> tick the link recovers
static inline bool reachable(int sa,int sb){ return (int)reachMx.size()<=sa || (int)reachMx.size()<=sb ? true : reachMx[sa][sb]!=0; }
static void buildReach(){
  reachMx.assign(NUM_SUBNETS, vector<char>(NUM_SUBNETS,0));
  for(int a=0;a<NUM_SUBNETS;a++){ reachMx[a][a]=1; if(NET_SPINE && a>0){ reachMx[a][a-1]=reachMx[a-1][a]=1; } }  // spanning chain => CONNECTED (spine on); spine off => can partition
  int lo = NET_SPINE?2:1;
  for(int a=0;a<NUM_SUBNETS;a++) for(int b=a+lo;b<NUM_SUBNETS;b++) if(frnd()<REACH_DENSITY){ reachMx[a][b]=reachMx[b][a]=1; }  // extra shortcuts by density
}
// connected components of the SUBNET reachability graph (=> which seats can carry media to each other AT ALL, even via relay)
static vector<int> subnetComp(){
  vector<int> comp(NUM_SUBNETS,-1); int c=0;
  for(int s=0;s<NUM_SUBNETS;s++) if(comp[s]<0){ vector<int> st={s}; comp[s]=c; while(!st.empty()){ int u=st.back(); st.pop_back(); for(int v=0;v<NUM_SUBNETS;v++) if(reachMx[u][v]&&comp[v]<0){ comp[v]=c; st.push_back(v);} } c++; }
  return comp;
}

// ---- threading: per-thread outboxes (seats are independent within a tick, so
// each thread recv/ticks its own id%NTHREADS shard into thread-local buffers;
// a serial flush then merges them into the shared fabric). PAR is true ONLY
// inside the parallel region, so NTHREADS==1 stays byte-identical to the
// validated single-threaded path (everything routes inline). DETERM sorts the
// per-shard tick order for guaranteed run-to-run reproducibility.
#ifdef _OPENMP
#include <omp.h>
static inline int curTid(){ return omp_get_thread_num(); }
#else
static inline int curTid(){ return 0; }
#endif
static int NTHREADS=1; static bool DETERM=false; static bool PAR=false;
struct Pend{ int from,to; Msg m; };
static vector<vector<Pend>> tlsOut;
static vector<vector<pair<int,uint64_t>>> tlsRelay;   // {id, presentedKey}
static vector<vector<int>> tlsWake;
static vector<long long> tlsMoves, tlsEvict;
static void tlsResize(int n){ NTHREADS=n; tlsOut.assign(n,{}); tlsRelay.assign(n,{}); tlsWake.assign(n,{}); tlsMoves.assign(n,0); tlsEvict.assign(n,0); }
static inline void bumpMoves(){ if(PAR) tlsMoves[curTid()]++; else MOVES++; }
static inline void bumpEvict(){ if(PAR) tlsEvict[curTid()]++; else EVICTIONS++; }

struct Seat;
static vector<Seat*> seats;              // index = id
static vector<char> alive;               // alive[id]
static unordered_set<int> active, nextActive;
static inline void wake(int id){ if(PAR) tlsWake[curTid()].push_back(id); else nextActive.insert(id); }

// ---- seat ----
struct Seat {
  int id; int state=0; // 0 join,1 ask,2 search,3 seated
  bool hasCoord=false; Coord coord{0,0,0};
  Occ occ, live, s1seen, healTry, cousins, holeSince; unordered_map<uint64_t,uint8_t> kidful; unordered_map<uint64_t,int> childOf;   // holeSince: when a Section-1 cell I don't hear first-hand first looked like a hole (H1-S1 confirm-window timer, probe-gated)   // cousins: my future owned-link coord -> the heir that will hold it, learned from my owner's PONG (for relay-free promote-up)
  // D5 early-probe state (keyed by coord ckey): translost = when MY transport to
  // that coord's occupant died (edge-triggered); tlProbeAt = last re-probe tick;
  // probeAck = last ROUTED answer for a probe of that coord (deliberately NOT
  // `live` — a probe answer travels the mesh, so it can only ever PREVENT an
  // early eviction, never evict or resurrect; E2 untouched).
  Occ translost, tlProbeAt, probeAck;
  int retryAt=-1,seatTries=0,lastPhone=-99,lastAck=0,healAt=-99,drainAt=0,rosterAskAt=-999,xlinkAt=0;
  int greetHoldT=0,seatedAt=0,challAt=0,emptyHomes=0;
  long long greetAt=-1,s1CheckAt=-1;
  uint64_t myKey=0, genKey=0;   // myKey: my throwaway personal genesis key; genKey: THIS meeting's genesis key (learned via the newcomer dance, or minted if I found)
  int subnet=0; double netQual=1.0;   // which sub-network I'm on + my connection/device quality (0..1); set at spawn
  int joinStart=-1; bool stranded=false;   // R6: when this join attempt began; stranded once I give up
  int lastReach=-1;   // R6: last tick I REACHED a greeter (a HOME roster came back). Stranding requires having reached NONE for a full TTL — a busy room where I keep getting NOROOM is not "stranded".
  int strandedAt=0;   // R6: when I gave up. Stranding is RECOVERABLE — after a backoff I re-knock (the client's manual retry); if a greeter is now reachable I seat. Only a genuinely-cut-off seat stays stranded across retries.
  bool auditPend=false; bool evil=false;
  // ---- T: atomic seat switching (mover's lease) ----
  bool moving=false; int moveAt=-1;           // transit: NEW seat taken, OLD not yet vacated (dual-hold)
  Coord oldCoord{0,0,0}; uint64_t oldCk=0;    // the still-held old seat
  vector<int> oldNbrIds;                      // old-link occupants — get the LEAVE(mvd) on confirm
  Occ holdOcc, holdSeen, holdCous;            // rollback snapshots
  uint64_t leaseCk=0; long long leaseUntil=-1; // T3: forwarding tombstone for my just-vacated cell
  long long compactAt=0;                       // Q2: next tick this leaf may probe for a shallower seat
  int lastChurn=0;                             // Q2 hysteresis: last tick my neighbourhood churned (a LEAVE/heal/move nearby) — compaction waits for local quiescence
  vector<KV> roster; bool haveRoster=false; vector<int> lastGreeters;
  uint32_t rs;
  Seat(int i):id(i){ uint32_t h=2166136261u; char b[16]; int n=snprintf(b,16,"p%08d",i); for(int k=0;k<n;k++){h^=(unsigned char)b[k]; h*=16777619u;} rs=h^0x9e3779b9u;
    uint64_t z=((uint64_t)i+1)*0x9e3779b97f4a7c15ull; z=(z^(z>>30))*0xbf58476d1ce4e5b9ull; z=(z^(z>>27))*0x94d049bb133111ebull; myKey=(z^(z>>31))|1ull; }   // per-seat throwaway genesis key (nonzero)
  inline double rng(){ rs=(rs+0x6d2b79f5u); uint32_t t=rs; t=(t^(t>>15))*(t|1u); t^=t+(t^(t>>7))*(t|61u); return ((t^(t>>14))>>0)/4294967296.0; }
  template<class T> void shuf(vector<T>&a){ for(int k=(int)a.size()-1;k>0;k--){ int j=(int)(rng()*(k+1)); T tmp=a[k];a[k]=a[j];a[j]=tmp; } }

  inline int occGet(uint64_t k){ auto it=occ.find(k); return it==occ.end()?-1:it->second; }
  inline void tlForget(uint64_t k){ translost.erase(k); tlProbeAt.erase(k); probeAck.erase(k); }
  inline void tlClear(){ translost.clear(); tlProbeAt.clear(); probeAck.clear(); }
  inline void setOcc(uint64_t k,int v){ if(v==id && (!hasCoord||k!=ckey(coord))) return; auto it=occ.find(k); if(it==occ.end()||it->second!=v) tlForget(k); occ[k]=v; }   // a seat can be in exactly ONE place: never store MYSELF at a coord I do not hold (stale self-claims circulating back made invisible zombies); a CHANGED occupant clears any pending D5 observation of the old one
  inline void noteS1(uint64_t ck){ if((ck>>16)==0) s1seen[ck]=(int)TICK; } // pc==0 => Section 1
  inline bool s1Fresh(uint64_t ck){ auto it=s1seen.find(ck); return it!=s1seen.end() && TICK-it->second<120 && occ.count(ck); }
  // E2 FIRST-HAND liveness: `live[]` is set ONLY by direct contact — a PHONE I
  // answered (onPhone), a HELLO/CLAIM its occupant sent me, a PONG from my head.
  // GOSSIP (S1SYNC) never sets it. So firstHandLive is the ONLY signal that may
  // evict/tie-break: a phantom (a stale gossip echo of a seat that has moved) is
  // NOT first-hand live, so it can never yield a live healer out of a hole. This
  // is the echo-immune fix — gossip informs routing, never liveness.
  inline bool firstHandLive(uint64_t ck){ auto it=live.find(ck); return it!=live.end() && TICK-it->second<=60; }
  Coord ownedRowHead(){ return { childPath(coord.pc,coord.i), coord.r, 0 }; }
  void rosterCells(Coord out[C]){ Coord h=ownedRowHead(); for(int c=0;c<C;c++) out[c]={h.pc,h.r,(uint8_t)c}; }
  // 11a FRONTIER-ONLY ADMISSION: admit a newcomer only into a TRUE frontier slot
  // — a free cell whose down-child is NOT occupied. A free cell that still owns a
  // subtree is an INTERNAL hole: its fixed healer (that down-child, VERTICAL Rule
  // V) is already filling it, so a newcomer there would double-book. Skip it; the
  // caller forwards the FIND deeper (serveFind), keeping healers and newcomers
  // disjoint by construction.
  bool firstFreeInRoster(Coord&f){ Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++){ if(occ.count(ckey(rc[c]))) continue; if(occGet(ckey(down(rc[c])))>=0) continue; f=rc[c]; return true; } return false; }
  bool ownerCoord(Coord&o){ if(!hasCoord||coord.pc==0) return false; return up({coord.pc,coord.r,0},o); }
  int ownerId(){ if(!hasCoord) return -1; Coord u; if(!up({coord.pc,coord.r,0},u)) return -1; return occGet(ckey(u)); }
  bool hasChildren(){ Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++){int x=occGet(ckey(rc[c])); if(x>=0&&x!=id) return true;} return false; }
  bool lowestSurvivor(){ for(int j=1;j<coord.i;j++){ uint64_t k=ckey({coord.pc,coord.r,(uint8_t)j}); int x=occGet(k); if(x<0||x==id) continue; if(coord.pc!=0||s1Fresh(k)) return false;} return true; }
  // 11a: does cell c own an OCCUPIED down-child (so its fixed healer is that
  // down-child, the VERTICAL rule — the right-neighbour must then DEFER)? Known
  // either directly (I link down(c)) or via childOf learned from the head's PONG.
  bool hasDownChild(Coord c){ if(occGet(ckey(down(c)))>=0) return true; auto it=childOf.find(ckey(c)); return it!=childOf.end()&&it->second>=0; }

  void emit(int to, const Msg& m);         // fwd
  void emitRelay(uint64_t presentedKey);
  void join(){ state=0; retryAt=(int)TICK; haveRoster=false; if(joinStart<0)joinStart=(int)TICK; emitRelay(myKey); wake(id); }   // NEWCOMER knock: present my THROWAWAY key. If I'm first I mint genesis; else I learn the real key via the dance and re-present it once seated in Section 1.
  void askSeat(int target){ state=2; retryAt=(int)TICK; Msg m; m.t=FIND; m.nc=id; m.ttl=200; emit(target,m); wake(id); }
  int pickRoster(){ vector<int> live_; for(auto&e:roster) if(e.v!=id) live_.push_back(e.v); if(live_.empty()) return -1; return live_[(int)(rng()*live_.size())]; }
  vector<KV> s1Roster(){ vector<KV> out; if(hasCoord&&coord.pc==0) out.push_back({ckey(coord),id}); for(auto&e:occ){ if((e.first>>16)==0 && e.second!=id && s1Fresh(e.first)) out.push_back({e.first,e.second}); } return out; }

  void take(Coord c,int owner,vector<KV>&nbrs);
  void announce();
  void recv(Msg& m);
  void tick();
  void heal(Coord hole);
  void findLeaf(Coord hole, vector<KV>& nbrs, int ttl);
  void promoteInto(Coord hole, vector<KV>& nbrs);
  void doMove(Coord hole, int owner, vector<KV>& nbrs);  // T1: take the NEW seat while still holding the OLD (dual-hold transit)
  void confirmMove();                                    // T1/T3: vacate the old seat (LEAVE carries mvd) + start the tombstone
  void rollbackMove();                                   // T1: contradiction at the new cell — go home to the still-held old seat
  bool moveEvidence(const Msg& m);                       // does this frame evidence my NEW neighbourhood?
  void requeue();
  void serveFind(Msg& m);
  void serveCompact(Msg& m);   // Q2: the up-chain compaction walk (tag==1 FINDs)
  void admit(Coord c,Msg& f);   // f = the FIND being served (nc/ttl, and Q2: tag==1 ⇒ seeker is a SEATED compactor, route the PLACE back)
  void tryCompact();            // Q2: a settled deep leaf probes the home for a strictly-shallower seat
  void onPhone(Msg& m);
  void phoneHome(); void s1Heartbeat(); void s1Sync(); void rowSweep(); void s1Fill(); void attack(); void tlSweep();
  bool ringConfirmDead(Coord h);   // H1-S1: true only after home cell h is unreachable via ALL rook paths for the full ring window (probe-gated)
  void transportLost(int pid);     // D5 intake: MY transport to peer pid died (first-hand) — start the confirm probe NOW
  bool translostConfirmed(uint64_t k);   // D5 verdict: transport-loss registered + probe unanswered on every path for EARLY_HOLD
  void drainOrReenter(); void reseatViaRoster();
  bool nextHopCoord(Coord t, Coord& out);
  int nextHopToward(Coord target,int exclude);
  int gateway=-1;                       // the greeter this (unseated) newcomer routes through
  // A seat HOLDS a relay socket while joining (state!=3), while seated in
  // Section 1 (the greeter pool), or while re-seating with its old seat kept
  // (E1 keep-old: production re-opens the socket on demand, mesh-wire's
  // socket-lifecycle rule). Deep settled seats are socketless. The relay may
  // deliver a frame between two SOCKETED peers — that is the greeting scope,
  // NOT a mesh comm. Everything else must travel over owned links.
  bool socketed() const { return state!=3 || (hasCoord && coord.pc==0); }
  void route(Coord rdst,int rfinal,Msg inner);   // send `inner` over the mesh to coord rdst (rfinal>=0 ⇒ hand to that newcomer at the end)
  bool routeStep(Msg& m);               // in-transit hop: forward, or return true when delivered HERE
  int strictNextHop(Coord rdst);        // next hop toward rdst over an OWNED LINK only (-1 if the ideal link is vacant — no teleport)
  void routeTo(Coord target,int tag);
  void routeToProbe(Coord target);      // D5: probe that AVOIDS the dead direct link (first hop excludes the probed occupant; answer routes back around, tag 3)
  int probeHop(Coord target,int excludeId);   // D5: probe first hop — prefer a DIRECT neighbour of the target that isn't the dead link
  void leave();
};

// ---- fabric send/route/relay ----
static inline uint64_t pairKey(int a,int b){ return a<b? ((uint64_t)a<<32|(uint32_t)b) : ((uint64_t)b<<32|(uint32_t)a); }
// DIAGNOSTIC (increment 0): classify every emit by whether it COULD travel over
// a real P2P DataChannel. NEIGHBOR = to is a tree-link of from (a genuine hop).
// TELEPORT = both seated but NOT adjacent — a multi-hop the perfect bus fakes and
// production can only make via the relay (or real routing). BOOTSTRAP = to/from a
// not-yet-seated joiner (the greeter/relay path). Goal of Option A: TELEPORT -> 0.
static long long EMIT_NEIGHBOR=0, EMIT_TELEPORT=0, EMIT_BOOTSTRAP=0, EMIT_RELAY=0;
static long long TELE_BY_T[32]={0};   // teleports tallied by message type — pinpoints call sites to convert
static long long TELE_SRC[4]={0};   // teleport source: [0]=plain [1]=direct [2]=routing [3]=direct+routing
static const char* MT_NAME(int t){ static const char* NM[]={"GREETERS","WHOHOME","HOME","FIND","FINDLEAF","PLACE","NOROOM","HELLO","YIELD","CLAIM","LEAVE","GREETWALK","S1SYNC","DRAIN","CHALLENGE","CONFIRM","PHONE","PONG","ROUTE","ROUTED","KNOCK","TRANSLOST","MOVED"}; return (t>=0&&t<23)?NM[t]:"?"; }
// A TELEPORT must be IMPOSSIBLE. If a frame is ever about to be delivered to a
// seat the sender has no honest path to (no owned link, not a socketed greeting
// pair), the mesh has a routing bug — so we do NOT quietly count it: we detonate,
// dump everything about the offending hop, and refuse to run one tick further.
static void teleportExplode(int from,int to,const Msg& m){
  Seat* sf=seats[from]; Seat* st=seats[to];
  fflush(stdout);
  fprintf(stderr,"\n\n");
  fprintf(stderr,"########################################################################\n");
  fprintf(stderr,"##                                                                    ##\n");
  fprintf(stderr,"##   >>>>>>>>>>>>>>>   T E L E P O R T   D E T E C T E D   <<<<<<<<<<   ##\n");
  fprintf(stderr,"##                                                                    ##\n");
  fprintf(stderr,"##   A frame is about to reach a seat the sender has NO PATH to.       ##\n");
  fprintf(stderr,"##   The mesh may NEVER teleport. This is a routing BUG — halting.     ##\n");
  fprintf(stderr,"##                                                                    ##\n");
  fprintf(stderr,"########################################################################\n");
  fprintf(stderr,"TICK=%lld   msg=%s   routing=%d direct=%d rttl=%d rvia=#%d\n",
    TICK, MT_NAME((int)m.t), m.routing, m.direct, m.rttl, m.rvia);
  fprintf(stderr,"\nFROM  #%d  state=%d  hasCoord=%d  coord=(%u,%u,%u)  socketed=%d  gateway=#%d\n",
    from, sf->state, sf->hasCoord, sf->coord.pc,sf->coord.r,sf->coord.i, sf->socketed(), sf->gateway);
  fprintf(stderr,"   FROM's owned links and who FROM believes sits at each:\n");
  if(sf->hasCoord){ Coord ol[MAXLINKS]; int n=ownedLinks(sf->coord,ol);
    for(int k=0;k<n;k++){ int occ=sf->occGet(ckey(ol[k])); fprintf(stderr,"      (%u,%u,%u) -> #%d %s\n", ol[k].pc,ol[k].r,ol[k].i, occ, occ==to?"  <-- the TARGET (so why not a neighbor?)":""); } }
  fprintf(stderr,"\nTO    #%d  state=%d  hasCoord=%d  coord=(%u,%u,%u)  socketed=%d  gateway=#%d\n",
    to, st->state, st->hasCoord, st->coord.pc,st->coord.r,st->coord.i, st->socketed(), st->gateway);
  fprintf(stderr,"\nWHY IT WAS NOT ROUTED / RELAYED:\n");
  fprintf(stderr,"   from-socketed=%d  to-socketed=%d  (both-socketed would be a legal relay hop)\n", sf->socketed(), st->socketed());
  fprintf(stderr,"   to-hasCoord=%d  to-gateway=#%d  strictNextHop(from -> to.coord)=#%d\n",
    st->hasCoord, st->gateway, sf->hasCoord? sf->strictNextHop(st->coord) : -999);
  fprintf(stderr,"########################################################################\n\n");
  fflush(stderr);
  abort();
}
static void classifyEmit(int from,int to,const Msg& m){
  int mt=(int)m.t;
  if(from<0 || to<0 || from>=(int)seats.size() || to>=(int)seats.size()){ EMIT_BOOTSTRAP++; return; }
  if(from==to){ EMIT_NEIGHBOR++; return; }   // self-delivery (a routed frame that reached its own destination cell) — local, never a network hop
  Seat* sf=seats[from]; Seat* st=seats[to];
  if(!sf->hasCoord || !st->hasCoord){ EMIT_BOOTSTRAP++; return; }
  // A real link = whom I (the sender) BELIEVE occupies one of my owned-link
  // coords. That is my DataChannel peer, and it stays my peer even if their coord
  // is momentarily stale in the global view — so check MY occ map, not live coords.
  Coord ol[MAXLINKS]; int n=ownedLinks(sf->coord,ol);
  for(int k=0;k<n;k++) if(sf->occGet(ckey(ol[k]))==to){ EMIT_NEIGHBOR++; return; }
  if(sf->socketed() && st->socketed()){ EMIT_RELAY++; return; }   // legit: relay between two socketed peers (greeting scope)
  EMIT_TELEPORT++; if(mt>=0&&mt<32) TELE_BY_T[mt]++;              // BAD: non-adjacent, neither the relay nor a link could carry it
  TELE_SRC[(m.direct?1:0)|(m.routing?2:0)]++;
  if(ROUTE_ENFORCE) teleportExplode(from,to,m);                 // enforcement ON ⇒ a teleport is a bug ⇒ detonate
}
// forcedSever: scenario-driven per-pair link cuts (the D5 "slow peer" probe —
// a severed DataChannel with BOTH endpoints alive). Checked unconditionally,
// unlike NET_SEVER's random severance which is gated on the conditions model.
static unordered_map<uint64_t,long long> forcedSever;
static void schedule(int from,int to,Msg m){
  uint64_t pk=pairKey(from,to);
  classifyEmit(from,to,m);
  if(cutBetween(from,to)) return;   // TOTAL PARTITION: endpoints are on opposite sides of the cut — the transport drops it
  if(!forcedSever.empty() && from>=0 && to>=0){ auto it=forcedSever.find(pk); if(it!=forcedSever.end()){ if(it->second>TICK) return; forcedSever.erase(it); } }   // scenario severance: the link is dead, both seats live

  bool cond = (NUM_SUBNETS>1 || NET_LOSS>0 || NET_SEVER>0 || NET_LAT>1 || NET_QUAL_MIN<1.0);
  if(cond && from>=0 && to>=0 && from<(int)seats.size() && to<(int)seats.size()){
    Seat* sf=seats[from]; Seat* st=seats[to];
    // (a) reachability: mutually-unreachable subnets can't form a direct P2P link -> DROP (mesh heals/routes around it)
    if(NUM_SUBNETS>1 && !reachable(sf->subnet, st->subnet)) return;
    // (b) severance: an established link occasionally goes dead for a window
    if(NET_SEVER>0){ auto it=severedUntil.find(pk);
      if(it!=severedUntil.end()){ if(it->second>TICK) return; severedUntil.erase(it); }
      if(openPairs.count(pk) && frnd()<NET_SEVER){ severedUntil[pk]=TICK+40+(long long)(frnd()*160); return; } }
    double q = min(sf->netQual, st->netQual);   // the worse endpoint dominates
    // (c) loss: bad links drop frames -> sender never acks -> lastAck climbs -> heal/drain fire for real
    if(NET_LOSS>0 && frnd() < NET_LOSS*(1.0+2.0*(1.0-q))) return;
    // (d) latency: 1..NET_LAT established spread + a device/link penalty, atop the first-contact establishment cost
    int spread = (NET_LAT>1)? 1+(int)(frnd()*NET_LAT) : 1+(int)(SEQ&1);
    int qp = (q<1.0)? (int)((1.0-q)*4.0*frnd()) : 0;
    int d; if(openPairs.count(pk)) d=spread+qp; else { openPairs.insert(pk); d=4+(int)(SEQ%5)+spread+qp; }
    m.to=to; m.from=from; SEQ++; bus[TICK+d].push_back(move(m)); return;
  }
  int d; if(openPairs.count(pk)) d=1+(SEQ&1); else { openPairs.insert(pk); d=4+(int)(SEQ%5); }
  m.to=to; m.from=from; SEQ++;
  bus[TICK+d].push_back(move(m));
}
void Seat::emit(int to,const Msg& m){
  // Option A: a seated seat may only hand a frame to a seat it holds a real
  // owned-link (DataChannel) to. If `to` is a seated NON-neighbor, ROUTE the
  // frame over the mesh toward its coord instead of teleporting it there. (An
  // already-routing frame is going to its next hop — a neighbor — so it passes
  // through untouched; unseated endpoints are the bootstrap/gateway path.)
  if(ROUTE_ENFORCE && !m.routing && !m.direct && to>=0 && to<(int)seats.size() && to!=id){
    Seat* st=seats[to];
    bool directLink=false;
    // Do I BELIEVE `to` occupies one of my owned links? Then I hold a link (DC) to
    // them — deliver direct. Uses MY occ view (matches the faithfulness metric), so
    // a stale global coord never turns a real link-send into a route or a teleport.
    if(hasCoord){ Coord ol[MAXLINKS]; int n=ownedLinks(coord,ol); for(int k=0;k<n;k++) if(occGet(ckey(ol[k]))==to){ directLink=true; break; } }
    if(!directLink){
      if(socketed() && st->socketed()){ /* relay path — both hold sockets (greeting scope): fall through to direct schedule */ }
      else if(st->hasCoord){ route(st->coord,-1,m); return; }                                   // deep target ⇒ route over the mesh
      else if(st->gateway>=0 && st->gateway<(int)seats.size() && seats[st->gateway]->hasCoord){ route(seats[st->gateway]->coord, to, m); return; } // unseated target ⇒ via its gateway
      else return;                                                                              // unreachable right now ⇒ drop, caller retries
    }
  }
  if(PAR){ tlsOut[curTid()].push_back({id,to,m}); } else { Msg mm=m; schedule(id,to,move(mm)); }
}
static void relayKnock(int id,uint64_t presentedKey);
void Seat::emitRelay(uint64_t presentedKey){ if(PAR){ tlsRelay[curTid()].push_back({id,presentedKey}); } else { relayKnock(id, presentedKey); } }
static void relayKnock(int id,uint64_t presentedKey){
  // R2/R3: the relay knows only a GENESIS KEY + a TTL'd GREETER LIST for this
  // hashed URL. Expire stale entries; an empty list forgets the key (fresh
  // genesis available). Hand back the current list. Then ADMIT: an empty list
  // means this knocker MINTS the genesis (it founds); otherwise it is added only
  // if it presents the MATCHING key — proof it did the newcomer dance with a
  // real member. A wrong-key knocker gets the list but never pollutes it.
  for(auto it=relayGreeters.begin(); it!=relayGreeters.end();){ if(it->second<TICK || it->first>=(int)alive.size() || !alive[it->first]) it=relayGreeters.erase(it); else ++it; }
  if(relayGreeters.empty()) relayGenesisKey=0;
  vector<int> out; for(auto&e:relayGreeters) if(e.first!=id) out.push_back(e.first);
  for(int k=(int)out.size()-1;k>0;k--){int j=(int)(grnd()*(k+1)); swap(out[k],out[j]);}   // shuffle
  Msg m; m.t=GREETERS; m.list=out; m.to=id; m.from=-1; bus[TICK+1].push_back(move(m));
  if(relayGreeters.empty()){ relayGenesisKey=keyHash(presentedKey); relayGreeters[id]=TICK+RELAY_TTL; }        // mint genesis — store only H(key)
  else if(keyHash(presentedKey)==relayGenesisKey && (int)relayGreeters.size()<RELAY_CAP){ relayGreeters[id]=TICK+RELAY_TTL; }   // proven member (H(key) matches): (re)admit + refresh TTL
}

// (seat method bodies continue in mesh_seat.inc)
#include "mesh_seat.inc"

// ---- run / service ----
static vector<vector<int>> spawnPlan;
static int nextId=0, joinWindow=0; static long long MAXP=0;
// D5: model the transport layer noticing a dead/severed peer. Every seat that
// BELIEVES the target id occupies one of its owned-link coords holds a
// "DataChannel" to it (exactly the production wiring), and that channel's death
// is observed ~2-6 ticks later (the real DC close / hard pc failure lands in
// ~1-5s). Delivered as a fabric EVENT frame (from=-1, like GREETERS): it is an
// observation of MY OWN link — no peer can send it, gossip can never mint it.
static void fireTranslost(int deadId){
  for(int q=0;q<nextId;q++){ if(!alive[q]||q==deadId) continue; Seat*s=seats[q]; if(!s->hasCoord) continue;
    Coord ol[MAXLINKS]; int n=ownedLinks(s->coord,ol); bool linked=false;
    for(int k=0;k<n&&!linked;k++) if(s->occGet(ckey(ol[k]))==deadId) linked=true;
    if(!linked) continue;
    Msg m; m.t=TRANSLOST; m.id=deadId; m.to=q; m.from=-1; bus[TICK+2+(int)(grnd()*4)].push_back(move(m)); }
}
static void spawnDue(){ if(TICK<(long long)spawnPlan.size()) for(int k:spawnPlan[TICK]){ int id=nextId++; seats[id]=new Seat(id); alive[id]=1;
    if(NUM_SUBNETS>1) seats[id]->subnet=(int)(frnd()*NUM_SUBNETS);
    if(NET_QUAL_MIN<1.0) seats[id]->netQual=NET_QUAL_MIN+frnd()*(1.0-NET_QUAL_MIN);
    seats[id]->join(); } }
// serial merge of every thread's outbox into the shared fabric, in canonical
// thread order (t=0..NTHREADS), so a given (seed,threads) run is reproducible.
static void flushTls(){
  for(int t=0;t<NTHREADS;t++){
    for(auto&p:tlsOut[t]) schedule(p.from,p.to,move(p.m));
    tlsOut[t].clear();
    for(auto&r:tlsRelay[t]) relayKnock(r.first,r.second);
    tlsRelay[t].clear();
    for(int w:tlsWake[t]) nextActive.insert(w);
    tlsWake[t].clear();
    MOVES+=tlsMoves[t]; EVICTIONS+=tlsEvict[t]; tlsMoves[t]=0; tlsEvict[t]=0;
  }
}
// parallel tick: partition this tick's inbox + active set by id%NTHREADS; each
// thread recv+ticks its own shard (no shared reads between seats), buffering all
// sends. Recipients of this tick's delivery also tick this tick (matches serial).
static vector<vector<Msg>> inboxBuf; static vector<vector<int>> actBuf;
static void doTickPar(){
  spawnDue();                                              // serial (PAR=false → inline)
  inboxBuf.assign(NTHREADS,{}); actBuf.assign(NTHREADS,{});
  auto it=bus.find(TICK);
  if(it!=bus.end()){ for(auto&m:it->second){ if(m.to>=0 && m.to<(int)seats.size() && alive[m.to]) inboxBuf[m.to%NTHREADS].push_back(move(m)); } bus.erase(it); }
  active.swap(nextActive); nextActive.clear();
  for(int id: active){ if(id<nextId && alive[id]) actBuf[id%NTHREADS].push_back(id); }
  PAR=true;
  #pragma omp parallel num_threads(NTHREADS)
  {
    int t=curTid();
    unordered_set<int> tickset;
    for(int id:actBuf[t]) tickset.insert(id);
    for(auto&m:inboxBuf[t]){ if(alive[m.to]){ seats[m.to]->recv(m); tickset.insert(m.to); } }
    if(DETERM){ vector<int> v(tickset.begin(),tickset.end()); sort(v.begin(),v.end()); for(int id:v) if(alive[id]) seats[id]->tick(); }
    else { for(int id:tickset) if(alive[id]) seats[id]->tick(); }
  }
  PAR=false;
  flushTls();
}
static void doTick(){
  if(NTHREADS>1){ doTickPar(); return; }
  spawnDue();
  auto it=bus.find(TICK);
  if(it!=bus.end()){ for(auto&m:it->second){ if(m.to>=0 && m.to<(int)seats.size() && alive[m.to]){ seats[m.to]->recv(m); wake(m.to);} } bus.erase(it); }
  active.swap(nextActive); nextActive.clear();
  for(int id: active){ if(id<nextId && alive[id]) seats[id]->tick(); }
}
static long long DUPS_G=0; static void counts(long long&seated,long long&s1c){ seated=0; static unordered_set<uint64_t> s1cells, allc; s1cells.clear(); allc.clear(); DUPS_G=0; for(int i=0;i<nextId;i++){ if(alive[i]&&seats[i]->state==3){seated++; uint64_t k=ckey(seats[i]->coord); if(allc.count(k))DUPS_G++; else allc.insert(k); if(seats[i]->coord.pc==0) s1cells.insert(k);} } s1c=(long long)s1cells.size(); }
static string coordStr(Coord c){ // decode pc to base-5 path string
  string p; uint32_t pc=c.pc; vector<int> d; while(pc){d.push_back(lastDigit(pc)); pc=parentPath(pc);} for(int a=(int)d.size()-1;a>=0;a--) p+=('0'+d[a]);
  char b[64]; snprintf(b,64,"%s/%d.%d",p.c_str(),c.r,c.i); return b; }
// ARRIVAL PATTERN (the `joinmode` op; applies to the NEXT init).
// The default spreads arrivals uniformly at random over a window proportional
// to N, which is ONE pattern out of several a real room sees — and not the
// hard ones. A meeting fills by people trickling in one at a time, by a class
// or a conference call arriving in clumps, and by everyone hitting the link at
// the top of the hour. Each stresses admission differently: serial arrivals
// exercise the seed/handshake path with no concurrency to hide behind, batches
// exercise several admitters racing on the same frontier, and a burst exercises
// genesis + the whole C1 frontier at once.
//   window W   (default) uniform random over W ticks; W<=0 ⇒ the N-scaled default
//   burst      ALL N at tick 0 — the thundering herd
//   batch K E  groups of K every E ticks
//   serial E   one seat every E ticks — strictly one at a time
static string JOINMODE="window"; static int JM_A=0, JM_B=0;
static void initSim(int n,double leave){
  GSEED=SEED0; PARTITIONED=false; partSide.clear();   // reproducible per SEED0; a fresh room is never partitioned
  N=n; LEAVEFRAC=leave; MAXP=(long long)N*30+60000;
  if(JOINMODE=="burst")       joinWindow=1;
  else if(JOINMODE=="batch")  joinWindow=max(1,((N+max(1,JM_A)-1)/max(1,JM_A))*max(1,JM_B)+1);
  else if(JOINMODE=="serial") joinWindow=max(1,N*max(1,JM_A)+1);
  else                        joinWindow=(JM_A>0?JM_A:max(1,min((int)(N*0.25),2000)));
  size_t cap=(size_t)N+(size_t)(N*0.6)+16; seats.assign(cap,nullptr); alive.assign(cap,0);
  spawnPlan.assign(joinWindow+1,{});
  for(int k=0;k<N;k++){
    int t;
    if(JOINMODE=="burst")       t=0;
    else if(JOINMODE=="batch")  t=(k/max(1,JM_A))*max(1,JM_B);
    else if(JOINMODE=="serial") t=k*max(1,JM_A);
    else                        t=(int)(grnd()*joinWindow);
    if(t>joinWindow) t=joinWindow;
    spawnPlan[t].push_back(k);
  }
  TICK=0; nextId=0;
  FSEED=20260714; severedUntil.clear(); buildReach();   // reset fabric rng + reachability for a reproducible conditioned run
}
// Kill a fraction of live seats (the REAL departure path — leave() unless
// silent). Shared by the service `kill` command and batch churn, so `./mesh N f`
// finally does what the README always claimed: JOIN then heal a real departure.
static long long killFraction(double frac,const string& mode){
  vector<int> ids; for(int q=0;q<nextId;q++) if(alive[q]) ids.push_back(q);
  int nk=(int)(N*frac); vector<int> pick; { unordered_set<int> u; while((int)pick.size()<nk && pick.size()<ids.size()){ int j=(int)(grnd()*ids.size()); if(!u.count(j)){u.insert(j);pick.push_back(ids[j]);} } }
  unordered_set<int> ks(pick.begin(),pick.end());
  if(mode=="s1row"){ int rr=(int)(grnd()*C); for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&seats[q]->coord.pc==0&&seats[q]->coord.r==rr)ks.insert(q); }
  if(mode=="s1all"){ for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&seats[q]->coord.pc==0)ks.insert(q); }
  if(mode=="silent"){ for(int q:ks){ alive[q]=0; active.erase(q); } } else for(int q:ks) seats[q]->leave();
  N-=(int)ks.size(); return (long long)ks.size();
}
// advance until converged (seated==N && s1 full) or cap; returns ticks used
static long long converge(long long cap){ long long seated,s1c; long long start=TICK; long long tgt=min((long long)25,(long long)N); long long best=-1, bestT=TICK; long long goodSince=-1; while(TICK<start+cap){ doTick(); TICK++; if(TICK%64==0){ counts(seated,s1c); if(seated==N && s1c==tgt && DUPS_G==0) return TICK; bool good=(s1c==tgt && seated>=(long long)(N*0.99)); if(good){ if(goodSince<0)goodSince=TICK; if(TICK-goodSince>6000) return TICK; } else goodSince=-1; } } return TICK; }

int main(int argc,char**argv){
  // batch: ./mesh N [leaveFrac] [--threads=W] [--det]  |  service: ./mesh --service [--threads=W] [--det]
  bool service=false; int wthreads=1;
  for(int a=1;a<argc;a++){ string s=argv[a];
    if(s=="--service") service=true;
    else if(s.rfind("--threads=",0)==0) wthreads=max(1,atoi(s.c_str()+10));
    else if(s=="--det") DETERM=true;
    else if(s=="--allow-teleport") ROUTE_ENFORCE=false; }   // A/B only: revert to the old perfect-bus (teleports counted, not fatal)
  tlsResize(wthreads);
  if(!service){
    int n=argc>1?atoi(argv[1]):10000; double lv=argc>2?atof(argv[2]):0;
    initSim(n,lv); auto t0=chrono::steady_clock::now();
    long long conv=converge(MAXP);
    double secs=chrono::duration<double>(chrono::steady_clock::now()-t0).count();
    long long seated,s1c; counts(seated,s1c);
    printf("  after JOIN: %s [seated=%lld/%d, s1=%lld, converged@%lld, %lld ticks, %.2fs, %.0fk ticks/s]\n",
      (seated==n&&s1c==min(25,n))?"OK":"INCOMPLETE", seated,n,s1c,conv,TICK,secs, TICK/secs/1000.0);
    if(lv>0){   // REAL churn: kill lv-fraction, then heal (leaveFrac used to be a dead no-op — this is the actual departure test)
      long long killed=killFraction(lv,""); auto h0=chrono::steady_clock::now();
      long long hconv=converge(MAXP); double hsecs=chrono::duration<double>(chrono::steady_clock::now()-h0).count();
      counts(seated,s1c);
      printf("  after HEAL: %s [killed=%lld, seated=%lld/%d, s1=%lld, healed@%lld, %.2fs]\n",
        (seated==N && s1c==min((long long)25,(long long)N) && DUPS_G==0)?"OK":"INCOMPLETE", killed, seated, N, s1c, hconv, hsecs);
    }
    long long tot=EMIT_NEIGHBOR+EMIT_TELEPORT+EMIT_BOOTSTRAP+EMIT_RELAY;
    printf("  EMIT TRANSPORT: neighbor=%lld (%.1f%%)  relay(socketed pair)=%lld (%.1f%%)  TELEPORT(faked)=%lld (%.1f%%)  bootstrap=%lld (%.1f%%)  [total=%lld]\n",
      EMIT_NEIGHBOR, tot?100.0*EMIT_NEIGHBOR/tot:0, EMIT_RELAY, tot?100.0*EMIT_RELAY/tot:0, EMIT_TELEPORT, tot?100.0*EMIT_TELEPORT/tot:0, EMIT_BOOTSTRAP, tot?100.0*EMIT_BOOTSTRAP/tot:0, tot);
    { printf("  TELEPORTS BY TYPE:"); for(int i=0;i<23;i++) if(TELE_BY_T[i]) printf(" %s=%lld",MT_NAME(i),TELE_BY_T[i]); printf("\n"); }
    printf("  TELEPORT SOURCE: plain=%lld direct(handoff)=%lld routing=%lld direct+routing=%lld\n", TELE_SRC[0],TELE_SRC[1],TELE_SRC[2],TELE_SRC[3]);
    return 0;
  }
  // ---- SERVICE: read commands on stdin, answer on stdout ----
  setvbuf(stdout,nullptr,_IOLBF,0);
  printf("READY gifos-mesh-sim service\n");
  string line;
  char buf[4096];
  while(fgets(buf,sizeof(buf),stdin)){
    string cmd(buf); while(!cmd.empty()&&(cmd.back()=='\n'||cmd.back()=='\r'))cmd.pop_back();
    // tokenize
    vector<string> tk; { string cur; for(char c:cmd){ if(c==' '){ if(cur.size()){tk.push_back(cur);cur.clear();} } else cur+=c; } if(cur.size())tk.push_back(cur); }
    if(tk.empty()) continue;
    string op=tk[0];
    if(op=="quit"||op=="exit"){ printf("BYE\n"); break; }
    else if(op=="seed"){ SEED0=(uint32_t)(tk.size()>1?strtoul(tk[1].c_str(),nullptr,10):20260714); GSEED=SEED0; printf("OK seed=%u\n",SEED0); }
    else if(op=="init"){ int n=tk.size()>1?atoi(tk[1].c_str()):10000; double lv=tk.size()>2?atof(tk[2].c_str()):0; initSim(n,lv); printf("OK init N=%d leave=%.2f seed=%u join=%s(%d,%d) window=%d\n",n,lv,SEED0,JOINMODE.c_str(),JM_A,JM_B,joinWindow); }
    // joinmode <window W|burst|batch K E|serial E> — the ARRIVAL PATTERN for the next init
    else if(op=="joinmode"){ JOINMODE=tk.size()>1?tk[1]:"window"; JM_A=tk.size()>2?atoi(tk[2].c_str()):0; JM_B=tk.size()>3?atoi(tk[3].c_str()):0; printf("OK joinmode %s a=%d b=%d\n",JOINMODE.c_str(),JM_A,JM_B); }
    else if(op=="split"){   // TOTAL NETWORK PARTITION: cut every link between two live seat-groups, all seats stay ALIVE. `split [fracB]` — fraction of live seats put on side B (default .5)
      double fb=tk.size()>1?atof(tk[1].c_str()):0.5; partSide.assign(nextId,0); int liveN=0,bN=0;
      for(int q=0;q<nextId;q++) if(alive[q]){ liveN++; if(grnd()<fb){ partSide[q]=1; bN++; } }
      PARTITIONED=true; printf("OK split: sideA=%d sideB=%d (all alive, cross-links cut)\n", liveN-bN, bN); }
    else if(op=="heal_net"||op=="join_net"){ PARTITIONED=false; printf("OK partition removed (links restored)\n"); }
    else if(op=="splitstate"){   // per-side convergence: seated / distinct Section-1 cells / duplicates, on each side of the cut
      long long seatA=0,seatB=0; unordered_set<uint64_t> s1A,s1B,allA,allB; long long dupA=0,dupB=0;
      for(int q=0;q<nextId;q++){ if(!alive[q]||seats[q]->state!=3) continue; int s=(q<(int)partSide.size())?partSide[q]:0; uint64_t k=ckey(seats[q]->coord);
        if(s==0){ seatA++; if(allA.count(k))dupA++; else allA.insert(k); if(seats[q]->coord.pc==0)s1A.insert(k); }
        else    { seatB++; if(allB.count(k))dupB++; else allB.insert(k); if(seats[q]->coord.pc==0)s1B.insert(k); } }
      // count live seats + stranded per side (denominator)
      long long liveA=0,liveB=0,strA=0,strB=0; for(int q=0;q<nextId;q++) if(alive[q]){ int s=(q<(int)partSide.size())?partSide[q]:0; if(s==0){liveA++; if(seats[q]->stranded)strA++;} else {liveB++; if(seats[q]->stranded)strB++;} }
      printf("SPLITSTATE A[seated=%lld/%lld s1=%zu dups=%lld strand=%lld] B[seated=%lld/%lld s1=%zu dups=%lld strand=%lld]\n", seatA,liveA,s1A.size(),dupA,strA, seatB,liveB,s1B.size(),dupB,strB); }
    else if(op=="check"){   // LOUD invariant assertion: everyone seated, Section 1 full, 0 dups, 0 stranded. Non-fatal report (sweep greps CHECK); `check strict` ABORTS on failure.
      bool strict=tk.size()>1 && tk[1]=="strict";
      long long seated,s1c; counts(seated,s1c); int strand=0; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->stranded) strand++;
      // T (amended law): a TRANSIT hold is legal, an EXPIRED one is not — no live
      // seat may still carry a claim/seek/lease past its self-expiry window.
      int transStale=0; for(int q=0;q<nextId;q++) if(alive[q]){ Seat*s=seats[q];
        if(s->moving && TICK-s->moveAt>CONFIRM_TTL*2+8) transStale++;
        if(s->leaseUntil>=0 && TICK>s->leaseUntil+8) transStale++; }
      string why; if(seated!=N) why+=" seated="+to_string(seated)+"/"+to_string(N); if(s1c!=min((long long)25,(long long)N)) why+=" s1="+to_string(s1c)+"/25"; if(DUPS_G!=0) why+=" dups="+to_string(DUPS_G); if(strand!=0) why+=" stranded="+to_string(strand); if(EMIT_TELEPORT!=0) why+=" teleport="+to_string(EMIT_TELEPORT); if(transStale!=0) why+=" transitStale="+to_string(transStale);
      if(why.empty()) printf("CHECK PASS seed=%u [seated=%lld/%d s1=%lld dups=%lld stranded=0 teleport=0]\n",SEED0,seated,N,s1c,DUPS_G);
      else { printf("CHECK FAIL seed=%u%s\n",SEED0,why.c_str()); if(strict){ fprintf(stderr,"CHECK FAIL (strict) seed=%u%s — HALTING\n",SEED0,why.c_str()); abort(); } } }
    else if(op=="tick"){ int n=tk.size()>1?atoi(tk[1].c_str()):1; for(int q=0;q<n;q++){doTick();TICK++;} printf("OK tick now=%lld\n",TICK); }
    else if(op=="threads"){ int w=tk.size()>1?max(1,atoi(tk[1].c_str())):1; tlsResize(w); printf("OK threads=%d det=%d\n",NTHREADS,(int)DETERM); }
    else if(op=="det"){ DETERM=(tk.size()>1 && (tk[1]=="on"||tk[1]=="1")); printf("OK det=%d\n",(int)DETERM); }
    else if(op=="net"){   // net loss=.. lat=.. sever=.. subnets=.. density=.. qual=..   (set BEFORE init)
      for(size_t z=1;z<tk.size();z++){ auto&t=tk[z]; size_t e=t.find('='); if(e==string::npos)continue; string k=t.substr(0,e); double v=atof(t.substr(e+1).c_str());
        if(k=="loss")NET_LOSS=v; else if(k=="lat")NET_LAT=(int)v; else if(k=="sever")NET_SEVER=v; else if(k=="subnets")NUM_SUBNETS=max(1,(int)v); else if(k=="density")REACH_DENSITY=v; else if(k=="qual")NET_QUAL_MIN=v; else if(k=="spine")NET_SPINE=(int)v; else if(k=="relayk")RELAY_K=(int)v; }
      printf("OK net loss=%.4f lat=%d sever=%.4f subnets=%d density=%.2f qual=%.2f spine=%d relayk=%d\n",NET_LOSS,NET_LAT,NET_SEVER,NUM_SUBNETS,REACH_DENSITY,NET_QUAL_MIN,NET_SPINE,RELAY_K); }
    else if(op=="subnets"){   // measure: subtree subnet-clustering + does Section 1 span mutually-unreachable subnets?
      // Section-1 subnet spread + reachability of its internal mesh
      vector<int> s1sub; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state==3&&seats[q]->coord.pc==0) s1sub.push_back(seats[q]->subnet);
      int badpairs=0; for(size_t a=0;a<s1sub.size();a++) for(size_t b=a+1;b<s1sub.size();b++) if(!reachable(s1sub[a],s1sub[b])) badpairs++;
      // subtree purity: for each top section i (path digit), what fraction of its members share the modal subnet
      unordered_map<uint32_t,unordered_map<int,int>> secSub;   // top-section pc -> {subnet: count}
      for(int q=0;q<nextId;q++){ if(!alive[q]||seats[q]->state!=3) continue; uint32_t pc=seats[q]->coord.pc; if(pc==0) continue; while(parentPath(pc)!=0) pc=parentPath(pc); secSub[pc][seats[q]->subnet]++; }
      double puritySum=0; int nsec=0; for(auto&s:secSub){ int tot=0,mx=0; for(auto&e:s.second){ tot+=e.second; if(e.second>mx)mx=e.second; } if(tot>0){ puritySum+=(double)mx/tot; nsec++; } }
      printf("SUBNETS s1_span=%zu s1_unreachable_pairs=%d subtree_purity=%.2f (nsec=%d) [purity 1.0 = each section is one subnet]\n", s1sub.size(), badpairs, nsec?puritySum/nsec:1.0, nsec); }
    else if(op=="media"){
      // MEDIA PLANE: media rides the REACHABLE edges only (unreachable direct links can't carry A/V,
      // so it must route around). Reports per-tier: effective latency (hops), reachability gaps, forwarder load.
      unordered_map<uint64_t,int> at; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state==3) at[ckey(seats[q]->coord)]=q;
      auto rmedia=[&](int a,int b){ return reachable(seats[a]->subnet, seats[b]->subnet); };   // can this edge carry media?
      auto nbrs=[&](int q, vector<int>&out){ out.clear(); Coord ol[MAXLINKS]; int n=ownedLinks(seats[q]->coord,ol); for(int k=0;k<n;k++){ auto it=at.find(ckey(ol[k])); if(it!=at.end()&&it->second!=q&&rmedia(q,it->second)) out.push_back(it->second); } };
      // --- STAGE / STADIUM: broadcast BFS from (0,0,0) over the reachable media graph ---
      int src = at.count(ckey({0,0,0}))? at[ckey({0,0,0})] : -1;
      int seatedN=(int)at.size(), maxDepth=0, cutoff=0, maxFan=0; double weakFanQual=1.0; int weakFanFan=0;
      if(src>=0){ unordered_map<int,int> depth, fan; vector<int> Q={src}; depth[src]=0; size_t h=0; vector<int> nb;
        while(h<Q.size()){ int u=Q[h++]; nbrs(u,nb); for(int v:nb){ if(!depth.count(v)){ depth[v]=depth[u]+1; fan[u]++; if(depth[v]>maxDepth)maxDepth=depth[v]; Q.push_back(v);} } }
        cutoff=seatedN-(int)depth.size();
        for(auto&e:fan){ if(e.second>maxFan)maxFan=e.second; if((double)e.second/max(0.01,seats[e.first]->netQual) > weakFanFan/max(0.01,weakFanQual)){ weakFanFan=e.second; weakFanQual=seats[e.first]->netQual; } } }
      // --- ROW: direct row-mate edges that CAN'T carry media (topology put an unreachable peer in your row) ---
      int rowEdges=0,rowGap=0; for(int q=0;q<nextId;q++){ if(!alive[q]||seats[q]->state!=3) continue; Coord c=seats[q]->coord; Coord rm[C-1]; rowMates(c,rm); for(int k=0;k<C-1;k++){ auto it=at.find(ckey(rm[k])); if(it!=at.end()){ rowEdges++; if(!rmedia(q,it->second)) rowGap++; } } }
      // --- SECTION: how many top-sections are internally SPLIT over reachable media edges ---
      unordered_map<uint32_t,vector<int>> sec; for(int q=0;q<nextId;q++){ if(!alive[q]||seats[q]->state!=3) continue; uint32_t pc=seats[q]->coord.pc; if(pc==0)continue; while(parentPath(pc)!=0)pc=parentPath(pc); sec[pc].push_back(q); }
      int secSplit=0; vector<int> nb; for(auto&s:sec){ if(s.second.size()<2)continue; unordered_set<int> vis; vector<int> Q={s.second[0]}; vis.insert(s.second[0]); size_t h=0; unordered_set<int> members(s.second.begin(),s.second.end());
        while(h<Q.size()){ int u=Q[h++]; nbrs(u,nb); for(int v:nb){ if(members.count(v)&&!vis.count(v)){ vis.insert(v); Q.push_back(v);} } } if(vis.size()<s.second.size()) secSplit++; }
      // --- TRUE partition: a seat is unreachable AT ALL (even via relay) iff its subnet is in a different component than the source ---
      int trueCut=0; if(NUM_SUBNETS>1 && src>=0){ vector<int> comp=subnetComp(); int sc=comp[seats[src]->subnet]; for(auto&kv:at) if(comp[seats[kv.second]->subnet]!=sc) trueCut++; }
      // --- RELAY-ASSIST (item 1): media may open a relay to ANY reachable peer, bounded to RELAY_K adopted takers per node
      //     (one-taker-per-giver + chain => small K spreads load into a chain). Report the achievable depth + the bounded load. ---
      int rdepth=-1, rmaxload=0, rcut=0;
      if(RELAY_K>0 && src>=0){
        vector<vector<int>> bySub(NUM_SUBNETS); for(auto&kv:at) bySub[seats[kv.second]->subnet].push_back(kv.second);
        vector<size_t> cur(NUM_SUBNETS,0); unordered_set<int> vis; vis.insert(src);
        vector<int> frontier={src}; long long remaining=(long long)at.size()-1; rdepth=0;
        while(remaining>0 && !frontier.empty()){ vector<int> next;
          for(int u:frontier){ int su=seats[u]->subnet, adopted=0;
            for(int sv=0; sv<NUM_SUBNETS && adopted<RELAY_K; sv++){ if(!reachMx[su][sv])continue;
              while(cur[sv]<bySub[sv].size() && adopted<RELAY_K){ int v=bySub[sv][cur[sv]++]; if(vis.count(v))continue; vis.insert(v); next.push_back(v); adopted++; remaining--; } }
            if(adopted>rmaxload)rmaxload=adopted; }
          frontier=next; if(!next.empty())rdepth++; }
        rcut=(int)at.size()-(int)vis.size();
      }
      printf("MEDIA seated=%d | STAGE/STADIUM: bcast_depth=%d cutoff=%d TRUE_partition=%d max_fanout=%d weakest_fwd(fan=%d,qual=%.2f)",
        seatedN, maxDepth, cutoff, trueCut, maxFan, weakFanFan, weakFanQual);
      if(RELAY_K>0) printf(" | RELAY-ASSIST k=%d: depth=%d max_relay_load=%d uncovered=%d", RELAY_K, rdepth, rmaxload, rcut);
      printf(" | ROW: gap_edges=%d/%d (%.1f%%) | SECTION: split=%d/%zu\n",
        rowGap, rowEdges, rowEdges?100.0*rowGap/rowEdges:0.0, secSplit, sec.size()); }
    else if(op=="medialocal"){
      // ROW/SECTION relay, SPANNING-TREE + MULTI-HOP: media flows over a spanning distribution, not
      // all-pairs. Union-find the scope members over reachable pairs (in-scope takers chain freely, any
      // #hops). If the scope is ONE component -> covered by members alone (0 pure givers). If it SPLITS,
      // each extra component is bridged by a PURE GIVER outside the scope, capped at ONE taker; if no
      // bridge exists it's a TRUE partition (uncoverable). Reports coverage + max pure-giver load.
      unordered_map<uint64_t,int> at; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state==3) at[ckey(seats[q]->coord)]=q;
      unordered_map<int,int> pureLoad;
      auto Rq=[&](int a,int b){ return reachable(seats[a]->subnet, seats[b]->subnet); };
      auto relayScope=[&](vector<int>&scope,int&covered,int&bridged,int&pureUsed,int&uncov,int&maxPure,int&maxComp){
        int n=(int)scope.size(); vector<int> uf(n); for(int i=0;i<n;i++)uf[i]=i;
        auto find=[&uf](int x){ while(uf[x]!=x){uf[x]=uf[uf[x]];x=uf[x];} return x; };
        for(int i=0;i<n;i++) for(int j=i+1;j<n;j++) if(Rq(scope[i],scope[j])) uf[find(i)]=find(j);
        unordered_map<int,vector<int>> comps; for(int i=0;i<n;i++) comps[find(i)].push_back(i);
        if((int)comps.size()>maxComp)maxComp=(int)comps.size();
        if(comps.size()==1){ covered++; return; }
        bridged++; unordered_set<int> inScope(scope.begin(),scope.end());
        unordered_set<int> conn; auto it0=comps.begin(); for(int idx:it0->second) conn.insert(scope[idx]);
        for(auto it=next(comps.begin()); it!=comps.end(); ++it){ bool ok=false;
          for(auto&kv:at){ int X=kv.second; if(inScope.count(X)) continue; if(pureLoad.count(X)&&pureLoad[X]>=1) continue;
            bool rc=false; for(int c:conn) if(Rq(c,X)){rc=true;break;} if(!rc)continue;
            bool rn=false; for(int idx:it->second) if(Rq(scope[idx],X)){rn=true;break;} if(!rn)continue;
            pureLoad[X]++; if(pureLoad[X]>maxPure)maxPure=pureLoad[X]; pureUsed++; ok=true; for(int idx:it->second) conn.insert(scope[idx]); break; }
          if(!ok) uncov++; }
      };
      int rC=0,rB=0,rP=0,rU=0,rMx=0,rComp=0; unordered_set<uint64_t> seenRow;
      for(int q=0;q<nextId;q++){ if(!alive[q]||seats[q]->state!=3)continue; Coord c=seats[q]->coord; uint64_t rk=ckey({c.pc,c.r,0}); if(seenRow.count(rk))continue; seenRow.insert(rk);
        vector<int> row; for(int j=0;j<C;j++){ auto it=at.find(ckey({c.pc,c.r,(uint8_t)j})); if(it!=at.end())row.push_back(it->second);} if(row.size()>1) relayScope(row,rC,rB,rP,rU,rMx,rComp); }
      int sC=0,sB=0,sP=0,sU=0,sMx=0,sComp=0; unordered_map<uint32_t,vector<int>> sec;
      for(int q=0;q<nextId;q++){ if(!alive[q]||seats[q]->state!=3)continue; uint32_t pc=seats[q]->coord.pc; if(pc==0)continue; while(parentPath(pc)!=0)pc=parentPath(pc); sec[pc].push_back(q); }
      for(auto&s:sec) if(s.second.size()>1) relayScope(s.second,sC,sB,sP,sU,sMx,sComp);
      printf("MEDIALOCAL ROW: covered=%d split_bridged=%d pure_givers=%d uncovered=%d (max_comp=%d) | SECTION: covered=%d split_bridged=%d pure_givers=%d uncovered=%d (max_comp=%d) | max_pure_giver_load=%d (rule cap=1)\n",
        rC,rB,rP,rU,rComp, sC,sB,sP,sU,sComp, max(rMx,sMx)); }
    else if(op=="converge"){ long long cap=tk.size()>1?atoll(tk[1].c_str()):MAXP; auto t0=chrono::steady_clock::now(); long long c=converge(cap); double secs=chrono::duration<double>(chrono::steady_clock::now()-t0).count(); printf("%s converged@%lld tick=%lld %.2fs %.0fk/s\n", c>=0?"OK":"TIMEOUT", c, TICK, secs, TICK/(secs>0?secs:1)/1000.0); }
    else if(op=="state"){ long long seated,s1c; counts(seated,s1c); size_t busq=0; for(auto&b:bus)busq+=b.second.size(); int strand=0,ntr=0,nls=0; for(int q=0;q<nextId;q++) if(alive[q]){ if(seats[q]->stranded)strand++; if(seats[q]->moving)ntr++; if(seats[q]->leaseUntil>=0)nls++; } printf("STATE tick=%lld spawned=%d seated=%lld s1cells=%lld/%d dups=%lld stranded=%d moves=%lld evict=%lld inflight=%zu transit=%d lease=%d\n", TICK,nextId,seated,s1c,min(25,N),DUPS_G,strand,MOVES,EVICTIONS,busq,ntr,nls); }
    else if(op=="seat"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; if(id<0||id>=nextId||!alive[id]){ printf("ERR no such live seat %d\n",id); } else { Seat*s=seats[id]; const char* st[]={"joining","asking","searching","seated"}; string nb; if(s->hasCoord){ Coord ol[MAXLINKS]; int n=ownedLinks(s->coord,ol); for(int k=0;k<n;k++){ int x=s->occGet(ckey(ol[k])); char b[48]; snprintf(b,48,"%s=%d ",coordStr(ol[k]).c_str(),x); nb+=b; } } printf("SEAT %d state=%s coord=%s occ=%zu lastAck=%lld(age %lld) healAt=%lld kids=%d haveRoster=%d rosterSz=%zu joinStart=%d(age %lld) gateway=%d stranded=%d drainAt=%d %s\n", id, st[s->state], s->hasCoord?coordStr(s->coord).c_str():"-", s->occ.size(), (long long)s->lastAck,(long long)(TICK-s->lastAck),(long long)s->healAt,(int)s->hasChildren(), (int)s->haveRoster, s->roster.size(), s->joinStart, (long long)(TICK-s->joinStart), s->gateway, (int)s->stranded, s->drainAt, nb.c_str()); } }
    else if(op=="find"){ // find a seat at a given coord path/r/i  e.g. find /0.0
      // parse "P/r.i"
      string a=tk.size()>1?tk[1]:""; size_t sl=a.find('/'),dt=a.find('.',sl); if(sl==string::npos||dt==string::npos){printf("ERR usage: find <path>/<r>.<i>\n");continue;} string ps=a.substr(0,sl); uint32_t pc=0; for(char ch:ps) pc=childPath(pc,ch-'0'); int r=atoi(a.substr(sl+1,dt-sl-1).c_str()), i=atoi(a.substr(dt+1).c_str()); uint64_t k=ckey({pc,(uint8_t)r,(uint8_t)i}); int who=-1; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&ckey(seats[q]->coord)==k){who=q;break;} printf("FIND %s -> seat %d\n",a.c_str(),who); }
    else if(op=="kill"){ double frac=tk.size()>1?atof(tk[1].c_str()):0.5; string mode=tk.size()>2?tk[2]:""; vector<int> ids; for(int q=0;q<nextId;q++) if(alive[q])ids.push_back(q); int nk=(int)(N*frac); vector<int> pick; { unordered_set<int> u; while((int)pick.size()<nk&&pick.size()<ids.size()){ int j=(int)(grnd()*ids.size()); if(!u.count(j)){u.insert(j);pick.push_back(ids[j]);} } } unordered_set<int> ks(pick.begin(),pick.end()); if(mode=="s1row"){ int rr=(int)(grnd()*C); for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&seats[q]->coord.pc==0&&seats[q]->coord.r==rr)ks.insert(q); } if(mode=="s1all"){ for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&seats[q]->coord.pc==0)ks.insert(q); } if(mode=="silent"||((tk.size()>3)&&tk[3]=="silent")){ for(int q:ks){ alive[q]=0; active.erase(q); } } else if(mode=="crash"){ for(int q:ks){ alive[q]=0; active.erase(q); } for(int q:ks) fireTranslost(q); } else for(int q:ks) seats[q]->leave(); N-=ks.size(); printf("OK killed %zu, N now %d\n",ks.size(),N); }
    else if(op=="crash"){   // D5: ungraceful SINGLE-seat death — no LEAVE, but the neighbours' transports notice (fireTranslost) ~2-6 ticks later. `crash <id> quiet` = a BLACKHOLE death: no transport event either (horizon-only baseline).
      int id=tk.size()>1?atoi(tk[1].c_str()):-1; bool quiet=tk.size()>2&&tk[2]=="quiet";
      if(id<0||id>=nextId||!alive[id]){ printf("ERR no such live seat %d\n",id); }
      else { alive[id]=0; active.erase(id); if(!quiet) fireTranslost(id); N-=1; printf("OK crashed %d%s, N now %d\n",id,quiet?" (quiet)":"",N); } }
    else if(op=="sever"){   // D5 slow-peer probe: cut ONE link between two LIVE seats for T ticks; both ends observe the transport death (a severed DC closes on both sides)
      int a=tk.size()>1?atoi(tk[1].c_str()):-1, b=tk.size()>2?atoi(tk[2].c_str()):-1; long long t=tk.size()>3?atoll(tk[3].c_str()):120;
      if(a<0||b<0||a>=nextId||b>=nextId||!alive[a]||!alive[b]){ printf("ERR sever needs two live seats\n"); }
      else { forcedSever[pairKey(a,b)]=TICK+t;
        Msg m1; m1.t=TRANSLOST; m1.id=b; m1.to=a; m1.from=-1; bus[TICK+2].push_back(move(m1));
        Msg m2; m2.t=TRANSLOST; m2.id=a; m2.to=b; m2.from=-1; bus[TICK+2].push_back(move(m2));
        printf("OK severed %d<->%d for %lld ticks (both ends observe transport loss)\n",a,b,t); } }
    else if(op=="killat"){   // kill the CURRENT occupant of a coord (deterministic scenario tool): killat <path>/<r>.<i> [silent] — graceful leave() unless silent
      string a=tk.size()>1?tk[1]:""; bool silent = tk.size()>2 && tk[2]=="silent";
      size_t sl=a.find('/'),dt=a.find('.',sl); if(sl==string::npos||dt==string::npos){printf("ERR usage: killat <path>/<r>.<i> [silent]\n");continue;}
      string ps=a.substr(0,sl); uint32_t pc=0; for(char ch:ps) pc=childPath(pc,ch-'0');
      int r=atoi(a.substr(sl+1,dt-sl-1).c_str()), i=atoi(a.substr(dt+1).c_str());
      uint64_t k=ckey({pc,(uint8_t)r,(uint8_t)i}); int who=-1;
      for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&ckey(seats[q]->coord)==k){who=q;break;}
      if(who<0){ printf("ERR killat: nobody at %s\n",a.c_str()); continue; }
      if(silent){ alive[who]=0; active.erase(who); } else seats[who]->leave();
      N--; printf("OK killat %s -> killed seat %d (%s), N now %d\n",a.c_str(),who,silent?"silent":"leave",N); }
    else if(op=="spawn"){ int k=tk.size()>1?atoi(tk[1].c_str()):1; for(int q=0;q<k;q++){ int id=nextId++; if(id>=(int)seats.size()){ seats.resize(id+1); alive.resize(id+1); } seats[id]=new Seat(id); alive[id]=1; seats[id]->join(); } N+=k; printf("OK spawned %d (ids %d..%d), N now %d\n",k,nextId-k,nextId-1,N); }
    else if(op=="where"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; if(id<0||id>=nextId||!alive[id]) printf("WHERE %d dead\n",id); else printf("WHERE %d state=%d coord=%s\n",id,seats[id]->state,seats[id]->hasCoord?coordStr(seats[id]->coord).c_str():"-"); }
    else if(op=="isactive"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; printf("ACTIVE seat%d inActive=%d inNext=%d\n",id,(int)active.count(id),(int)nextActive.count(id)); }
    else if(op=="occ"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; string a=tk.size()>2?tk[2]:""; size_t sl=a.find(0x2f),dt=a.find(0x2e,sl); string ps=a.substr(0,sl); uint32_t pc=0; for(char ch:ps)pc=childPath(pc,ch-48); int r=atoi(a.substr(sl+1,dt-sl-1).c_str()),i=atoi(a.substr(dt+1).c_str()); uint64_t k=ckey({pc,(uint8_t)r,(uint8_t)i}); if(id<0||id>=nextId||!alive[id]){printf("ERR\n");} else { Seat*se=seats[id]; int v=se->occGet(k); int age=se->s1seen.count(k)?(int)(TICK-se->s1seen[k]):-1; int liveAge=se->live.count(k)?(int)(TICK-se->live[k]):-1; int holeAge=se->holeSince.count(k)?(int)(TICK-se->holeSince[k]):-1; printf("OCC seat%d occ[%s]=%d s1seenAge=%d liveAge=%d holeSinceAge=%d fhLive=%d\n",id,a.c_str(),v,age,liveAge,holeAge,(int)se->firstHandLive(k));} }
    else if(op=="hist"){ unordered_map<uint64_t,int> cnt; int s1seats=0; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state==3){ cnt[ckey(seats[q]->coord)]++; if(seats[q]->coord.pc==0)s1seats++; } int h1=0,h2=0,h3=0,mx=0; uint64_t mxk=0; for(auto&e:cnt){ if(e.second==1)h1++; else if(e.second==2)h2++; else h3++; if(e.second>mx){mx=e.second;mxk=e.first;} } printf("HIST cells:1=%d 2=%d 3+=%d maxDup=%d@%s s1seats=%d\n",h1,h2,h3,mx,coordStr(unck(mxk)).c_str(),s1seats); }
    else if(op=="relay"){ int live=0,s1=0; for(auto&e:relayGreeters){ if(e.second>=TICK && e.first<nextId && alive[e.first]){ live++; if(seats[e.first]->state==3 && seats[e.first]->coord.pc==0) s1++; } } printf("RELAY greeters=%zu (live=%d, section1=%d) H(genesisKey)=%llu\n", relayGreeters.size(), live, s1, (unsigned long long)relayGenesisKey); }
    else if(op=="transit"){ int ntr=0,nls=0; string ex; for(int q=0;q<nextId;q++) if(alive[q]){ Seat*s=seats[q];
        if(s->moving){ ntr++; char b[96]; snprintf(b,96,"%d:move(%s->%s age %lld) ",q,coordStr(s->oldCoord).c_str(),coordStr(s->coord).c_str(),TICK-s->moveAt); ex+=b; }
        if(s->leaseUntil>=0){ nls++; char b[96]; snprintf(b,96,"%d:lease(%s ttl %lld) ",q,coordStr(unck(s->leaseCk)).c_str(),s->leaseUntil-TICK); ex+=b; } }
      printf("TRANSIT moves=%d leases=%d %s\n",ntr,nls,ex.c_str()); }
    else if(op=="bad"){ int cnt=0; string ex; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state!=3){ cnt++; if(cnt<=8){ const char* st[]={"joining","asking","searching","seated"}; char b[64]; snprintf(b,64,"%d(%s) ",q,st[seats[q]->state]); ex+=b; } } printf("BAD unseated=%d %s\n",cnt,ex.c_str()); }
    else if(op=="dups"){ unordered_map<uint64_t,int> at; int d=0; string ex; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord){ uint64_t k=ckey(seats[q]->coord); auto it=at.find(k); if(it!=at.end()){ d++; if(d<=8){ char b[64]; snprintf(b,64,"%s:%d,%d ",coordStr(seats[q]->coord).c_str(),it->second,q); ex+=b;} } else at[k]=q; } printf("DUPS %d %s\n",d,ex.c_str()); }
    else if(op=="watch"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; int n=tk.size()>2?atoi(tk[2].c_str()):200; const char* st[]={"j","a","s","S"}; for(int q=0;q<n;q++){ doTick(); TICK++; if(id>=0&&id<nextId){ Seat*se=seats[id]; fprintf(stderr,"  t=%lld seat%d %s coord=%s\n",TICK,id,st[se->state],se->hasCoord?coordStr(se->coord).c_str():"-"); } } printf("OK watched %d\n",n); }
    else if(op=="compacton"){ COMPACTION=(tk.size()<2)||(tk[1]!="0"); printf("OK compaction=%d\n",(int)COMPACTION); }
    else if(op=="compact"){   // Q2 diagnostic: tree-depth & lone-row fragmentation. depth(pc)=path length.
      auto depthOf=[](uint32_t pc){ int d=0; while(pc){ pc=parentPath(pc); d++; } return d; };
      // per-section: which rows are occupied, and how many seats
      unordered_map<uint32_t,unordered_set<int>> secRows; unordered_map<uint32_t,int> secSeats;
      int seatN=0, maxDepth=0; unordered_map<int,int> byDepth;
      for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state==3){ Coord c=seats[q]->coord; seatN++;
        secRows[c.pc].insert(c.r); secSeats[c.pc]++; int d=depthOf(c.pc); byDepth[d]++; if(d>maxDepth)maxDepth=d; }
      // lone-row DEEP sections (pc!=0 with exactly one occupied row) — the sdn-mirror no-route case
      int loneDeep=0, occSections=0; for(auto&e:secRows){ occSections++; if(e.first!=0 && e.second.size()==1) loneDeep++; }
      // global occupancy map (any seat's coord) to test frontier availability
      unordered_set<uint64_t> occAll; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state==3) occAll.insert(ckey(seats[q]->coord));
      // count TRUE frontier cells (free + down-child empty) at depths 0,1,2 — what a compactor can actually move into
      auto isFree=[&](Coord c){ return !occAll.count(ckey(c)); };
      int fr[4]={0,0,0,0}; for(auto&e:secRows){ uint32_t pc=e.first; int dp=depthOf(pc); if(dp>2) continue;
        for(int r=0;r<C;r++) for(int i=0;i<C;i++){ Coord c={pc,(uint8_t)r,(uint8_t)i}; if(!isFree(c)) continue; if(!isFree(down(c))) continue; fr[dp]++; } }
      // theoretical minimal depth for seatN: cap(<=D) = 25*(5^(D+1)-1)/4
      int minDepth=0; { long long capD=25; long long tier=25; while(capD<seatN){ tier*=5; capD+=tier; minDepth++; } }
      printf("COMPACT seats=%d occSections=%d maxDepth=%d minDepth=%d loneRowDeepSections=%d byDepth=",
        seatN,occSections,maxDepth,minDepth,loneDeep);
      for(int d=0;d<=maxDepth;d++) printf("%s%d:%d",d?",":"",d,byDepth.count(d)?byDepth[d]:0);
      printf(" frontier(d0=%d,d1=%d,d2=%d) cProbes=%lld cAdmits=%lld cPlaces=%lld cMoves=%lld\n",fr[0],fr[1],fr[2],COMPACT_PROBES,COMPACT_ADMITS,COMPACT_PLACES,COMPACT_MOVES); }
    else printf("ERR unknown: %s\n",op.c_str());
  }
  return 0;
}
