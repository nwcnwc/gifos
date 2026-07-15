#include "topo.h"
#include <cstdio>
int main(){
  int fail=0;
  auto eq=[&](const char*n,bool c){ if(!c){printf("  FAIL %s\n",n);fail++;} };
  // path encoding round-trips
  uint32_t p2=childPath(0,2); eq("child '2'",p2==3); eq("lastDigit '2'",lastDigit(3)==2); eq("parent '2'",parentPath(3)==0);
  uint32_t p20=childPath(3,0); eq("child '20'",p20==19); eq("lastDigit '20'",lastDigit(19)==0); eq("parent '20'",parentPath(19)==3);
  // up: column-0 non-root -> (parent, r, lastDigit); Section 1 none; column>0 none
  Coord o; eq("up col>0 none", !up({p20,3,4},o));
  eq("up col0 -> parent", up({p20,2,0},o) && o.pc==3 && o.r==2 && o.i==0);
  eq("Section1 no up", !up({0,4,0},o) && !up({0,0,0},o) && !up({0,1,0},o));
  // down bidirectional: down(s).up == s
  Coord s={4,3,2}, d=down(s); eq("down lands col0", d.i==0);
  Coord u; eq("down/up bidirectional", up(d,u) && u.pc==s.pc && u.r==s.r && u.i==s.i);
  // cross-link symmetric involution on columns>0
  bool inv=true; for(int r=0;r<C;r++)for(int i=1;i<C;i++){Coord a={0,(uint8_t)r,(uint8_t)i},x,y; if(!crossLink(a,x)||!crossLink(x,y)||y.r!=r||y.i!=i) inv=false;} eq("cross involution",inv);
  // every seat degree <= C+1
  bool deg=true; Coord ol[C+2]; for(int r=0;r<C;r++)for(int i=0;i<C;i++){ if(ownedLinks({7,(uint8_t)r,(uint8_t)i},ol)>C+1) deg=false;} eq("owned links <= C+1",deg);
  printf("topo_test: %s\n", fail?"FAIL":"OK (all invariants match mesh.js)");
  return fail?1:0;
}
