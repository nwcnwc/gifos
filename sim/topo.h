// topo.h — the mesh topology as integer arithmetic (port of site/js/mesh.js).
// Coordinate = (pc, r, i): pc is the SECTION path encoded as an integer,
// r the row (0..C-1), i the column (0..C-1). Path encoding: '' = 0; appending
// digit d (0..C-1) => pc*6 + (d+1). So parent(pc)=(pc-1)/6, lastDigit(pc)=(pc-1)%6.
#pragma once
#include <cstdint>
#include <vector>
static const int C = 5;
// Max owned-link degree of any seat. Section 1 (pc==0) is the 5x5 ROOK'S GRAPH
// (W7): C-1 row-mates + C-1 column-mates + 1 down = 2C-1 = 9. Deep sections keep
// the sparse C+1 bound (C-1 row-mates + 1 cross + 1 up + 1 down). 2C-1 dominates.
static const int MAXLINKS = 2*C-1;
struct Coord { uint32_t pc; uint8_t r; uint8_t i; };
static inline uint64_t ckey(Coord c){ return ((uint64_t)c.pc<<16)|((uint32_t)c.r<<8)|c.i; }
static inline bool isRoot(const Coord&c){ return c.pc==0; }
static inline uint32_t childPath(uint32_t pc,int d){ return pc*6+(d+1); }
static inline uint32_t parentPath(uint32_t pc){ return (pc-1)/6; }
static inline int lastDigit(uint32_t pc){ return (int)((pc-1)%6); }
// up: column-0 only; Section 1 (pc==0) has NO up (flag-day #2). returns valid=false if none.
static inline bool up(const Coord&s, Coord&out){ if(s.i!=0) return false; if(s.pc==0) return false; out={parentPath(s.pc),s.r,(uint8_t)lastDigit(s.pc)}; return true; }
static inline Coord down(const Coord&s){ return {childPath(s.pc,s.i),s.r,0}; }
// cross-link: column>0 only. DEEP sections (pc!=0) only — Section 1 uses the full
// column instead (colMates). returns valid=false for column 0.
static inline bool crossLink(const Coord&s, Coord&out){ if(s.i==0) return false; if(s.r==s.i) out={s.pc,0,s.i}; else if(s.r==0) out={s.pc,s.i,s.i}; else out={s.pc,s.i,s.r}; return true; }
static inline void rowMates(const Coord&s, Coord out[C-1]){ int k=0; for(int j=0;j<C;j++) if(j!=s.i) out[k++]={s.pc,s.r,(uint8_t)j}; }
// W7: column-mates — every seat sharing my column across the OTHER rows. This is
// the extra half of the Section-1 rook's graph (heads included, no diagonal).
static inline void colMates(const Coord&s, Coord out[C-1]){ int k=0; for(int j=0;j<C;j++) if(j!=s.r) out[k++]={s.pc,(uint8_t)j,s.i}; }
// ownedLinks: writes into out, returns count.
//  Section 1 (pc==0): the 5x5 ROOK'S GRAPH — rowMates(C-1) + colMates(C-1) + down.
//    Uniform degree 9, 8-edge-connected, no up (nothing above the home), no
//    sparse cross-link. Heads are NOT special (they get column-mates too).
//  Deep (pc!=0): rowMates(C-1) + cross?(1) + up?(1) + down — the sparse tree, C+1 bound.
static inline int ownedLinks(const Coord&s, Coord out[MAXLINKS]){ int k=0;
  for(int j=0;j<C;j++) if(j!=s.i) out[k++]={s.pc,s.r,(uint8_t)j};
  if(s.pc==0){ for(int j=0;j<C;j++) if(j!=s.r) out[k++]={s.pc,(uint8_t)j,s.i}; out[k++]=down(s); return k; }
  Coord x; if(crossLink(s,x)) out[k++]=x; if(up(s,x)) out[k++]=x; out[k++]=down(s); return k; }
