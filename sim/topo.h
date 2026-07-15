// topo.h — the mesh topology as integer arithmetic (port of site/js/mesh.js).
// Coordinate = (pc, r, i): pc is the SECTION path encoded as an integer,
// r the row (0..C-1), i the column (0..C-1). Path encoding: '' = 0; appending
// digit d (0..C-1) => pc*6 + (d+1). So parent(pc)=(pc-1)/6, lastDigit(pc)=(pc-1)%6.
#pragma once
#include <cstdint>
#include <vector>
static const int C = 5;
struct Coord { uint32_t pc; uint8_t r; uint8_t i; };
static inline uint64_t ckey(Coord c){ return ((uint64_t)c.pc<<16)|((uint32_t)c.r<<8)|c.i; }
static inline bool isRoot(const Coord&c){ return c.pc==0; }
static inline uint32_t childPath(uint32_t pc,int d){ return pc*6+(d+1); }
static inline uint32_t parentPath(uint32_t pc){ return (pc-1)/6; }
static inline int lastDigit(uint32_t pc){ return (int)((pc-1)%6); }
// up: column-0 only; Section 1 (pc==0) has NO up (flag-day #2). returns valid=false if none.
static inline bool up(const Coord&s, Coord&out){ if(s.i!=0) return false; if(s.pc==0) return false; out={parentPath(s.pc),s.r,(uint8_t)lastDigit(s.pc)}; return true; }
static inline Coord down(const Coord&s){ return {childPath(s.pc,s.i),s.r,0}; }
// cross-link: column>0 only. returns valid=false for column 0.
static inline bool crossLink(const Coord&s, Coord&out){ if(s.i==0) return false; if(s.r==s.i) out={s.pc,0,s.i}; else if(s.r==0) out={s.pc,s.i,s.i}; else out={s.pc,s.i,s.r}; return true; }
static inline void rowMates(const Coord&s, Coord out[C-1]){ int k=0; for(int j=0;j<C;j++) if(j!=s.i) out[k++]={s.pc,s.r,(uint8_t)j}; }
// ownedLinks: rowMates(C-1) + cross?(1) + up?(1) + down(1). writes into out, returns count.
static inline int ownedLinks(const Coord&s, Coord out[C+2]){ int k=0; for(int j=0;j<C;j++) if(j!=s.i) out[k++]={s.pc,s.r,(uint8_t)j}; Coord x; if(crossLink(s,x)) out[k++]=x; if(up(s,x)) out[k++]=x; out[k++]=down(s); return k; }
