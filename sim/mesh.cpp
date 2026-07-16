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
using namespace std;
typedef unordered_map<uint64_t,int> Occ;

// ---- message ----
enum MT { GREETERS,WHOHOME,HOME,FIND,FINDLEAF,PLACE,NOROOM,HELLO,YIELD,CLAIM,LEAVE,GREETWALK,S1SYNC,DRAIN,CHALLENGE,CONFIRM,PHONE,PONG,ROUTE,ROUTED,KNOCK };
struct KV { uint64_t k; int v; };
struct Ent { uint64_t k; int v; int age; };
struct Msg {
  MT t; int to=-1;
  int from=-1,id=-1,owner=-1,nc=-1,asker=-1,via=-1,child=-1,ttl=0,tag=0,hold=0;
  uint64_t ck=0,oCk=0,tock=0;
  Coord coord{0,0,0},hole{0,0,0},target{0,0,0};
  bool kids=false;
  vector<int> list; vector<KV> roster,nbrs; vector<Ent> ent,row;
};

// ---- globals / fabric ----
static int N; static double LEAVEFRAC=0; static int W=1;
static long long TICK=0; static long long MOVES=0, EVICTIONS=0;
static bool HEALING=true;
static const int GREET_PERIOD=800;
static uint32_t GSEED=20260714;
static inline double grnd(){ GSEED=(uint32_t)((GSEED*1103515245u+12345u)&0x7fffffff); return GSEED/2147483648.0; }
static unordered_map<long long, vector<Msg>> bus;
static unordered_set<uint64_t> openPairs; static uint64_t SEQ=0;
static vector<int> greetRecent; static unordered_map<int,int> greetHold;

struct Seat;
static vector<Seat*> seats;              // index = id
static vector<char> alive;               // alive[id]
static unordered_set<int> active, nextActive;
static inline void wake(int id){ nextActive.insert(id); }

// ---- seat ----
struct Seat {
  int id; int state=0; // 0 join,1 ask,2 search,3 seated
  bool hasCoord=false; Coord coord{0,0,0};
  Occ occ, live, s1seen, healTry; unordered_map<uint64_t,uint8_t> kidful; unordered_map<uint64_t,int> childOf;
  int retryAt=-1,seatTries=0,lastPhone=-99,lastAck=0,healAt=-99,drainAt=0,rosterAskAt=-999,xlinkAt=0;
  int greetHoldT=0,seatedAt=0,challAt=0,emptyHomes=0;
  long long greetAt=-1,s1CheckAt=-1;
  bool auditPend=false; bool evil=false;
  vector<KV> roster; bool haveRoster=false; vector<int> lastGreeters;
  uint32_t rs;
  Seat(int i):id(i){ uint32_t h=2166136261u; char b[16]; int n=snprintf(b,16,"p%08d",i); for(int k=0;k<n;k++){h^=(unsigned char)b[k]; h*=16777619u;} rs=h^0x9e3779b9u; }
  inline double rng(){ rs=(rs+0x6d2b79f5u); uint32_t t=rs; t=(t^(t>>15))*(t|1u); t^=t+(t^(t>>7))*(t|61u); return ((t^(t>>14))>>0)/4294967296.0; }
  template<class T> void shuf(vector<T>&a){ for(int k=(int)a.size()-1;k>0;k--){ int j=(int)(rng()*(k+1)); T tmp=a[k];a[k]=a[j];a[j]=tmp; } }

