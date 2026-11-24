export const camera = `
uniform vec3 eye, right, up, forward;
uniform vec2 scale;
uniform float time;
vec4 project(vec3 p) {
  vec3 d=p-eye;
  float z=dot(d,forward);
  return vec4(dot(d,right)*scale.x, dot(d,up)*scale.y, 1.0013*z-0.36,z);
}`;

export const skyVert = `
attribute vec2 pos;
varying vec2 screen;
void main(){screen=pos;gl_Position=vec4(pos,.9999,1.);}`;
export const skyFrag = `
precision mediump float;
varying vec2 screen;
uniform vec3 water,top;
uniform float time,heading,pitch,biome;
void main(){
  vec2 uv=screen*.5+.5;
  float h=clamp(uv.y+pitch*.66,0.,1.);
  vec3 c=mix(water*.74,top,pow(h,1.35));
  float ray=uv.x*1.14-uv.y*.37 + sin(heading)*.47 +time*.0018;
  float bands=pow(.5+.5*sin(ray*35.+1.4*sin(ray*13.)),7.);
  float fine=pow(.5+.5*sin(ray*83.+1.3*sin(ray*23.+time*.1)),10.);
  c+=vec3(.26,.46,.39)*(bands*.13+fine*.055)*h*(biome<.5?1.:.31);
  c+=top*.12*exp(-3.1*length(vec2(uv.x-.25,uv.y-1.17)));
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(23.2,71.7)))*5432.);
  c+=(grain-.5)*.008;
  gl_FragColor=vec4(c,1.);
}`;

export const meshVert = `
attribute vec3 pos,norm,col;
attribute float emission;
varying vec3 world,n,color;
varying float glow;
${camera}
void main(){
 world=pos;n=norm;color=col;glow=emission;
 if(emission>=4.){
   glow=.24+.76*pow(.5+.5*cos(time*.7854),14.);
   color=mix(col*.44,col,glow);
 } else if(emission>=2.){
   glow-=2.;
   world+=vec3(sin(time*.25+pos.z*.045)*.56, sin(time*.61+pos.x*.13+pos.y*.3)*.22,cos(time*.23+pos.x*.06)*.38);
 }
 gl_Position=project(world);
}`;

export const shadowVert = `
attribute vec3 pos;
varying highp float elevation;
void main(){
 elevation=clamp((pos.y+65.)/135.,0.,.99999);
 vec2 uv=(pos.xz+pos.y*vec2(.46,.29))/345.;
 gl_Position=vec4(uv,1.-2.*elevation,1.);
}`;
export const shadowFrag = `
precision highp float;
varying highp float elevation;
void main(){
 float v=elevation*255.;
 gl_FragColor=vec4(floor(v)/255.,fract(v),0.,1.);
}`;

export const meshFrag = `
precision highp float;
varying vec3 world,n,color;
varying float glow;
uniform vec3 eye,forward,water;
uniform float time,biome,lamps,ping,visibility;
uniform sampler2D shadowMap;
uniform float shadowSize;
float obscured(vec2 uv){
 vec2 rg=texture2D(shadowMap,uv).rg;
 float height=(rg.r+rg.g/255.)*135.-65.;
 return smoothstep(.20,.65,height-world.y);
}
float hash(vec2 p){return fract(sin(dot(p,vec2(126.7,257.3)))*19313.351);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
}
void main(){
 vec3 delta=world-eye;float dist=max(.001,length(delta));
 vec3 direction=delta/dist;
 float sun=.30+.66*max(0.,dot(n,normalize(vec3(-.42,.81,-.35))))+.12*max(0.,-n.y);
 float beam=lamps*smoothstep(.63,.949,dot(direction,forward))*exp(-dist*.042);
 vec2 shadowUv=(world.xz+world.y*vec2(.46,.29))/690.+.5;
 vec2 st=shadowUv*shadowSize-.5;
 vec2 corner=(floor(st)+.5)/shadowSize,f=smoothstep(vec2(0.),vec2(1.),fract(st)),pixel=vec2(1./shadowSize,0.);
 float shade=mix(mix(obscured(corner),obscured(corner+pixel),f.x),mix(obscured(corner+pixel.yx),obscured(corner+pixel+pixel.yx),f.x),f.y);
 vec2 p=world.xz;
 float detail=noise(p*.59+world.y*.64)*.16+noise(p*2.6)*.08;
 vec3 daylight=biome<.5?vec3(.73,.99,.93):(biome<1.5?vec3(.67,.78,.79):vec3(.47,.65,.89));
 float ambient=biome<.5?.49:(biome<1.5?.32:.27);
 vec3 surface=color*(.86+detail)*(daylight*(ambient+sun*.59)+vec3(.99,.95,.77)*beam*1.52);
 surface*=mix(vec3(1.),vec3(.43,.56,.62),shade);
 // Refracted light bands follow the seabed, not the camera.
 if(biome<.5){
   vec2 q=p*.60+vec2(time*.25,-time*.16);
   float a=sin(q.x+1.5*sin(q.y*.73))+sin(q.y+1.32*cos(q.x*.66))+.43*sin(q.x*.85+q.y);
   float caustic=pow(max(0.,1.-abs(a)*1.9),5.);
   surface+=vec3(.16,.24,.21)*caustic*(.24+.76*max(n.y,0.))*exp(-dist*.025)*(1.-shade);
 }
 surface=mix(surface,color*(1.22+glow*.40),min(glow,.9));
 if(biome>.5 && biome<1.5)surface+=vec3(.15,.039,0.)*min(beam+.12,.65)*max(0.,.3+n.y);
 vec3 trans=exp(-dist*visibility*vec3(1.28,1.,.89));
 vec3 result=mix(water,surface,trans);
 // Bioluminescent tissue remains visible at greater range than the seafloor.
 result+=color*glow*.26*exp(-dist*.012);
 if(ping>=0.){
   float rad=ping*31.;
   float ring=exp(-abs(dist-rad)*1.1)*exp(-rad*.008);
   result+=vec3(.13,.87,.73)*ring;
 }
 gl_FragColor=vec4(result,1.);
}`;

