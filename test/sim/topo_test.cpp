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
  // every DEEP seat degree <= C+1 (sparse tree)
  bool deg=true; Coord ol[MAXLINKS]; for(int r=0;r<C;r++)for(int i=0;i<C;i++){ if(ownedLinks({7,(uint8_t)r,(uint8_t)i},ol)>C+1) deg=false;} eq("deep owned links <= C+1",deg);
  // W7: Section 1 (pc==0) is the 5x5 ROOK'S GRAPH — uniform degree 9 = (C-1) row + (C-1) col + 1 down, heads included
  bool rookDeg=true, rookStruct=true, rookNoUp=true;
  for(int r=0;r<C;r++)for(int i=0;i<C;i++){ Coord s={0,(uint8_t)r,(uint8_t)i}; int n=ownedLinks(s,ol);
    if(n!=2*C-1) rookDeg=false;
    // exactly: all row-mates present, all column-mates present, the down cell present, nothing else
    int rowCnt=0,colCnt=0,downCnt=0,other=0;
    for(int k=0;k<n;k++){ Coord o=ol[k];
      if(o.pc==0 && o.r==r && o.i!=i) rowCnt++;
      else if(o.pc==0 && o.i==i && o.r!=r) colCnt++;
      else if(o.pc==childPath(0,i) && o.r==r && o.i==0) downCnt++;
      else other++; }
    if(rowCnt!=C-1||colCnt!=C-1||downCnt!=1||other!=0) rookStruct=false;
    Coord u; if(up(s,u)) rookNoUp=false;   // Section 1 has no up-link
  }
  eq("Section1 rook degree == 9", rookDeg);
  eq("Section1 rook structure (full row + full column + down, heads too)", rookStruct);
  eq("Section1 no up-link", rookNoUp);
  // rook is symmetric: b in ownedLinks(a) <=> a in ownedLinks(b), across Section 1
  bool sym=true; Coord olb[MAXLINKS];
  for(int r=0;r<C;r++)for(int i=0;i<C;i++){ Coord a={0,(uint8_t)r,(uint8_t)i}; int n=ownedLinks(a,ol);
    for(int k=0;k<n;k++){ Coord b=ol[k]; if(b.pc!=0) continue; int m2=ownedLinks(b,olb); bool back=false; for(int q=0;q<m2;q++) if(olb[q].pc==0&&olb[q].r==a.r&&olb[q].i==a.i) back=true; if(!back) sym=false; } }
  eq("Section1 rook symmetric", sym);
  printf("topo_test: %s\n", fail?"FAIL":"OK (all invariants match mesh.js)");
  return fail?1:0;
}
