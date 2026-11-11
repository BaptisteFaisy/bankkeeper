// shaders.ts — every GLSL source of the harbour. Two colours only: the night
// blue of the matter and the cyan of the light. The world is a diorama cut
// by a disc (uClip); a spotlight (uFocus) can dim what is not the subject.

const COMMON = `precision highp float;
const vec3 ACC=vec3(.098,.89,1.);
const vec3 FOG=vec3(.012,.035,.062);
uniform vec4 uFocus; uniform vec3 uClip;
float focusK(vec3 w){ if(uFocus.w<=0.) return 1.; float d=length(w.xz-uFocus.xy); return mix(1.,.28,uFocus.w*smoothstep(uFocus.z,uFocus.z*1.8,d)); }
void clipTest(vec3 w){ if(uClip.z>0. && length(w.xz-uClip.xy)>uClip.z+.05) discard; }
float fogK(float d){ return smoothstep(260.,760.,d); }
`;

export const FACE_V = `attribute vec3 aPos; attribute float aE; uniform mat4 uVP,uM; varying vec3 vW; varying float vE;
void main(){ vec4 w=uM*vec4(aPos,1.); vW=w.xyz; vE=aE; gl_Position=uVP*w; }`;

export const FACE_F = `#extension GL_OES_standard_derivatives : enable
` + COMMON + `varying vec3 vW; varying float vE; uniform vec3 uCam; uniform float uGlow,uLit,uDim;
void main(){
  clipTest(vW);
  vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); vec3 V=normalize(uCam-vW); if(dot(n,V)<0.) n=-n;
  float key=max(dot(n,normalize(vec3(-.45,.72,.52))),0.); float sky=n.y*.5+.5;
  vec3 col=vec3(.02,.05,.08)+vec3(.04,.1,.14)*sky+vec3(.12,.27,.36)*key*key;
  col*=.75+.25*smoothstep(-4.,14.,vW.y);
  col+=ACC*.06*pow(1.-max(dot(n,V),0.),3.);
  float e=max(vE,uLit*(.35+.5*key))*(1.-uDim*.8);
  col=mix(col,ACC,e)*(1.-uDim*.45);
  float f=fogK(length(uCam-vW)), k=focusK(vW);
  col=mix(FOG,mix(col,FOG,f),k);
  if(uGlow>.5) col=ACC*e*smoothstep(.3,.65,e)*(1.-f)*k;
  gl_FragColor=vec4(col,1.);
}`;

export const FLAT_V = `attribute vec3 aPos; attribute float aE; uniform mat4 uVP,uM; varying vec3 vW; varying float vE;
void main(){ vec4 w=uM*vec4(aPos,1.); vW=w.xyz; vE=aE; gl_Position=uVP*w; }`;

/** Lines (uMode 0) or additive light (uMode 1: wakes, beam, rings). */
export const FLAT_F = COMMON + `varying vec3 vW; varying float vE; uniform vec3 uCam; uniform float uA,uMode;
void main(){
  clipTest(vW);
  float f=fogK(length(uCam-vW)), k=focusK(vW), e=vE*uA;
  if(uMode>.5){ gl_FragColor=vec4(ACC*e*(1.-f)*k,1.); return; }
  vec3 c=mix(vec3(.03,.08,.12),ACC,clamp(e,0.,1.));
  gl_FragColor=vec4(mix(FOG,mix(c,FOG,f),k),1.);
}`;

export const WATER_V = `attribute vec3 aPos; uniform mat4 uVP; varying vec3 vW; void main(){ vW=aPos; gl_Position=uVP*vec4(aPos,1.); }`;