export const fishVert = `
attribute vec3 local,home,col;
attribute vec2 info;
varying vec3 color;
varying float distanceToEye;
${camera}
void main(){
 bool manta=info.y<0.;
 float t=time*abs(info.y)+info.x;
 vec3 c=home+vec3(sin(t)*6.,sin(t*1.7+info.x)*.40,cos(t)*4.);
 vec2 direction=normalize(vec2(cos(t)*6.,-sin(t)*4.));
 vec2 rightSide=vec2(-direction.y,direction.x);
 float tail=max(0.,-local.x)*sin(time*7.+info.x*11.)*.4;
 if(manta)tail*=.09;
 float flap=manta?pow(abs(local.z)/3.2,1.65)*sin(time*1.55+local.x*.21)*.98:0.;
 vec3 p=c+vec3(direction.x*local.x+rightSide.x*(local.z+tail),local.y+flap,direction.y*local.x+rightSide.y*(local.z+tail));
 gl_Position=project(p);distanceToEye=length(p-eye);color=col;
}`;
export const fishFrag = `
precision mediump float;
varying vec3 color;
varying float distanceToEye;
uniform vec3 water;
uniform float visibility;
void main(){gl_FragColor=vec4(mix(water,color,exp(-distanceToEye*visibility)),1.);}
`;
export const moteVert = `
attribute vec3 pos,info;
varying float opacity,kind,depth;
uniform float screenHeight;
${camera}
void main(){
 kind=info.z;
 vec3 p=pos;
 if(kind<.5){
   p=eye+mod(pos+vec3(time*.22,sin(time*.22+info.x)*.35,-time*.16)-eye,vec3(64.,30.,64.))-vec3(32.,15.,32.);
 } else if(kind<2.5){
   float t=fract(info.x+time*(kind<1.5?.078:.12));
   p+=vec3(sin(info.x*42.+t*5.)*t*1.8+t*t*2.8,t*(kind<1.5?11.:8.),cos(t*5.+info.x*34.)*t);
   opacity=(1.-smoothstep(.66,1.,t))*smoothstep(0.,.12,t);
 }
 else opacity=kind<3.5?.25+.75*pow(.5+.5*cos(time*.7854),14.):.7+.24*sin(time+info.x);
 vec4 clip=project(p);gl_Position=clip;
 depth=length(p-eye);
 if(kind<.5)opacity=.62*exp(-depth*.036)*smoothstep(.3,2.,depth);
 else opacity*=exp(-depth*.018);
 float size=kind<.5?info.y:(kind<1.5?info.y*1.7:info.y);
 gl_PointSize=clamp(size*screenHeight/max(1.,clip.w),1.,85.);
}`;
export const moteFrag = `
precision mediump float;
varying float opacity,kind,depth;
void main(){
 vec2 delta=gl_PointCoord*2.-1.;float r=length(delta);
 if(r>=1.)discard;
 if(kind>=2.5){
   vec3 tint=kind<3.5?vec3(.42,1.,.86):(kind<4.5?vec3(.33,.75,1.):vec3(.93,.61,.29));
   gl_FragColor=vec4(tint,exp(-r*r*5.5)*opacity*.29);
 }
 else if(kind<.5) gl_FragColor=vec4(.69,.88,.78,(1.-r*r)*opacity);
 else if(kind<1.5) gl_FragColor=vec4(.078,.107,.115,(1.-smoothstep(.12,1.,r))*.30*opacity);
 else gl_FragColor=vec4(.68,.85,.84,opacity*(.12+.58*exp(-abs(r-.76)*11.))*(1.-smoothstep(.83,1.,r)));
}`;