  inline int occGet(uint64_t k){ auto it=occ.find(k); return it==occ.end()?-1:it->second; }
  inline void noteS1(uint64_t ck){ if((ck>>16)==0) s1seen[ck]=(int)TICK; } // pc==0 => Section 1
  inline bool s1Fresh(uint64_t ck){ auto it=s1seen.find(ck); return it!=s1seen.end() && TICK-it->second<120 && occ.count(ck); }
  Coord ownedRowHead(){ return { childPath(coord.pc,coord.i), coord.r, 0 }; }
  void rosterCells(Coord out[C]){ Coord h=ownedRowHead(); for(int c=0;c<C;c++) out[c]={h.pc,h.r,(uint8_t)c}; }
  bool firstFreeInRoster(Coord&f){ Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++) if(!occ.count(ckey(rc[c]))){f=rc[c];return true;} return false; }
  bool ownerCoord(Coord&o){ if(!hasCoord||coord.pc==0) return false; return up({coord.pc,coord.r,0},o); }
  int ownerId(){ if(!hasCoord) return -1; Coord u; if(!up({coord.pc,coord.r,0},u)) return -1; return occGet(ckey(u)); }
  bool hasChildren(){ Coord rc[C]; rosterCells(rc); for(int c=0;c<C;c++){int x=occGet(ckey(rc[c])); if(x>=0&&x!=id) return true;} return false; }
  bool lowestSurvivor(){ for(int j=1;j<coord.i;j++){ uint64_t k=ckey({coord.pc,coord.r,(uint8_t)j}); int x=occGet(k); if(x<0||x==id) continue; if(coord.pc!=0||s1Fresh(k)) return false;} return true; }

  void emit(int to, const Msg& m);         // fwd
  void emitRelay();
  void join(){ state=0; retryAt=(int)TICK; haveRoster=false; emitRelay(); wake(id); }
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
  void requeue();
  void serveFind(Msg& m);
  void admit(Coord c,int nc);
  void onPhone(Msg& m);
  void phoneHome(); void s1Sync(); void rowSweep(); void s1Fill(); void attack();
  void drainOrReenter(); void reseatViaRoster();
  bool nextHopCoord(Coord t, Coord& out);
  int nextHopToward(Coord target,int exclude);
  void routeTo(Coord target,int tag);
  void leave();
};

// ---- fabric send/route/relay ----
static inline uint64_t pairKey(int a,int b){ return a<b? ((uint64_t)a<<32|(uint32_t)b) : ((uint64_t)b<<32|(uint32_t)a); }
static void schedule(int from,int to,Msg m){
  uint64_t pk=pairKey(from,to); int d;
  if(openPairs.count(pk)) d=1+(SEQ&1); else { openPairs.insert(pk); d=4+(int)(SEQ%5); }
  m.to=to; m.from=from; SEQ++;
  bus[TICK+d].push_back(move(m));
}
void Seat::emit(int to,const Msg& m){ Msg mm=m; schedule(id,to,move(mm)); }
static void relayKnock(int id,int hold);
void Seat::emitRelay(){ relayKnock(id, greetHoldT); }
static void relayKnock(int id,int hold){
  greetHold[id]=hold;
  vector<int> out;
  for(int k=(int)greetRecent.size()-1;k>=0 && (int)out.size()<6;k--){ int c=greetRecent[k]; if(c!=id && alive[c] && seats[c]->state==3 && (greetHold.count(c)?greetHold[c]:0)>=TICK) out.push_back(c); }
  greetRecent.push_back(id); if(greetRecent.size()>400) greetRecent.erase(greetRecent.begin(),greetRecent.begin()+200);
  // shuffle out with global rng
  for(int k=(int)out.size()-1;k>0;k--){int j=(int)(grnd()*(k+1)); swap(out[k],out[j]);}
  Msg m; m.t=GREETERS; m.list=out; m.to=id; m.from=-1;
  bus[TICK+1].push_back(move(m));
}

// (seat method bodies continue in mesh_seat.inc)
#include "mesh_seat.inc"

// ---- run / service ----
static vector<vector<int>> spawnPlan;
static int nextId=0, joinWindow=0; static long long MAXP=0;
static void spawnDue(){ if(TICK<(long long)spawnPlan.size()) for(int k:spawnPlan[TICK]){ int id=nextId++; seats[id]=new Seat(id); alive[id]=1; seats[id]->join(); } }
static void doTick(){
  spawnDue();
  auto it=bus.find(TICK);
  if(it!=bus.end()){ for(auto&m:it->second){ if(m.to>=0 && m.to<(int)seats.size() && alive[m.to]){ seats[m.to]->recv(m); wake(m.to);} } bus.erase(it); }
  active.swap(nextActive); nextActive.clear();
  for(int id: active){ if(id<nextId && alive[id]) seats[id]->tick(); }
}
static void counts(long long&seated,long long&s1c){ seated=0;s1c=0; for(int i=0;i<nextId;i++){ if(alive[i]&&seats[i]->state==3){seated++; if(seats[i]->coord.pc==0)s1c++;} } }
static string coordStr(Coord c){ // decode pc to base-5 path string
  string p; uint32_t pc=c.pc; vector<int> d; while(pc){d.push_back(lastDigit(pc)); pc=parentPath(pc);} for(int a=(int)d.size()-1;a>=0;a--) p+=('0'+d[a]);
  char b[64]; snprintf(b,64,"%s/%d.%d",p.c_str(),c.r,c.i); return b; }