export const WATER_F = COMMON + `varying vec3 vW; uniform vec3 uCam,uRest; uniform float uT,uGlow; uniform vec4 uBank[3]; uniform vec4 uPick;
float rings(vec2 p,float dist){
  float lit=0.;
  for(int i=0;i<3;i++){
    vec4 b=uBank[i]; vec2 dp=p-b.xy; float d=length(dp)/b.z, wdt=.012+dist*.00012;
    float ring=1.-smoothstep(wdt,wdt*2.2,abs(d-1.));
    float dash=step(.45,fract(atan(dp.y,dp.x)*14./6.2832+uT*.015));
    float rest=(i==0?uRest.x:(i==1?uRest.y:uRest.z));
    float hot=(uPick.x>.5 && abs(uPick.y-float(i))<.5)?1.:0.;
    lit+=ring*mix(dash*.45,1.,max(rest,hot))+rest*(1.-smoothstep(wdt,wdt*2.2,abs(d-.72)))*.5;
    lit+=hot*.12*(1.-smoothstep(.0,1.,d));
  }
  return lit;
}
void main(){
  clipTest(vW);
  vec2 p=vW.xz; float dist=length(uCam-vW); vec2 g=vec2(0.); float h=0.;
  float cs=3.2+dist*.012; vec2 cf=fract(p/cs); vec2 q=(floor(p/cs)+(cf.x>cf.y?vec2(.67,.33):vec2(.33,.67)))*cs;
  #define W(dx,dz,k,sp,a) { vec2 d=normalize(vec2(dx,dz)); float ph=dot(q,d)*k+uT*sp; g+=d*k*a*cos(ph); h+=a*sin(ph); }
  W(.2,1.,.19,.9,.55) W(-.6,1.,.33,1.3,.32) W(.9,.5,.57,1.7,.17) W(-.3,1.,.8,2.1,.1)
  float far=smoothstep(80.,420.,dist);
  vec3 N=normalize(vec3(-g.x,1.,-g.y)*vec3(1.-far*.5,1.,1.-far*.5));
  vec3 V=normalize(uCam-vW);
  float fres=pow(1.-max(dot(N,V),0.),3.);
  float key=max(dot(N,normalize(vec3(-.45,.72,.52))),0.);
  vec3 deep=vec3(.008,.035,.06), hi=vec3(.03,.16,.22);
  vec3 col=mix(deep,hi,fres*.8)+(hi-deep)*(.45*pow(key,10.)+.2*smoothstep(.3,1.,h))*(1.-far);
  float spec=pow(max(dot(reflect(-normalize(vec3(0.,.25,-1.)),N),V),0.),48.);
  float lx=abs(fract((p.x+76.)/12.+.5)-.5)*12.+g.x*2.;
  float streak=exp(-lx*lx*.9)*exp(-(p.y+72.)*.11)*step(-80.,p.x)*step(p.x,66.)*step(-72.,p.y);
  float lit=rings(p,dist);
  float f=fogK(dist), k=focusK(vW);
  col=mix(col,ACC,clamp(spec*.18*(1.-far)+lit*.5+streak*.3,0.,1.));
  col=mix(FOG,mix(col,FOG,f),k);
  if(uGlow>.5) col=ACC*(lit*.28+streak*.22)*(1.-f)*k;
  gl_FragColor=vec4(col,1.);
}`;

export const SKY_V = `attribute vec2 aPos; uniform vec3 uF,uR,uU; uniform vec2 uTan; varying vec3 vD; varying vec2 vS;
void main(){ vD=uF+uR*aPos.x*uTan.x+uU*aPos.y*uTan.y; vS=aPos; gl_Position=vec4(aPos,.999,1.); }`;

/** The void the diorama floats in: dark, with a soft cyan horizon glow. */
export const SKY_F = `precision highp float; varying vec3 vD; varying vec2 vS;
void main(){
  vec3 d=normalize(vD);
  vec3 col=mix(vec3(.018,.055,.085),vec3(.004,.012,.024),smoothstep(-.35,.45,d.y));
  col*=1.-.35*dot(vS,vS)*.5;
  gl_FragColor=vec4(col,1.);
}`;

export const FISH_V = `attribute vec2 aL; attribute vec4 aF; uniform mat4 uVP; uniform vec4 uBank[3]; uniform float uT; varying float vA; varying vec3 vW;
void main(){
  vec4 B=aF.x<.5?uBank[0]:(aF.x<1.5?uBank[1]:uBank[2]);
  float r=B.z*(.12+.74*aF.y); float dir=fract(aF.z*5.)<.5?1.:-1.;
  float a=aF.z*6.2832+uT*dir*(3.+3.*fract(aF.z*9.))/r;
  vec2 n=vec2(cos(a),sin(a)); vec2 t=vec2(-n.y,n.x)*dir;
  float wig=sin(uT*7.+aF.z*40.)*.22*(.6-aL.x);
  vec2 p=B.xy+r*n+t*aL.x+n*(aL.y+wig*step(aL.x,0.));
  float vis=step(aF.w,B.w);
  vA=vis*(.18+.3*fract(aF.z*3.)); vW=vec3(p.x,.25,p.y);
  gl_Position=vis>.5?uVP*vec4(vW,1.):vec4(2.,2.,2.,1.);
}`;
export const FISH_F = COMMON + `varying float vA; varying vec3 vW;
void main(){ gl_FragColor=vec4(ACC*vA*focusK(vW),1.); }`;

export const POST_V = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;
export const BLUR_F = `precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec4 c=texture2D(uTex,vUv)*.227;
  c+=(texture2D(uTex,vUv+uDir*1.385)+texture2D(uTex,vUv-uDir*1.385))*.316;
  c+=(texture2D(uTex,vUv+uDir*3.231)+texture2D(uTex,vUv-uDir*3.231))*.07;
  gl_FragColor=c;
}`;
export const COMP_F = `precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform float uK;
void main(){ gl_FragColor=vec4(texture2D(uTex,vUv).rgb*uK,1.); }`;
