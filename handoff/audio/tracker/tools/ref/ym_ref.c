// Reference YM2612 renderer: Nuked OPN2 core (libvgm copy). stdin text: "w P R V" (P=0/1 port; the chip runs one
// output sample per write, which is emitted), "s N" (N more samples). stdout: float32 stereo @44100.
#include <stdio.h>
#include <stdlib.h>
#include "stdtype.h"
#include "emu/snddef.h"
#include "emu/cores/ym3438.h"
int main(){
  void* c=nukedopn2_init(7670453,44100); nukedopn2_reset_chip(c); nukedopn2_set_options(c,0);
  char op; DEV_SMPL L[1024],R[1024]; DEV_SMPL* p[2]={L,R}; float out[2048];
  while(scanf(" %c",&op)==1){
    if(op=='w'){unsigned P,Rg,V; scanf("%u %u %u",&P,&Rg,&V); nukedopn2_write(c,P*2,Rg); nukedopn2_write(c,P*2+1,V); nukedopn2_update(c,1,p); out[0]=L[0]/32768.0f; out[1]=R[0]/32768.0f; fwrite(out,4,2,stdout); }
    else if(op=='s'){unsigned n; scanf("%u",&n); while(n){unsigned k=n>1024?1024:n; nukedopn2_update(c,k,p);
        for(unsigned i=0;i<k;i++){out[2*i]=L[i]/32768.0f; out[2*i+1]=R[i]/32768.0f;} fwrite(out,4,2*k,stdout); n-=k;}}
  }
  return 0;
}