static void initSim(int n,double leave){
  N=n; LEAVEFRAC=leave; joinWindow=max(1,min((int)(N*0.25),2000)); MAXP=(long long)N*30+60000;
  size_t cap=(size_t)N+(size_t)(N*0.6)+16; seats.assign(cap,nullptr); alive.assign(cap,0);
  spawnPlan.assign(joinWindow+1,{}); for(int k=0;k<N;k++){ int t=(int)(grnd()*joinWindow); spawnPlan[t].push_back(k); }
  TICK=0; nextId=0;
}
// advance until converged (seated==N && s1 full) or cap; returns ticks used
static long long converge(long long cap){ long long seated,s1c; long long start=TICK; while(TICK<start+cap){ doTick(); TICK++; long long tgt=min((long long)25,(long long)N); if(TICK%64==0){ counts(seated,s1c); if(seated==N && s1c==tgt) return TICK; } } return -1; }

int main(int argc,char**argv){
  // batch mode: ./mesh N [leaveFrac]   |   service mode: ./mesh --service
  bool service = (argc>1 && string(argv[1])=="--service");
  if(!service){
    int n=argc>1?atoi(argv[1]):10000; double lv=argc>2?atof(argv[2]):0;
    initSim(n,lv); auto t0=chrono::steady_clock::now();
    long long conv=converge(MAXP);
    double secs=chrono::duration<double>(chrono::steady_clock::now()-t0).count();
    long long seated,s1c; counts(seated,s1c);
    printf("  after JOIN: %s [seated=%lld/%d, s1=%lld, converged@%lld, %lld ticks, %.2fs, %.0fk ticks/s]\n",
      (seated==n&&s1c==min(25,n))?"OK":"INCOMPLETE", seated,n,s1c,conv,TICK,secs, TICK/secs/1000.0);
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
    else if(op=="init"){ int n=tk.size()>1?atoi(tk[1].c_str()):10000; double lv=tk.size()>2?atof(tk[2].c_str()):0; initSim(n,lv); printf("OK init N=%d leave=%.2f\n",n,lv); }
    else if(op=="tick"){ int n=tk.size()>1?atoi(tk[1].c_str()):1; for(int q=0;q<n;q++){doTick();TICK++;} printf("OK tick now=%lld\n",TICK); }
    else if(op=="converge"){ long long cap=tk.size()>1?atoll(tk[1].c_str()):MAXP; auto t0=chrono::steady_clock::now(); long long c=converge(cap); double secs=chrono::duration<double>(chrono::steady_clock::now()-t0).count(); printf("%s converged@%lld tick=%lld %.2fs %.0fk/s\n", c>=0?"OK":"TIMEOUT", c, TICK, secs, TICK/(secs>0?secs:1)/1000.0); }
    else if(op=="state"){ long long seated,s1c; counts(seated,s1c); size_t busq=0; for(auto&b:bus)busq+=b.second.size(); printf("STATE tick=%lld spawned=%d seated=%lld s1=%lld/%d moves=%lld evict=%lld inflight=%zu\n", TICK,nextId,seated,s1c,min(25,N),MOVES,EVICTIONS,busq); }
    else if(op=="seat"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; if(id<0||id>=nextId||!alive[id]){ printf("ERR no such live seat %d\n",id); } else { Seat*s=seats[id]; const char* st[]={"joining","asking","searching","seated"}; string nb; if(s->hasCoord){ Coord ol[C+2]; int n=ownedLinks(s->coord,ol); for(int k=0;k<n;k++){ int x=s->occGet(ckey(ol[k])); char b[48]; snprintf(b,48,"%s=%d ",coordStr(ol[k]).c_str(),x); nb+=b; } } printf("SEAT %d state=%s coord=%s occ=%zu %s\n", id, st[s->state], s->hasCoord?coordStr(s->coord).c_str():"-", s->occ.size(), nb.c_str()); } }
    else if(op=="find"){ // find a seat at a given coord path/r/i  e.g. find /0.0
      // parse "P/r.i"
      string a=tk.size()>1?tk[1]:""; size_t sl=a.find('/'),dt=a.find('.',sl); if(sl==string::npos||dt==string::npos){printf("ERR usage: find <path>/<r>.<i>\n");continue;} string ps=a.substr(0,sl); uint32_t pc=0; for(char ch:ps) pc=childPath(pc,ch-'0'); int r=atoi(a.substr(sl+1,dt-sl-1).c_str()), i=atoi(a.substr(dt+1).c_str()); uint64_t k=ckey({pc,(uint8_t)r,(uint8_t)i}); int who=-1; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&ckey(seats[q]->coord)==k){who=q;break;} printf("FIND %s -> seat %d\n",a.c_str(),who); }
    else if(op=="kill"){ double frac=tk.size()>1?atof(tk[1].c_str()):0.5; string mode=tk.size()>2?tk[2]:""; vector<int> ids; for(int q=0;q<nextId;q++) if(alive[q])ids.push_back(q); int nk=(int)(N*frac); vector<int> pick; { unordered_set<int> u; while((int)pick.size()<nk&&pick.size()<ids.size()){ int j=(int)(grnd()*ids.size()); if(!u.count(j)){u.insert(j);pick.push_back(ids[j]);} } } unordered_set<int> ks(pick.begin(),pick.end()); if(mode=="s1row"){ int rr=(int)(grnd()*C); for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&seats[q]->coord.pc==0&&seats[q]->coord.r==rr)ks.insert(q); } if(mode=="s1all"){ for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord&&seats[q]->coord.pc==0)ks.insert(q); } for(int q:ks) seats[q]->leave(); N-=ks.size(); printf("OK killed %zu, N now %d\n",ks.size(),N); }
    else if(op=="isactive"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; printf("ACTIVE seat%d inActive=%d inNext=%d\n",id,(int)active.count(id),(int)nextActive.count(id)); }
    else if(op=="occ"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; string a=tk.size()>2?tk[2]:""; size_t sl=a.find(0x2f),dt=a.find(0x2e,sl); string ps=a.substr(0,sl); uint32_t pc=0; for(char ch:ps)pc=childPath(pc,ch-48); int r=atoi(a.substr(sl+1,dt-sl-1).c_str()),i=atoi(a.substr(dt+1).c_str()); uint64_t k=ckey({pc,(uint8_t)r,(uint8_t)i}); if(id<0||id>=nextId||!alive[id]){printf("ERR\n");} else { Seat*se=seats[id]; int v=se->occGet(k); int age=se->s1seen.count(k)?(int)(TICK-se->s1seen[k]):-1; printf("OCC seat%d occ[%s]=%d s1seenAge=%d auditAt=%lld(in %lld)\n",id,a.c_str(),v,age,se->s1CheckAt,se->s1CheckAt-TICK);} }
    else if(op=="relay"){ int valid=0; for(auto&pr:greetHold){ if(pr.second>=TICK && pr.first<nextId && alive[pr.first] && seats[pr.first]->state==3) valid++; } int recentValid=0; for(int k=(int)greetRecent.size()-1;k>=0&&recentValid<20;k--){int c=greetRecent[k]; if(c<nextId&&alive[c]&&seats[c]->state==3&&(greetHold.count(c)?greetHold[c]:0)>=TICK)recentValid++;} printf("RELAY greeters_valid=%d recent_valid(<=20)=%d recentWindow=%zu\n",valid,recentValid,greetRecent.size()); }
    else if(op=="bad"){ int cnt=0; string ex; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->state!=3){ cnt++; if(cnt<=8){ const char* st[]={"joining","asking","searching","seated"}; char b[64]; snprintf(b,64,"%d(%s) ",q,st[seats[q]->state]); ex+=b; } } printf("BAD unseated=%d %s\n",cnt,ex.c_str()); }
    else if(op=="dups"){ unordered_map<uint64_t,int> at; int d=0; string ex; for(int q=0;q<nextId;q++) if(alive[q]&&seats[q]->hasCoord){ uint64_t k=ckey(seats[q]->coord); auto it=at.find(k); if(it!=at.end()){ d++; if(d<=8){ char b[64]; snprintf(b,64,"%s:%d,%d ",coordStr(seats[q]->coord).c_str(),it->second,q); ex+=b;} } else at[k]=q; } printf("DUPS %d %s\n",d,ex.c_str()); }
    else if(op=="watch"){ int id=tk.size()>1?atoi(tk[1].c_str()):-1; int n=tk.size()>2?atoi(tk[2].c_str()):200; const char* st[]={"j","a","s","S"}; for(int q=0;q<n;q++){ doTick(); TICK++; if(id>=0&&id<nextId){ Seat*se=seats[id]; fprintf(stderr,"  t=%lld seat%d %s coord=%s\n",TICK,id,st[se->state],se->hasCoord?coordStr(se->coord).c_str():"-"); } } printf("OK watched %d\n",n); }
    else printf("ERR unknown: %s\n",op.c_str());
  }
  return 0;
}
