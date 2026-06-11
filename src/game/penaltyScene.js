/* ============================================================
   PENALTY SHOOTOUT — 3D scene (vanilla Three.js, ES module)
   ------------------------------------------------------------
   Portable target for the repo's PenaltyScene.tsx. Same world
   coords + same control contract:
     setAimNDC(x,y)  -> raycasts onto goal plane, calls onAim(goalPt)
     fireShot(spec)  -> {tx,ty,keeperDir,keeperHigh}; calls onResult once
   Each builder (buildStadium / buildPitch / buildGoal / makeFootballer)
   maps 1:1 to an R3F component; the useFrame loop = update().
   ============================================================ */
import * as THREE from 'three';

const GOAL_W = 7.32, GOAL_H = 2.44, POST_R = 0.06, NET_D = 1.7;
const SPOT_Z = 9.4, BALL_R = 0.11;
const RUNUP_T = 0.62, FLIGHT_T = 0.72;

const easeOut  = x => 1 - Math.pow(1 - x, 2);
const easeIn   = x => x * x;
const easeInOut= x => x < .5 ? 2*x*x : 1 - Math.pow(-2*x+2,2)/2;
const lerp = (a,b,t)=>a+(b-a)*t;
const isLight = hex => { const h=(hex||'').replace('#',''); if(h.length<6) return false;
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return (0.299*r+0.587*g+0.114*b)>150; };

/* ---------------- procedural textures ---------------- */
function grassTexture(night){
  const c=document.createElement('canvas'); c.width=c.height=512; const x=c.getContext('2d');
  x.fillStyle=night?'#33A044':'#2c7e38'; x.fillRect(0,0,512,512);
  for(let i=0;i<16;i++){ x.fillStyle = night?(i%2?'#3CB44F':'#2F953F'):(i%2?'#2f8a3d':'#2a7836'); x.fillRect(0,i*32,512,32); }
  for(let i=0;i<26000;i++){ x.fillStyle=`rgba(${Math.random()<.5?'10,50,16':'180,220,140'},${Math.random()*0.05})`;
    x.fillRect(Math.random()*512,Math.random()*512,2,2); }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8; return t;
}
function pitchMarkTexture(){
  // crisp penalty-box markings painted over the box region, transparent elsewhere
  const S=1024, c=document.createElement('canvas'); c.width=c.height=S; const x=c.getContext('2d');
  x.clearRect(0,0,S,S);
  x.strokeStyle='rgba(255,255,255,.92)'; x.lineWidth=6; x.lineCap='round';
  // mapped so canvas covers 30m wide x 30m deep area centered on goalmouth
  const M = S/30, cx=S/2;            // metres -> px
  const yLine = y => S - 1 - y*M;    // depth z (0 at goal line) -> canvas y
  // goal line
  x.beginPath(); x.moveTo(cx-12*M,yLine(0)); x.lineTo(cx+12*M,yLine(0)); x.stroke();
  // 6-yard box (5.5m deep, ~9.16m half-width->use 5.5)
  x.strokeRect(cx-5.5*M, yLine(5.5), 11*M, 5.5*M);
  // 18-yard box (16.5m deep, 20.16m wide)
  x.strokeRect(cx-10*M, yLine(16.5), 20*M, 16.5*M);
  // penalty spot
  x.fillStyle='rgba(255,255,255,.95)'; x.beginPath(); x.arc(cx, yLine(11), 7, 0, 7); x.fill();
  // penalty arc (the D) — only the part outside the box
  x.beginPath(); x.arc(cx, yLine(11), 9.15*M, Math.PI*1.18, Math.PI*1.82); x.stroke();
  const t=new THREE.CanvasTexture(c); t.anisotropy=8; t.flipY=false; return t;
}
function crowdTexture(night){
  const c=document.createElement('canvas'); c.width=512; c.height=256; const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,256);
  if(night){ g.addColorStop(0,'#43306E'); g.addColorStop(1,'#221840'); }
  else { g.addColorStop(0,'#2a3340'); g.addColorStop(1,'#11161f'); }
  x.fillStyle=g; x.fillRect(0,0,512,256);
  const cols=night
    ? ['#EFE6FF','#FF3D9A','#07C2C7','#FFB000','#C8F23C','#8F7BE8','#FF6B6B','#FFFFFF','#5B4A9E','#3FB6FF']
    : ['#c7c0b2','#b65555','#41618f','#c79a45','#5a8a5f','#e6e6e6','#6f5ba8','#c4793f','#2a2f38','#8a8f98'];
  for(let row=0;row<22;row++) for(let i=0;i<90;i++){
    x.fillStyle=cols[(Math.random()*cols.length)|0]; x.globalAlpha=.5+Math.random()*.4;
    const cx=2+Math.random()*508, cy=6+row*11+Math.random()*4;
    x.beginPath(); x.arc(cx,cy,2.4,0,7); x.fill();           // head
    x.globalAlpha*=.7; x.fillRect(cx-2.4,cy+2.2,4.8,4);       // shoulders
  }
  x.globalAlpha=1; const sh=x.createLinearGradient(0,0,0,256);
  sh.addColorStop(0,'rgba(0,0,0,.45)'); sh.addColorStop(.3,'rgba(0,0,0,0)'); sh.addColorStop(1,'rgba(0,0,0,.5)');
  x.fillStyle=sh; x.fillRect(0,0,512,256);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
function ballTexture(){
  const c=document.createElement('canvas'); c.width=c.height=256; const x=c.getContext('2d');
  x.fillStyle='#fbfbfb'; x.fillRect(0,0,256,256);
  // subtle cool panels + accent seams (modern ball, not retro buckyball)
  x.strokeStyle='#cfd6dd'; x.lineWidth=3;
  for(let i=0;i<6;i++){ x.beginPath(); x.moveTo(i*43,0); x.bezierCurveTo(i*43+30,90,i*43-30,170,i*43,256); x.stroke(); }
  x.fillStyle='#15120c';
  const star=(cx,cy,r)=>{ x.beginPath(); for(let i=0;i<5;i++){ const a=i/5*6.283-1.57;
    x.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r); } x.closePath(); x.fill(); };
  star(64,70,11); star(190,150,11);
  const t=new THREE.CanvasTexture(c); return t;
}
function nameplateTexture(name,no,ink='#fff'){
  const c=document.createElement('canvas'); c.width=256; c.height=300; const x=c.getContext('2d');
  x.clearRect(0,0,256,300); x.textAlign='center'; x.fillStyle=ink;
  x.font='800 40px Arial'; x.fillText((name||'').toUpperCase().slice(0,12),128,56);
  x.font='800 180px Arial'; x.fillText(String(no),128,250);
  const t=new THREE.CanvasTexture(c); return t;
}
function hoardingTexture(night){
  const c=document.createElement('canvas'); c.width=1024; c.height=128; const x=c.getContext('2d');
  if(night){
    for(let i=0;i<4;i++){ const o=i*256, limeBg=i%2===0;
      x.fillStyle=limeBg?'#C8F23C':'#15120C'; x.fillRect(o,0,256,128);
      x.fillStyle=limeBg?'#15120C':'#C8F23C'; x.font='900 italic 40px Arial'; x.textBaseline='middle';
      x.fillText('FAMILY DRAFT',o+24,66);
      x.fillStyle='#FF3D9A'; x.fillRect(o+222,50,12,12);
      x.fillStyle='#07C2C7'; x.fillRect(o+238,50,12,12);
    }
  } else {
    x.fillStyle='#0f0c08'; x.fillRect(0,0,1024,128);
    for(let i=0;i<4;i++){ const o=i*256;
      x.fillStyle='#C8F23C'; x.fillRect(o+14,40,8,48);
      x.fillStyle='#fff'; x.font='900 italic 40px Arial'; x.textBaseline='middle';
      x.fillText('FAMILY DRAFT',o+34,66);
      x.fillStyle='#FFB000'; x.fillRect(o+232,52,10,10);
      x.fillStyle='#07C2C7'; x.fillRect(o+246,52,10,10);
    }
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; t.repeat.set(6,1); return t;
}
function buntingTexture(){
  const c=document.createElement('canvas'); c.width=512; c.height=96; const x=c.getContext('2d');
  x.clearRect(0,0,512,96);
  const cols=['#C8F23C','#FF3D9A','#07C2C7','#FFB000','#F4EEE1'];
  x.strokeStyle='rgba(244,238,225,.55)'; x.lineWidth=3;
  x.beginPath(); x.moveTo(0,12); x.quadraticCurveTo(256,30,512,12); x.stroke();
  for(let i=0;i<16;i++){ const px=8+i*32, sag=12+Math.sin((px/512)*Math.PI)*16;
    x.fillStyle=cols[i%5];
    x.beginPath(); x.moveTo(px,sag); x.lineTo(px+22,sag); x.lineTo(px+11,sag+34); x.closePath(); x.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; return t;
}
function glowTexture(){
  const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d');
  const g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,250,225,.95)'); g.addColorStop(.35,'rgba(255,245,210,.35)'); g.addColorStop(1,'rgba(255,245,210,0)');
  x.fillStyle=g; x.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
function skyTexture(night){
  const c=document.createElement('canvas'); c.width=16; c.height=256; const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,256);
  if(night){ g.addColorStop(0,'#120D26'); g.addColorStop(.5,'#1D1438'); g.addColorStop(.85,'#2A1D4E'); g.addColorStop(1,'#34255E'); }
  else { g.addColorStop(0,'#2f7bd6'); g.addColorStop(.45,'#67aef0'); g.addColorStop(.8,'#bfe0f7'); g.addColorStop(1,'#e8f4fb'); }
  x.fillStyle=g; x.fillRect(0,0,16,256);
  const t=new THREE.CanvasTexture(c); return t;
}

/* ---------------- star rig (user-supplied GLB characters) ----------------
   Loads a rigged T-pose footballer (Mixamo-style bone names: Hips_01,
   LeftUpLeg_063, ...) and exposes the SAME virtual-parts contract as
   makeFootballer, so runShot/resetTaker/resetKeeper drive it unchanged.
   Rotations are authored in character space and solved onto bone locals. */
const MIXAMO_KEYS=['LeftForeArm','RightForeArm','LeftShoulder','RightShoulder','LeftToeBase','RightToeBase','LeftUpLeg','RightUpLeg','LeftHandThumb1','RightHandThumb1','LeftHand','RightHand','LeftFoot','RightFoot','LeftArm','RightArm','LeftLeg','RightLeg','Spine2','Spine1','Spine','Neck','Head','Hips'];
const VALVE_ALIASES={'Pelvis':'Hips','R_UpperArm':'RightArm','L_UpperArm':'LeftArm','R_Forearm':'RightForeArm','L_Forearm':'LeftForeArm',
  'R_Hand':'RightHand','L_Hand':'LeftHand','R_Clavicle':'RightShoulder','L_Clavicle':'LeftShoulder',
  'R_Thigh':'RightUpLeg','L_Thigh':'LeftUpLeg','R_Calf':'RightLeg','L_Calf':'LeftLeg',
  'R_Foot':'RightFoot','L_Foot':'LeftFoot','R_Toe0':'RightToeBase','L_Toe0':'LeftToeBase'};
function canonOf(name){
  const n=name.replace(/^mixamorig:?/i,'').replace(/_\d+$/,'');
  if(MIXAMO_KEYS.includes(n)) return n;
  for(const k in VALVE_ALIASES){ if(n.endsWith(k)) return VALVE_ALIASES[k]; }
  let best=null;                       // path-concatenated rigs: match by longest suffix
  for(const k of MIXAMO_KEYS){ if(n.endsWith(k) && (!best||k.length>best.length)) best=k; }
  return best;
}
async function loadModelFile(url){
  if(/\.fbx(\?|$)/i.test(url)){
    const m=await import('three/examples/jsm/loaders/FBXLoader.js');
    const o=await new m.FBXLoader().loadAsync(url); return {scene:o, animations:o.animations||[]};
  }
  const m=await import('three/examples/jsm/loaders/GLTFLoader.js');
  const g=await new m.GLTFLoader().loadAsync(url); return {scene:g.scene, animations:g.animations||[]};
}
async function loadStarRig(url){
  const g=await loadModelFile(url);
  return adaptStarRig(g.scene, g.animations);
}
/* graft kit pieces (e.g. socks/boots meshes) from a donor model onto a rig's leg bones.
   The donor geometry is split into left/right halves and parented to the matching
   shin/foot bones, so it rides the skeleton through every animation. */
async function graftKit(rig, cfg){
  const g=await loadModelFile(cfg.url);
  let srcH=0;
  g.scene.traverse(o=>{ if((o.isMesh||o.isSkinnedMesh)&&o.geometry){ o.geometry.computeBoundingBox(); srcH=Math.max(srcH,o.geometry.boundingBox.max.y); } });
  const s=(cfg.height||1.86)/Math.max(srcH,1e-6);
  const findBone=(c)=>{ let b=null; rig.root.traverse(o=>{ if(!b&&o.isBone&&canonOf(o.name)===c) b=o; }); return b; };
  const keepP=rig.root.position.clone(), keepQ=rig.root.quaternion.clone();
  rig.root.position.set(0,0,0); rig.root.quaternion.set(0,0,0,1);
  if(rig.stopKick) rig.stopKick();                  // bind pose for a clean world-space attach
  rig.root.updateMatrixWorld(true);
  for(const part of cfg.parts){
    let src=null; g.scene.traverse(o=>{ if(!src&&(o.isMesh||o.isSkinnedMesh)&&o.material&&o.material.name===part.mat) src=o; });
    if(!src) continue;
    const pos=src.geometry.attributes.position, idx=src.geometry.index;
    const triCount=(idx?idx.count:pos.count)/3;
    for(const side of [1,-1]){                       // mixamo bind: left leg is +x
      const arr=[];
      for(let t=0;t<triCount;t++){
        let cx=0, cy=0; for(let j=0;j<3;j++){ const vi=idx?idx.getX(t*3+j):t*3+j; cx+=pos.getX(vi); cy+=pos.getY(vi); }
        cy=cy*s/3;
        if(part.yMin!==undefined && cy<part.yMin) continue;   // trim donor foot portion etc.
        if(cx*side>0){ for(let j=0;j<3;j++){ const vi=idx?idx.getX(t*3+j):t*3+j;
          arr.push(pos.getX(vi)*s, pos.getY(vi)*s, pos.getZ(vi)*s); } }
      }
      if(!arr.length) continue;
      // center the piece on the target leg's actual bone axis (donor legs sit at
      // different x/z), so it hugs the limb instead of bulging off the heel
      const kneeB=findBone((side>0?'Left':'Right')+'Leg'), ankleB=findBone((side>0?'Left':'Right')+'Foot');
      if(part.align!==false && kneeB && ankleB){
        const kp=kneeB.getWorldPosition(new THREE.Vector3()), ap=ankleB.getWorldPosition(new THREE.Vector3());
        const cxT=(kp.x+ap.x)/2, czT=(kp.z+ap.z)/2;
        let mx0=0,mz0=0; const n0=arr.length/3;
        for(let i=0;i<arr.length;i+=3){ mx0+=arr[i]; mz0+=arr[i+2]; } mx0/=n0; mz0/=n0;
        for(let i=0;i<arr.length;i+=3){ arr[i]+=cxT-mx0; arr[i+2]+=czT-mz0; }
      }
      // inflate the piece around its own leg axis so it wraps a differently-shaped calf/foot;
      // optional taper fades the inflation out toward the ankle so the cuff hugs the leg
      const inf=part.inflate||1;
      if(inf!==1){ let mx=0,mz=0; const n=arr.length/3;
        for(let i=0;i<arr.length;i+=3){ mx+=arr[i]; mz+=arr[i+2]; } mx/=n; mz/=n;
        for(let i=0;i<arr.length;i+=3){
          let k=inf;
          if(part.taper){ const f=Math.max(0,Math.min(1,(arr[i+1]-part.taper[0])/(part.taper[1]-part.taper[0]))); k=1+(inf-1)*f; }
          arr[i]=mx+(arr[i]-mx)*k; arr[i+2]=mz+(arr[i+2]-mz)*k; }
        // hem: flatten everything below the cuff line into a clean horizontal edge
        if(part.hem!==undefined){ for(let i=0;i<arr.length;i+=3){
          if(arr[i+1]<part.hem){ arr[i+1]=part.hem; } } }
        // tube: smooth the ankle region into a simple tapered cylinder so the donor's
        // foot-shaped lower edge disappears cleanly into the boot
        if(part.tube){ const yb=part.tube.below, rr=part.tube.r, yh=(part.hem!==undefined?part.hem:yb-0.06);
          for(let i=0;i<arr.length;i+=3){ const y=arr[i+1]; if(y<yb){
            const dx=arr[i]-mx, dz=arr[i+2]-mz, d=Math.hypot(dx,dz)||1e-6;
            const t=Math.min(1,(yb-y)/Math.max(yb-yh,1e-6));
            const nd=d+(rr-d)*t;
            arr[i]=mx+dx/d*nd; arr[i+2]=mz+dz/d*nd; } } } }
      const ng=new THREE.BufferGeometry();
      ng.setAttribute('position', new THREE.Float32BufferAttribute(arr,3));
      ng.computeVertexNormals();
      const m=new THREE.Mesh(ng, new THREE.MeshStandardMaterial({color:part.color, roughness:.8, metalness:.05}));
      m.castShadow=true; m.frustumCulled=false;
      const b=findBone((side>0?'Left':'Right')+(part.to==='shin'?'Leg':'Foot'));
      if(b) b.attach(m); else rig.root.add(m);
      // under-sleeve: a plain tube beneath the sock fills the donor edge's notches
      if(part.underTube && b && ankleB){
        const ut=part.underTube, ap2=ankleB.getWorldPosition(new THREE.Vector3());
        const cyl=new THREE.Mesh(new THREE.CylinderGeometry(ut.r,ut.r,ut.top-ut.bottom,12),
          new THREE.MeshStandardMaterial({color:part.color, roughness:.85}));
        cyl.position.set(ap2.x,(ut.top+ut.bottom)/2,ap2.z);
        cyl.castShadow=true; cyl.frustumCulled=false;
        b.attach(cyl);
      }
    }
  }
  rig.root.position.copy(keepP); rig.root.quaternion.copy(keepQ);
  return rig;
}
function adaptStarRig(inner,anims,{height=1.86}={}){
  inner.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(inner);
  const s=height/box.getSize(new THREE.Vector3()).y;
  inner.scale.setScalar(s); inner.updateMatrixWorld(true);
  const b2=new THREE.Box3().setFromObject(inner), c=b2.getCenter(new THREE.Vector3());
  inner.position.set(inner.position.x-c.x, inner.position.y-b2.min.y, inner.position.z-c.z);
  const root=new THREE.Group(); root.add(inner); root.updateMatrixWorld(true);
  inner.traverse(o=>{ if(o.isMesh||o.isSkinnedMesh){ o.frustumCulled=false; o.castShadow=true; } });

  const find=(p)=>{ const TARGET={hips:'Hips',spine:'Spine',armLsh:'LeftArm',armLfore:'LeftForeArm',armRsh:'RightArm',armRfore:'RightForeArm',
    legLhip:'LeftUpLeg',legLknee:'LeftLeg',legRhip:'RightUpLeg',legRknee:'RightLeg'}[p]||p;
    let f=null; inner.traverse(o=>{ if(!f&&o.isBone && canonOf(o.name)===TARGET) f=o; }); return f; };
  const NAMES={hips:'hips',spine:'spine',armLsh:'armLsh',armLfore:'armLfore',armRsh:'armRsh',armRfore:'armRfore',
    legLhip:'legLhip',legLknee:'legLknee',legRhip:'legRhip',legRknee:'legRknee'};
  const B={}, rest={}, restP={}, restLoc={};
  for(const k in NAMES){ const b=find(NAMES[k]); if(!b) continue; B[k]=b;
    rest[k]=b.getWorldQuaternion(new THREE.Quaternion());
    restP[k]=b.parent.getWorldQuaternion(new THREE.Quaternion());
    restLoc[k]={q:b.quaternion.clone(), p:b.position.clone()}; }

  // virtual parts (same names/semantics as the procedural rig)
  const V={ spine:{rotation:new THREE.Euler(0.03,0,0)}, hips:{position:new THREE.Vector3(0,0.8,0)},
    legL:{hip:{rotation:new THREE.Euler(.04,0,0)},knee:{rotation:new THREE.Euler(.1,0,0)}},
    legR:{hip:{rotation:new THREE.Euler(-.04,0,0)},knee:{rotation:new THREE.Euler(.1,0,0)}},
    armL:{sh:{rotation:new THREE.Euler()},up:{rotation:new THREE.Euler()}},
    armR:{sh:{rotation:new THREE.Euler()},up:{rotation:new THREE.Euler()}} };

  // calibration: sign/offset map from virtual eulers to char-space deltas.
  // armDown auto-adapts to the bind pose: T-pose folds ~76°, an A-pose model needs less.
  const CAL={hipX:1, kneeX:1, armX:1, spineX:1, armDown:1.32};
  if(B.armLsh && B.armLfore){
    const va=new THREE.Vector3(), vb=new THREE.Vector3();
    B.armLsh.getWorldPosition(va); B.armLfore.getWorldPosition(vb);
    const d=vb.sub(va).normalize();
    const down=Math.asin(Math.max(-1,Math.min(1,-d.y)));   // how far the bind arms already hang
    CAL.armDown=Math.max(0, 1.32-down);
  }
  const AX=new THREE.Vector3(1,0,0), AZ=new THREE.Vector3(0,0,1);
  const qa=new THREE.Quaternion(), qb=new THREE.Quaternion(), qt=new THREE.Quaternion();
  const dXZ=(x,z,out)=>{ qa.setFromAxisAngle(AX,x); qb.setFromAxisAngle(AZ,z); return out.copy(qb).multiply(qa); };
  const setBone=(k,Dcomb,DparComb)=>{ const b=B[k]; if(!b) return;
    qt.copy(restP[k]).premultiply(DparComb).invert();           // inv(parent actual world)
    b.quaternion.copy(qt).multiply(Dcomb).multiply(rest[k]); };

  const Dsp=new THREE.Quaternion(), Dsh=new THREE.Quaternion(), Dup=new THREE.Quaternion(),
        Dhip=new THREE.Quaternion(), Dkn=new THREE.Quaternion(), Dc1=new THREE.Quaternion(), Dc2=new THREE.Quaternion(),
        ID=new THREE.Quaternion();
  function applyPose(){
    // spine (upper body inherits)
    dXZ(V.spine.rotation.x*CAL.spineX, V.spine.rotation.z, Dsp);
    setBone('spine',Dsp,ID);
    // arms: rest offset folds T-pose down to hanging; virtual z adds on top
    [['armLsh','armLfore',V.armL,-1],['armRsh','armRfore',V.armR, 1]].forEach(([shK,foreK,v,side])=>{
      dXZ(v.sh.rotation.x*CAL.armX, v.sh.rotation.z + side*CAL.armDown, Dsh);
      Dc1.copy(Dsp).multiply(Dsh);
      setBone(shK,Dc1,Dsp);
      qa.setFromAxisAngle(AX, v.up.rotation.x*CAL.armX); Dc2.copy(Dc1).multiply(qa);
      setBone(foreK,Dc2,Dc1);
    });
    // legs
    [['legLhip','legLknee',V.legL],['legRhip','legRknee',V.legR]].forEach(([hipK,kneeK,v])=>{
      dXZ(v.hip.rotation.x*CAL.hipX, v.hip.rotation.z, Dhip);
      setBone(hipK,Dhip,ID);
      qa.setFromAxisAngle(AX, v.knee.rotation.x*CAL.kneeX); Dkn.copy(Dhip).multiply(qa);
      setBone(kneeK,Dkn,Dhip);
    });
    // hips bob (keeper pre-hop): world-y delta mapped into bone local units
    if(B.hips){ const dy=(V.hips.position.y-0.8);
      const lv=new THREE.Vector3(0,dy/s,0).applyQuaternion(qt.copy(restP.hips).invert());
      B.hips.position.copy(restLoc.hips.p).add(lv); }
  }
  // canonical bone dictionary for clip retargeting (strip mixamorig prefix + numeric suffix)
  const CANON={}, BINDL={};
  inner.traverse(o=>{ if(o.isBone){ const c=canonOf(o.name);
    if(c && !CANON[c]){ CANON[c]=o.name; BINDL[c]={q:o.quaternion.clone(), p:o.position.clone(),
      w:o.getWorldQuaternion(new THREE.Quaternion()), pw:o.parent.getWorldQuaternion(new THREE.Quaternion()), bone:o}; } } });
  function restoreBind(){ for(const c in BINDL){ BINDL[c].bone.quaternion.copy(BINDL[c].q); BINDL[c].bone.position.copy(BINDL[c].p); } }

  // optional idle clip: play the model's own authored animation between shots
  let mixer=null, idleAction=null, clipOn=false;
  if(anims && anims.length){
    mixer=new THREE.AnimationMixer(inner);
    const clip=anims[0].clone();
    // strip position tracks so the clip can't wander the character around
    clip.tracks=clip.tracks.filter(t=>!/\.position$/.test(t.name));
    idleAction=mixer.clipAction(clip); idleAction.setLoop(THREE.LoopRepeat);
  }
  function setIdleClip(on){
    if(!idleAction || on===clipOn) return; clipOn=on;
    if(on){
      idleAction.enabled=true; idleAction.setEffectiveWeight(1); idleAction.paused=false;
      if(!idleAction.isRunning()) idleAction.play();
      // resume mid-cycle so the clip's slow lead-in never reads as a freeze
      idleAction.time=0.4+Math.random()*Math.max(0.1, idleAction.getClip().duration-0.8);
      idleAction.fadeIn(0.18);
    }
    else { idleAction.fadeOut(0.12); setTimeout(()=>{ if(!clipOn) idleAction.stop(); },140); }
  }
  // neutral-stance reference (bind + arms folded down): captured once for frame0-mode retargets
  applyPose();
  inner.updateMatrixWorld(true);
  const NEUT={}; for(const c in BINDL){ NEUT[c]={q:BINDL[c].bone.quaternion.clone(), w:BINDL[c].bone.getWorldQuaternion(new THREE.Quaternion())}; }
  restoreBind();

  // retarget + play a foreign mixamo clip (kicks, walks...).
  // kd = {id, clip, rest, window:[t0,t1]?, loop?} ; rest maps canonical bone -> source bind local quat;
  // we transfer per-keyframe DELTAS from the source bind pose onto ours.
  const kickActions={};
  // Build a retargeted action by WORLD-SPACE matching: each target bone's world
  // orientation tracks the source bone's sampled world orientation (with a constant
  // per-bone bind correction K). Bind-pose agnostic: T-pose, A-pose, odd rigs all work.
  const RIG_CHAIN={Hips:null,Spine:'Hips',Spine1:'Spine',Spine2:'Spine1',Neck:'Spine2',Head:'Neck',
    LeftShoulder:'Spine2',LeftArm:'LeftShoulder',LeftForeArm:'LeftArm',LeftHand:'LeftForeArm',
    RightShoulder:'Spine2',RightArm:'RightShoulder',RightForeArm:'RightArm',RightHand:'RightForeArm',
    LeftUpLeg:'Hips',LeftLeg:'LeftUpLeg',LeftFoot:'LeftLeg',LeftToeBase:'LeftFoot',
    RightUpLeg:'Hips',RightLeg:'RightUpLeg',RightFoot:'RightLeg',RightToeBase:'RightFoot'};
  function buildAction(kd){
    if(!kd.wt) return null;
    const mir=!!kd.mirror;
    const sw=(c)=>!mir?c : c.startsWith('Left')?'Right'+c.slice(4) : c.startsWith('Right')?'Left'+c.slice(5) : c;
    const mq=(q)=>{ if(mir){ q.y=-q.y; q.z=-q.z; } return q; };
    const t0=kd.window?kd.window[0]:0, t1=kd.window?kd.window[1]:kd.clip.duration;
    const wtimes=kd.wt.times;
    const idx=[]; for(let i=0;i<wtimes.length;i++){ if(wtimes[i]>=t0-1e-4 && wtimes[i]<=t1+1e-4) idx.push(i); }
    if(idx.length<2) return null;
    const qa=new THREE.Quaternion(), qb=new THREE.Quaternion(), qc=new THREE.Quaternion(), qd=new THREE.Quaternion(), qe=new THREE.Quaternion();
    // slight arm abduction keeps swinging arms from clipping through the torso on bulky models
    const ARM_OUT={LeftArm:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), 0.20),
                   RightArm:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-0.20)};
    const srcW=(c,i,out)=>{ const arr=kd.wt.map[sw(c)]; if(!arr) return null; out.fromArray(arr,i*4); return mq(out); };
    const srcBW=(c,out)=>{ const r=kd.rest[sw(c)]; if(!r) return null; out.copy(r.w); return mq(out); };
    const tracks=[];
    for(const c in RIG_CHAIN){
      const tb=BINDL[c];
      if(!tb || !kd.wt.map[sw(c)] || !kd.rest[sw(c)]) continue;
      srcBW(c,qa); const K=qa.clone().invert().multiply(tb.w);
      let anc=RIG_CHAIN[c]; while(anc && !(kd.wt.map[sw(anc)] && BINDL[anc] && kd.rest[sw(anc)])) anc=RIG_CHAIN[anc];
      let Kanc=null, ancBindWInv=null;
      if(anc){ srcBW(anc,qb); Kanc=qb.clone().invert().multiply(BINDL[anc].w); ancBindWInv=BINDL[anc].w.clone().invert(); }
      const times=[], vals=[];
      for(const i of idx){
        srcW(c,i,qc); qc.multiply(K);                                     // desired world
        if(ARM_OUT[c]) qc.premultiply(ARM_OUT[c]);
        if(anc){ srcW(anc,i,qd); qd.multiply(Kanc).multiply(ancBindWInv).multiply(tb.pw); }
        else qd.copy(tb.pw);                                              // parent actual world
        qe.copy(qd).invert().multiply(qc);                                // local
        times.push(wtimes[i]-t0); vals.push(qe.x,qe.y,qe.z,qe.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(CANON[c]+'.quaternion', times, vals));
    }
    if(!tracks.length) return null;
    const clip=new THREE.AnimationClip('clip_'+kd.id+(mir?'_m':''), -1, tracks);
    const a=mixer.clipAction(clip);
    if(kd.loop){ a.setLoop(THREE.LoopRepeat); } else { a.setLoop(THREE.LoopOnce); a.clampWhenFinished=true; }
    return a;
  }
  function playKick(kd, timeScale){
    if(!mixer) mixer=new THREE.AnimationMixer(inner);
    if(!kickActions[kd.id]) kickActions[kd.id]=buildAction(kd);
    const a=kickActions[kd.id]; if(!a) return false;
    if(idleAction && clipOn){ idleAction.stop(); clipOn=false; }
    for(const k in kickActions){ if(kickActions[k] && kickActions[k]!==a) kickActions[k].stop(); }
    a.timeScale=timeScale||1;
    rig.kickActive=true;
    a.reset().play();
    return true;
  }
  function scrubKick(kd, f, rebuild){
    if(!mixer) mixer=new THREE.AnimationMixer(inner);
    if(rebuild && kickActions[kd.id]){ kickActions[kd.id].stop(); mixer.uncacheClip(kickActions[kd.id].getClip()); delete kickActions[kd.id]; }
    if(!kickActions[kd.id]) kickActions[kd.id]=buildAction(kd);
    const a=kickActions[kd.id]; if(!a) return false;
    rig.kickActive=true;
    a.reset().play(); a.paused=true; a.time=f*a.getClip().duration; mixer.update(0);
    return a.getClip().duration;
  }
  function stopKick(){
    rig.kickActive=false;
    for(const k in kickActions){ if(kickActions[k]) kickActions[k].stop(); }
    restoreBind();
  }
  // high socks + boots: rigid pieces attached to shin/foot bones (kits are baked textures)
  function addKit(opts){
    if(rig._kit) return; rig._kit=true;
    restoreBind(); root.updateMatrixWorld(true);
    const up=new THREE.Vector3(0,1,0), a=new THREE.Vector3(), b=new THREE.Vector3();
    [['LeftLeg','LeftFoot','LeftToeBase'],['RightLeg','RightFoot','RightToeBase']].forEach(([shinK,footK,toeK])=>{
      const shin=BINDL[shinK]&&BINDL[shinK].bone, foot=BINDL[footK]&&BINDL[footK].bone, toe=BINDL[toeK]&&BINDL[toeK].bone;
      if(shin && foot && opts.sock){
        shin.getWorldPosition(a); foot.getWorldPosition(b);
        const dirv=b.clone().sub(a), len=dirv.length();
        const mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.066,0.058,len*0.82,12),
          new THREE.MeshStandardMaterial({color:opts.sock, roughness:.85}));
        mesh.position.copy(a).addScaledVector(dirv,0.5);
        mesh.quaternion.setFromUnitVectors(up, dirv.clone().normalize());
        mesh.castShadow=true;
        shin.attach(mesh);
      }
      if(foot && toe && opts.boot){
        foot.getWorldPosition(a); toe.getWorldPosition(b);
        const dirv=b.clone().sub(a), len=Math.max(dirv.length(),0.12);
        const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.055,14,12),
          new THREE.MeshStandardMaterial({color:opts.boot, roughness:.45, metalness:.1}));
        mesh.scale.set(0.95, len*1.45/0.11, 0.8);          // long axis along the foot
        mesh.position.copy(a).addScaledVector(dirv,0.62);
        mesh.quaternion.setFromUnitVectors(up, dirv.clone().normalize());
        mesh.castShadow=true;
        foot.attach(mesh);
      }
    });
  }
  function tick(dt){ if((clipOn||rig.kickActive) && mixer){ mixer.update(dt); } else applyPose(); }

  // keep feet planted: bent knees in a clip shorten the legs, which otherwise floats
  // the character above the turf (bind pose feet define y=0)
  const footB=['LeftFoot','RightFoot'].map(k=>BINDL[k]&&BINDL[k].bone).filter(Boolean);
  const footV=new THREE.Vector3();
  function lowestFootY(){ let mn=Infinity; root.updateMatrixWorld(true);
    for(const f of footB){ footV.setFromMatrixPosition(f.matrixWorld); root.worldToLocal(footV); mn=Math.min(mn,footV.y); }
    return mn; }
  const ankleY0=footB.length?lowestFootY():0;
  function groundFeet(){ if(!footB.length) return; inner.position.y-=(lowestFootY()-ankleY0); }

  const rig={ root, parts:{spine:V.spine, hips:V.hips, legL:V.legL, legR:V.legR, armL:V.armL, armR:V.armR},
    applyPose, tick, setIdleClip, playKick, scrubKick, stopKick, addKit, groundFeet, kickActive:false, hasClip:!!idleAction,
    _cal:CAL, _bones:Object.fromEntries(Object.keys(NAMES).map(k=>[k, B[k]?B[k].name:null])), isStar:true };
  return rig;
}

/* ---------------- footballer rig ---------------- */
let __toonGrad=null;
function toonGrad(){ if(__toonGrad) return __toonGrad;
  const d=new Uint8Array([110,190,255]);
  __toonGrad=new THREE.DataTexture(d,3,1,THREE.RedFormat);
  __toonGrad.minFilter=__toonGrad.magFilter=THREE.NearestFilter; __toonGrad.needsUpdate=true;
  return __toonGrad; }
function limb(len, rTop, rBot, mat){
  const g=new THREE.Group();
  const geo=new THREE.CapsuleGeometry((rTop+rBot)/2, len, 4, 10);
  const m=new THREE.Mesh(geo, mat); m.position.y=-len/2; m.castShadow=true; g.add(m);
  const end=new THREE.Group(); end.position.y=-len; g.add(end);
  return {g, end, mesh:m};
}
function makeFootballer({shirt,shorts,socks,trim,name,no,keeper,toon}){
  // varied skin + hair per player (deterministic from kit/name)
  const h=(String(shirt)+(name||'')+(keeper?'K':'')).split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  const SKIN = toon ? ['#E8B98C','#CE9468','#9C6844','#6E4730'][h%4] : '#e0a87f';
  const HAIR = toon ? ['#16100a','#2E2014','#4A331E','#C9A24B'][(h>>2)%4] : '#1c1409';
  const M=(c,r=.7)=> toon
    ? new THREE.MeshToonMaterial({color:c, gradientMap:toonGrad()})
    : new THREE.MeshStandardMaterial({color:c, roughness:r, metalness:.02});
  const matShirt=M(shirt,.6), matShorts=M(shorts||'#f2f2f2',.7), matSock=M(socks||shirt,.75),
        matSkin=M(SKIN,.82), matBoot=M('#16140f',.42), matGlove=keeper?M('#f4f4f4',.6):matSkin, matHair=M(HAIR,.9),
        matTrim=M(trim||'#ffffff',.7);
  const root=new THREE.Group();

  // articulated segment: tapered limb + joint sphere at the pivot + rounded end cap
  const seg=(len,rTop,rBot,mat)=>{ const g=new THREE.Group();
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBot,len,14),mat); m.position.y=-len/2; m.castShadow=true; g.add(m);
    const j=new THREE.Mesh(new THREE.SphereGeometry(rTop*1.03,12,12),mat); j.castShadow=true; g.add(j);
    const e=new THREE.Mesh(new THREE.SphereGeometry(rBot*1.03,12,12),mat); e.position.y=-len; e.castShadow=true; g.add(e);
    const end=new THREE.Group(); end.position.y=-len; g.add(end);
    return {g,end}; };

  // pelvis / hips
  const hips=new THREE.Group(); hips.position.y=0.92; root.add(hips);
  const pelvis=new THREE.Mesh(new THREE.SphereGeometry(0.16,16,12),matShorts); pelvis.scale.set(1.12,0.82,0.82); pelvis.castShadow=true; hips.add(pelvis);
  const shortsM=new THREE.Mesh(new THREE.CylinderGeometry(0.185,0.205,0.2,14),matShorts); shortsM.position.y=-0.12; shortsM.castShadow=true; hips.add(shortsM);

  // torso: belly -> ribcage (wider at shoulders) -> blend
  const spine=new THREE.Group(); hips.add(spine);
  const belly=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.15,0.24,14),matShirt); belly.scale.set(1.1,1,0.8); belly.position.y=0.13; belly.castShadow=true; spine.add(belly);
  const chest=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.16,0.28,14),matShirt); chest.scale.set(toon?1.3:1.16,1,0.78); chest.position.y=0.37; chest.castShadow=true; spine.add(chest);
  const chestTop=new THREE.Mesh(new THREE.SphereGeometry(0.2,16,12),matShirt); chestTop.scale.set(toon?1.34:1.18,0.66,0.78); chestTop.position.y=0.5; chestTop.castShadow=true; spine.add(chestTop);
  const delt=(s)=>{ const d=new THREE.Mesh(new THREE.SphereGeometry(toon?0.108:0.092,12,12),matShirt); d.position.set(s*(toon?0.24:0.215),0.49,0); d.scale.set(1,1,.85); d.castShadow=true; spine.add(d); };
  delt(-1); delt(1);
  if(name){ const plate=new THREE.Mesh(new THREE.PlaneGeometry(0.34,0.42),
      new THREE.MeshBasicMaterial({map:nameplateTexture(name,no,isLight(shirt)?'#16140f':'#fff'),transparent:true}));
    plate.position.set(0,0.4,-0.17); plate.rotation.y=Math.PI; spine.add(plate); }

  // neck + head
  const neck=new THREE.Group(); neck.position.y=0.56; spine.add(neck);
  if(toon){ const collar=new THREE.Mesh(new THREE.TorusGeometry(0.062,0.018,8,18),matTrim);
    collar.rotation.x=Math.PI/2; collar.position.y=0.555; collar.castShadow=true; spine.add(collar); }
  const neckM=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.062,0.1,10),matSkin); neckM.position.y=0.02; neckM.castShadow=true; neck.add(neckM);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.108,20,18),matSkin); head.scale.set(toon?1.0:0.94,toon?1.16:1.12,toon?1.04:1.0); head.position.y=0.15; head.castShadow=true; neck.add(head);
  const jaw=new THREE.Mesh(new THREE.SphereGeometry(0.082,16,14),matSkin); jaw.scale.set(0.92,0.82,0.96); jaw.position.set(0,0.11,0.012); neck.add(jaw);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(toon?0.125:0.116,18,16,0,6.3,0,1.55),matHair); hair.scale.set(0.99,1.04,1.03); hair.position.y=0.16; neck.add(hair);
  const nape=new THREE.Mesh(new THREE.SphereGeometry(0.1,16,14,0,6.3,1.15,0.95),matHair); nape.position.set(0,0.14,-0.018); neck.add(nape);
  if(toon){ // face: eyes + brows (visible on the keeper, who faces the camera)
    const eyeM=new THREE.MeshBasicMaterial({color:'#17120b'});
    const browM=new THREE.MeshBasicMaterial({color:HAIR});
    [-1,1].forEach(s=>{
      const e=new THREE.Mesh(new THREE.SphereGeometry(0.015,8,8),eyeM); e.position.set(s*0.042,0.162,0.106); neck.add(e);
      const b=new THREE.Mesh(new THREE.BoxGeometry(0.036,0.009,0.01),browM); b.position.set(s*0.042,0.186,0.105); b.rotation.z=s*-0.12; neck.add(b);
    });
  }

  // arms (shirt sleeve over upper arm; keeper gets long sleeves + big gloves)
  const mkArm=(side)=>{ const sh=new THREE.Group(); sh.position.set(side*(toon?0.24:0.215),0.49,0); spine.add(sh);
    const up=seg(0.27,0.058,0.046,matShirt); sh.add(up.g);
    if(toon){ const cuff=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.047,0.032,10),matTrim); cuff.position.y=-0.255; cuff.castShadow=true; up.g.add(cuff); }
    const fore=seg(0.25,0.044,0.036,(keeper&&toon)?matShirt:matSkin); up.end.add(fore.g);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(0.05,12,10),matGlove); hand.scale.set(0.85,1.25,0.6); if(keeper&&toon) hand.scale.set(1.2,1.55,0.9); hand.position.y=-0.045; hand.castShadow=true; fore.end.add(hand);
    return {sh, up:up.g, fore:fore.g}; };
  const armL=mkArm(-1), armR=mkArm(1);

  // legs (bare thigh, sock-covered shin, shoe-shaped boot)
  const mkLeg=(side)=>{ const hip=new THREE.Group(); hip.position.set(side*0.097,-0.08,0); hips.add(hip);
    const thigh=seg(0.43,toon?0.104:0.092,toon?0.078:0.07,matSkin); hip.add(thigh.g);
    const shin=seg(0.42,toon?0.072:0.066,0.05,matSock); thigh.end.add(shin.g);
    if(toon){ const st=new THREE.Mesh(new THREE.CylinderGeometry(0.074,0.071,0.05,10),matTrim); st.position.y=-0.055; shin.g.add(st); }
    const boot=new THREE.Group(); shin.end.add(boot);
    const bb=new THREE.Mesh(new THREE.SphereGeometry(toon?0.08:0.072,14,12),matBoot); bb.scale.set(1,0.82,toon?2.25:2.0); bb.position.set(0,-0.02,0.075); bb.castShadow=true; boot.add(bb);
    const sole=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.028,0.3),matBoot); sole.position.set(0,-0.05,0.075); boot.add(sole);
    return {hip, knee:shin.g, thigh:thigh.g, foot:boot}; };
  const legL=mkLeg(-1), legR=mkLeg(1);

  // contact shadow
  const cs=new THREE.Mesh(new THREE.CircleGeometry(0.4,24), new THREE.MeshBasicMaterial({color:'#0a1c0c',transparent:true,opacity:.3}));
  cs.rotation.x=-Math.PI/2; cs.position.y=0.012; root.add(cs);

  // base pose — slight knee/elbow bend reads more natural than stick-straight
  legL.hip.rotation.x=0.04; legR.hip.rotation.x=-0.04; legL.knee.rotation.x=0.1; legR.knee.rotation.x=0.1;
  armL.sh.rotation.z=0.13; armR.sh.rotation.z=-0.13; armL.up.rotation.x=0.12; armR.up.rotation.x=0.12;
  armL.fore.rotation.x=0.22; armR.fore.rotation.x=0.22; spine.rotation.x=0.03;
  if(keeper){ armL.sh.rotation.z=0.62; armR.sh.rotation.z=-0.62; armL.up.rotation.x=-0.42; armR.up.rotation.x=-0.42;
    armL.fore.rotation.x=0.55; armR.fore.rotation.x=0.55;
    legL.hip.rotation.x=0.2; legR.hip.rotation.x=0.2; legL.knee.rotation.x=0.44; legR.knee.rotation.x=0.44; hips.position.y=0.8; }

  return { root, parts:{hips,spine,neck,armL,armR,legL,legR,cs} };
}

/* ============================================================
   createPenaltyScene
   ============================================================ */
export function createPenaltyScene(container, { onAim, onResult, theme, stars }){
  const NIGHT = theme === 'night';
  const renderer=new THREE.WebGLRenderer({antialias:true, alpha:false, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.06;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene=new THREE.Scene();
  scene.fog=new THREE.Fog(NIGHT?'#171130':'#bfe0f7', 30, 80);
  const camera=new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  camera.position.set(0.0, 2.55, SPOT_Z+6.6); camera.lookAt(0,1.2,0);

  // sky dome
  const sky=new THREE.Mesh(new THREE.SphereGeometry(100,24,16),
    new THREE.MeshBasicMaterial({map:skyTexture(NIGHT), side:THREE.BackSide, fog:false}));
  scene.add(sky);
  const sun=new THREE.Mesh(new THREE.CircleGeometry(NIGHT?2.2:4,32), new THREE.MeshBasicMaterial({color:NIGHT?'#ece8fa':'#fff7e0',fog:false,transparent:true,opacity:NIGHT?.32:.9}));
  sun.position.set(-22,30,-60); sun.lookAt(0,0,0); scene.add(sun);

  // lights
  scene.add(new THREE.HemisphereLight(NIGHT?'#b9c6ff':'#dcefff', NIGHT?'#27503a':'#3f6e34', NIGHT?0.85:0.95));
  scene.add(new THREE.AmbientLight(NIGHT?'#d6d4ff':'#ffffff', NIGHT?0.26:0.18));
  const sunL=new THREE.DirectionalLight(NIGHT?'#f4f8ff':'#fff4e0', NIGHT?2.6:2.3);
  sunL.position.set(NIGHT?6:9, NIGHT?20:17, NIGHT?10:11); sunL.castShadow=true;
  sunL.shadow.mapSize.set(2048,2048);
  const sc=sunL.shadow.camera; sc.near=1; sc.far=50; sc.left=-16; sc.right=16; sc.top=16; sc.bottom=-12;
  sunL.shadow.bias=-0.0004; sunL.shadow.normalBias=0.02;
  scene.add(sunL);

  /* ---- pitch ---- */
  const grass=grassTexture(NIGHT); grass.repeat.set(22,22);
  const pitch=new THREE.Mesh(new THREE.PlaneGeometry(120,120), new THREE.MeshStandardMaterial({map:grass,roughness:.95}));
  pitch.rotation.x=-Math.PI/2; pitch.receiveShadow=true; scene.add(pitch);
  const marks=new THREE.Mesh(new THREE.PlaneGeometry(30,30),
    new THREE.MeshStandardMaterial({map:pitchMarkTexture(),transparent:true,roughness:.9,polygonOffset:true,polygonOffsetFactor:-2}));
  marks.rotation.x=-Math.PI/2; marks.position.set(0,0.02,15); marks.receiveShadow=true; scene.add(marks);
  // explicit penalty spot (insurance)
  const spot=new THREE.Mesh(new THREE.CircleGeometry(0.09,18), new THREE.MeshStandardMaterial({color:'#f4f4f4',roughness:.9}));
  spot.rotation.x=-Math.PI/2; spot.position.set(0,0.025,SPOT_Z); scene.add(spot);

  /* ---- goal + net ---- */
  const white=new THREE.MeshStandardMaterial({color:'#fafafa',roughness:.5});
  const goal=new THREE.Group();
  const postL=new THREE.Mesh(new THREE.CylinderGeometry(POST_R,POST_R,GOAL_H,16),white);
  postL.position.set(-GOAL_W/2,GOAL_H/2,0); postL.castShadow=true; goal.add(postL);
  const postR=postL.clone(); postR.position.x=GOAL_W/2; goal.add(postR);
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(POST_R,POST_R,GOAL_W+POST_R*2,16),white);
  bar.rotation.z=Math.PI/2; bar.position.set(0,GOAL_H,0); bar.castShadow=true; goal.add(bar);
  scene.add(goal);

  const netMat=new THREE.MeshStandardMaterial({color:'#eef3f7',transparent:true,opacity:.34,side:THREE.DoubleSide,roughness:1,
    wireframe:false});
  // back net (subdivided for ripple)
  const backGeo=new THREE.PlaneGeometry(GOAL_W,GOAL_H,24,10);
  const backNet=new THREE.Mesh(backGeo, makeNetMat()); backNet.position.set(0,GOAL_H/2,-NET_D); scene.add(backNet);
  const base=backGeo.attributes.position.array.slice();
  function makeNetMat(){ return new THREE.MeshBasicMaterial({map:netGrid(14,6),transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}); }
  function netGrid(rx,ry){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
    x.strokeStyle='rgba(255,255,255,.7)'; x.lineWidth=1.4; for(let i=0;i<=64;i+=8){ x.beginPath();x.moveTo(i,0);x.lineTo(i,64);x.stroke(); x.beginPath();x.moveTo(0,i);x.lineTo(64,i);x.stroke(); }
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry); return t; }
  const topNet=new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W,NET_D), makeNetMat());
  topNet.rotation.x=-Math.PI/2; topNet.position.set(0,GOAL_H,-NET_D/2); scene.add(topNet);
  [[-1],[1]].forEach(([s])=>{ const sd=new THREE.Mesh(new THREE.PlaneGeometry(NET_D,GOAL_H), makeNetMat());
    sd.rotation.y=Math.PI/2; sd.position.set(s*GOAL_W/2,GOAL_H/2,-NET_D/2); scene.add(sd); });

  /* ---- stadium ---- */
  const envProc=buildStadium(scene, NIGHT);
  if(stars && stars.stadium){ (async()=>{ try{
    const g=await loadModelFile(stars.stadium.url);
    const st=g.scene; st.updateMatrixWorld(true);
    const wrap=new THREE.Group(); wrap.add(st);
    // find the goal-post meshes — they define the pitch axis, scale, and ground
    const goalMeshes=[]; st.traverse(o=>{ if(o.isMesh&&o.material&&/goal_post/i.test(o.material.name||'')) goalMeshes.push(o); });
    const v=new THREE.Vector3();
    const measure=()=>{ const b=new THREE.Box3(); goalMeshes.forEach(m=>{ b.expandByObject(m); }); return b; };
    if(goalMeshes.length){
      let gb=measure(); let sz=gb.getSize(new THREE.Vector3());
      if(sz.x>sz.z) st.rotation.y=Math.PI/2;              // put the pitch axis on z
      wrap.updateMatrixWorld(true);
      gb=measure(); sz=gb.getSize(new THREE.Vector3());
      const k=GOAL_W/Math.max(0.001, Math.min(sz.x, sz.z)+0.0)*1.01;
      wrap.scale.setScalar(k); wrap.updateMatrixWorld(true);
      gb=measure();
      // slide the nearer goal mouth onto our goal line (z=0), centered, posts on the turf
      const ctr=gb.getCenter(new THREE.Vector3());
      wrap.position.set(-ctr.x, -gb.min.y, -gb.min.z);
      wrap.updateMatrixWorld(true);
      // hide the stadium's goals (one mesh covers both ends; ours plays the gameplay net)
      goalMeshes.forEach(m=>{ m.visible=false; });
    }
    st.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=true; o.frustumCulled=false; } });
    scene.add(wrap);
    envProc.visible=false;                                 // real stadium replaces the procedural one
    addCrowdDressing(scene);
  }catch(e){ console.warn('stadium glb failed, keeping procedural', e); } })(); }

  /* crowd dressing: instanced fans + waving flags in the stands */
  const crowdAnims=[];
  function addCrowdDressing(scene){
    // seat-rake samplers measured from the stadium GLB bowl: [x, y, z]
    const rakes=[
      ()=>{ const x=-44+Math.random()*88, f=Math.random(); return [x, 1.6+f*23, -4-f*26]; },   // behind goal
      ()=>{ const x=-44+Math.random()*88, f=Math.random(); return [x, 1.6+f*23, 92+f*26]; },   // far end
      ()=>{ const z=2+Math.random()*84,  f=Math.random(); return [-36-f*12, 1.6+f*22, z]; },   // west
      ()=>{ const z=2+Math.random()*84,  f=Math.random(); return [ 36+f*12, 1.6+f*22, z]; },   // east
    ];

    /* ---- fans: a packed wall directly behind the goal ---- */
    const COUNT=4200;
    const bodies=new THREE.InstancedMesh(new THREE.BoxGeometry(0.46,0.62,0.30), new THREE.MeshLambertMaterial(), COUNT);
    const heads =new THREE.InstancedMesh(new THREE.SphereGeometry(0.13,6,5),   new THREE.MeshLambertMaterial(), COUNT);
    const dummy=new THREE.Object3D(), C=new THREE.Color();
    const kitCols=['#C8F23C','#f5f5f5','#d2222a','#1b3a85','#f6c61c','#14924a','#e8e9ec','#23242a','#FF3D9A','#07C2C7','#7a1f86','#e3641b'];
    const skinCols=['#caa183','#8a5f3e','#5d3a22','#e9c29b'];
    for(let i=0;i<COUNT;i++){
      const [x,y,z]=rakes[0]();                              // behind the goal only
      dummy.position.set(x,y,z); dummy.rotation.set(0,0,0); dummy.updateMatrix();
      bodies.setMatrixAt(i,dummy.matrix);
      bodies.setColorAt(i, C.set(kitCols[(Math.random()*kitCols.length)|0]).multiplyScalar(0.7+Math.random()*0.5));
      dummy.position.y+=0.42; dummy.updateMatrix();
      heads.setMatrixAt(i,dummy.matrix);
      heads.setColorAt(i, C.set(skinCols[(Math.random()*skinCols.length)|0]));
    }
    bodies.instanceMatrix.needsUpdate=true; heads.instanceMatrix.needsUpdate=true;
    if(bodies.instanceColor) bodies.instanceColor.needsUpdate=true;
    if(heads.instanceColor) heads.instanceColor.needsUpdate=true;
    bodies.frustumCulled=false; heads.frustumCulled=false;
    scene.add(bodies); scene.add(heads);

    /* ---- waving flags on poles in the crowd ---- */
    const palettes=[['#d52b1e','#ffffff','#d52b1e'],['#1b3a85','#ffffff','#d2222a'],['#14924a','#f6c61c'],
      ['#d2222a','#f5f5f5','#14924a'],['#C8F23C','#15120C'],['#07C2C7','#ffffff','#FF3D9A'],
      ['#f6c61c','#1b3a85'],['#ffffff','#d2222a'],['#e3641b','#ffffff','#14924a']];
    function flagTexture(){
      const p=palettes[(Math.random()*palettes.length)|0];
      const c=document.createElement('canvas'); c.width=96; c.height=64; const x=c.getContext('2d');
      const horiz=Math.random()<0.5;
      p.forEach((col,i)=>{ x.fillStyle=col;
        if(horiz) x.fillRect(0,Math.floor(i*64/p.length),96,Math.ceil(64/p.length)+1);
        else x.fillRect(Math.floor(i*96/p.length),0,Math.ceil(96/p.length)+1,64); });
      if(Math.random()<0.25){ x.fillStyle=p[0]; x.beginPath(); x.arc(48,32,13,0,7); x.fill(); }
      const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t;
    }
    const poleM=new THREE.MeshLambertMaterial({color:'#d8dadf'});
    const flagSpots=[];
    for(let i=0;i<18;i++) flagSpots.push({s:rakes[0](), ry:0});   // all in the goal-end wall
    flagSpots.forEach(({s,ry},fi)=>{
      const g=new THREE.Group(); g.position.set(s[0],s[1],s[2]); g.rotation.y=ry; scene.add(g);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,2.4,6),poleM); pole.position.y=1.2; g.add(pole);
      const geo=new THREE.PlaneGeometry(1.7,1.05,10,5); geo.translate(0.85,0,0);
      const cloth=new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map:flagTexture(), side:THREE.DoubleSide}));
      cloth.position.y=1.95; g.add(cloth);
      const base=geo.attributes.position.array.slice();
      const phase=Math.random()*6.28, speed=2.2+Math.random()*1.6;
      crowdAnims.push((t)=>{
        const p=geo.attributes.position.array;
        for(let v=0;v<p.length;v+=3){
          const bx=base[v];                                  // 0..1.7 along the cloth
          p[v+2]=Math.sin(bx*3.4 - t*speed + phase)*0.16*(bx/1.7);
          p[v+1]=base[v+1] + Math.sin(bx*2.1 - t*speed*0.8 + phase)*0.05*(bx/1.7);
        }
        geo.attributes.position.needsUpdate=true;
      });
    });
  }

  /* ---- ball ---- */
  const ball=new THREE.Mesh(new THREE.SphereGeometry(BALL_R,28,28), new THREE.MeshStandardMaterial({map:ballTexture(),roughness:.38,metalness:.04}));
  ball.position.set(0,BALL_R,SPOT_Z); ball.castShadow=true; scene.add(ball);
  if(stars && stars.ball){ (async()=>{ try{
    const g=await loadModelFile(stars.ball);
    const b=g.scene; b.updateMatrixWorld(true);
    const bx=new THREE.Box3().setFromObject(b), sz=bx.getSize(new THREE.Vector3()), ctr=bx.getCenter(new THREE.Vector3());
    const k=(BALL_R*2)/Math.max(sz.x,sz.y,sz.z);
    b.scale.setScalar(k); b.position.set(-ctr.x*k,-ctr.y*k,-ctr.z*k);
    b.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.frustumCulled=false; } });
    ball.material.visible=false; ball.add(b);
  }catch(e){ console.warn('ball glb failed', e); } })(); }
  /* ---- retargetable clip loading (kicks + keeper saves) ---- */
  async function loadClipData(cfg){
    const g=await loadModelFile(cfg.url);
    const clip=(g.animations && g.animations[0]) || null;
    if(!clip) return null;
    const rest={};
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o=>{ if(o.isBone){ const c=canonOf(o.name); if(c && !rest[c]) rest[c]={q:o.quaternion.clone(), w:o.getWorldQuaternion(new THREE.Quaternion())}; } });
    // frame-0 reference: pose the source skeleton at each track's first key, then re-read
    const byName={}; g.scene.traverse(o=>{ if(o.isBone) byName[o.name]=o; });
    let hipsDx=0;
    for(const t of clip.tracks){
      const bn=t.name.split('.')[0];
      if(/\.quaternion$/.test(t.name)){ const b=byName[bn]; if(b) b.quaternion.fromArray(t.values,0); }
      if(/\.position$/.test(t.name) && canonOf(bn)==='Hips'){ hipsDx=t.values[t.values.length-3]-t.values[0]; }
    }
    g.scene.updateMatrixWorld(true);
    const rest0={};
    g.scene.traverse(o=>{ if(o.isBone){ const c=canonOf(o.name); if(c && !rest0[c]) rest0[c]={q:o.quaternion.clone(), w:o.getWorldQuaternion(new THREE.Quaternion())}; } });
    // world-orientation sampling: bake every canonical bone's world quaternion at 30fps.
    // buildAction retargets from these, so bind-pose differences between rigs never matter.
    const bones={}; g.scene.traverse(o=>{ if(o.isBone){ const c=canonOf(o.name); if(c && !bones[c]) bones[c]=o; } });
    const mixer=new THREE.AnimationMixer(g.scene);
    const action=mixer.clipAction(clip); action.play(); action.paused=true;
    const fps=30, n=Math.max(2, Math.round(clip.duration*fps)+1);
    const times=new Float32Array(n), map={};
    for(const c in bones) map[c]=new Float32Array(n*4);
    const wq=new THREE.Quaternion();
    for(let i=0;i<n;i++){
      const tt=Math.min(clip.duration, i/fps);
      action.time=tt; mixer.update(0); g.scene.updateMatrixWorld(true);
      times[i]=tt;
      for(const c in bones){ bones[c].getWorldQuaternion(wq); map[c][i*4]=wq.x; map[c][i*4+1]=wq.y; map[c][i*4+2]=wq.z; map[c][i*4+3]=wq.w; }
    }
    action.stop();
    const wt={times, map};
    return { id:cfg.id, clip, rest, rest0, wt, hipsDx, contact:cfg.contact||0.6, rT:cfg.rT||1.2,
      window:cfg.window||null, panenka:!!cfg.panenka, weight:cfg.weight||1, type:cfg.type||null, loop:!!cfg.loop };
  }
  const kickLib=[];
  if(stars && stars.kicks){ stars.kicks.forEach(cfg=>{ loadClipData(cfg).then(kd=>{ if(kd) kickLib.push(kd); })
    .catch(e=>console.warn('kick clip failed', cfg.url, e)); }); }
  const keeperLib=[];
  if(stars && stars.keeperClips){ stars.keeperClips.forEach(cfg=>{ loadClipData(cfg).then(kd=>{ if(!kd) return;
      keeperLib.push(kd);
      if(kd.type==='dive') keeperLib.push(Object.assign({}, kd, {id:kd.id+'_m', mirror:true, hipsDx:-kd.hipsDx}));
    }).catch(e=>console.warn('keeper clip failed', cfg.url, e)); }); }
  function pickKick(spec){
    if(!kickLib.length) return null;
    const soft=(typeof spec.power==='number'&&spec.power<0.35) && Math.abs(spec.tx)<1.1;
    const pan=kickLib.find(k=>k.panenka);
    if(soft && pan) return pan;
    const pool=kickLib.filter(k=>!k.panenka);
    if(!pool.length) return pan||null;
    let tw=pool.reduce((a,k)=>a+k.weight,0), r=Math.random()*tw;
    for(const k of pool){ r-=k.weight; if(r<=0) return k; }
    return pool[0];
  }
  // trail
  const trail=[]; for(let i=0;i<7;i++){ const m=new THREE.Mesh(new THREE.SphereGeometry(BALL_R*0.96,12,12),
    new THREE.MeshBasicMaterial({color:'#fff',transparent:true,opacity:0})); scene.add(m); trail.push(m); }
  const trailBuf=[];

  /* ---- reticle ---- */
  const reticle=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.17,0.26,32), new THREE.MeshBasicMaterial({color:'#C8F23C',transparent:true,opacity:.95,side:THREE.DoubleSide}));
  reticle.add(ring); const dot=new THREE.Mesh(new THREE.CircleGeometry(0.05,16), new THREE.MeshBasicMaterial({color:'#C8F23C'})); reticle.add(dot);
  scene.add(reticle);

  /* ---- players ---- */
  let takerRig=null, keeperRig=null;
  const starCache={};            // url -> adapted rig (or promise)
  let starKeeper=null, starTakers=null, currentStar=null;
  function loadStar(url){ if(!starCache[url]) starCache[url]=loadStarRig(url); return starCache[url]; }
  if(stars){
    if(stars.keeper) loadStar(stars.keeper).then(r=>{ starKeeper=r; if(lastMatch) setMatch(lastMatch); })
      .catch(e=>console.warn('keeper star failed', e));
    starTakers={};
  }
  function setStarTaker(id){
    currentStar=id || null;
    const entry=stars && stars.takers && stars.takers[id];
    const url=typeof entry==='string' ? entry : (entry && entry.url);
    currentStarSock=(entry && entry.sock) || null;
    currentStarBoot=(entry && entry.boot) || null;
    if(!url){ if(lastMatch) setMatch(lastMatch); return; }
    if(starTakers[id]){ if(lastMatch) setMatch(lastMatch); return; }
    loadStar(url).then(async r=>{
      if(entry && entry.recolor){ r.root.traverse(o=>{ if((o.isMesh||o.isSkinnedMesh) && o.material && entry.recolor[o.material.name]){
        o.material.color.set(entry.recolor[o.material.name]); o.material.roughness=0.82; } }); }
      if(entry && entry.hide){ r.root.traverse(o=>{ if((o.isMesh||o.isSkinnedMesh) && o.material && entry.hide.includes(o.material.name)) o.visible=false; }); }
      if(entry && entry.graft){ try{ await graftKit(r, entry.graft); }catch(e){ console.warn('graft failed', e); } }
      starTakers[id]=r; if(currentStar===id && lastMatch) setMatch(lastMatch);
    }).catch(e=>console.warn('taker star failed', e));
  }
  let currentStarSock=null, currentStarBoot=null;
  let lastMatch=null;
  const TAKER_HOME={x:-0.62,z:SPOT_Z+1.0}, TAKER_PLANT={x:-0.42,z:SPOT_Z+0.32};
  function setMatch(m){
    lastMatch=m;
    if(takerRig) scene.remove(takerRig.root);
    if(keeperRig) scene.remove(keeperRig.root);
    const starT = currentStar && starTakers && starTakers[currentStar];
    takerRig = starT || makeFootballer({shirt:m.youShirt,shorts:m.youShorts,socks:m.youSocks,trim:m.youTrim,name:m.starName,no:m.starNo,toon:NIGHT});
    // keeper: star keeper unless he's already taking the kick (no clones on the pitch)
    const keeperClash = stars && stars.takers && stars.keeperId && currentStar===stars.keeperId;
    keeperRig = (starKeeper && !keeperClash) ? starKeeper
      : makeFootballer({shirt:m.oppShirt,shorts:m.oppShorts,socks:m.oppSocks,trim:m.oppTrim,keeper:true,toon:NIGHT});
    takerRig.root.position.set(TAKER_HOME.x,0,TAKER_HOME.z); takerRig.root.rotation.y=Math.PI; scene.add(takerRig.root);
    keeperRig.root.position.set(0,0,0.35); keeperRig.root.rotation.y=0; keeperRig.root.rotation.z=0; scene.add(keeperRig.root);
    // belt + braces against skinned-mesh culling pops (covers kit add-ons too)
    [takerRig,keeperRig].forEach(r=>r.root.traverse(o=>{ if(o.isMesh||o.isSkinnedMesh) o.frustumCulled=false; }));
  }

  /* ---- aim raycast ---- */
  const ray=new THREE.Raycaster(); const goalPlane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  let aim={x:0,y:1.2};
  function setAimNDC(nx,ny){
    ray.setFromCamera(new THREE.Vector2(nx,ny),camera);
    const p=new THREE.Vector3(); const ok=ray.ray.intersectPlane(goalPlane,p);
    aim={ x:Math.max(-(GOAL_W/2-0.4),Math.min(GOAL_W/2-0.4, ok?p.x:0)),
          y:Math.max(0.35,Math.min(GOAL_H-0.25, ok?p.y:1.2)) };
    onAim&&onAim(aim);
  }
  let aiming=true; const setAiming=v=>{aiming=v;};
  function setAimPoint(x,y){ aim={x,y}; onAim&&onAim(aim); }
  function projectNDC(nx,ny){ ray.setFromCamera(new THREE.Vector2(nx,ny),camera);
    const p=new THREE.Vector3(); const ok=ray.ray.intersectPlane(goalPlane,p);
    return ok ? { x:p.x, y:Math.max(0.12,p.y) } : { x:0, y:1.2 }; }
  function projectGoal(x,y){ const v=new THREE.Vector3(x,y,0).project(camera); return { x:v.x*0.5+0.5, y:-v.y*0.5+0.5 }; }

  /* ---- shot state ---- */
  const sh={phase:'idle',t:0,spec:null,resolved:false,saved:false,curl:0};
  let ripple=null;
  function fireShot(spec){ sh.phase='runup'; sh.t=0; sh.spec=spec; sh.resolved=false; sh.saved=false;
    sh.outcome=null; sh.vb=null; sh.kAnim=false; sh.missPlayed=false;
    sh.rT=RUNUP_T;
    if(takerRig && takerRig.playKick){
      const kd=pickKick(spec);
      if(kd){
        sh.rT=kd.rT;
        const dur=kd.window?(kd.window[1]-kd.window[0]):kd.clip.duration;
        const ok=takerRig.playKick(kd, (dur*kd.contact)/sh.rT);
        if(!ok) sh.rT=RUNUP_T;
      }
    }
    sh.pw=(typeof spec.power==='number') ? Math.max(0,Math.min(1,spec.power)) : 0.65;
    sh.fT=0.95-0.45*sh.pw;                       // fast flick = flatter, quicker flight
    sh.curl=(typeof spec.curl==='number') ? spec.curl : (spec.tx<0?-1:1)*(0.12+Math.random()*0.14); trailBuf.length=0; }

  /* ---- per-frame ---- */
  const clock=new THREE.Clock();
  function poseIdle(rig,dt,t){ // gentle breathing/bounce
    rig.parts.spine.rotation.x = lerp(rig.parts.spine.rotation.x, 0.04+Math.sin(t*1.5)*0.01, dt*4);
  }
  function update(){
    const dt=Math.min(clock.getDelta(),0.05); const t=clock.elapsedTime;
    for(const f of crowdAnims) f(t);

    // reticle
    reticle.visible = aiming && sh.phase==='idle';
    reticle.position.set(aim.x,aim.y,0.02);
    ring.rotation.z+=dt*0.8;

    if(takerRig && keeperRig){
      const hasIdleLib=keeperLib.some(k=>k.type==='idle');
      if(sh.phase==='idle'){
        resetTaker(takerRig,dt); resetKeeper(keeperRig,dt);
        if(aiming) ball.position.set(0,BALL_R,SPOT_Z);
        keeperRig.parts.hips.position.y=0.82+Math.sin(t*3)*0.02; // ready bounce
        // retargeted keeper idle loop (replaces the model's own clip when provided)
        if(hasIdleLib && keeperRig.playKick && !keeperRig.kickActive){
          const idles=keeperLib.filter(k=>k.type==='idle');
          keeperRig.playKick(idles[(Math.random()*idles.length)|0], 1);
        }
      } else {
        runShot(dt);
      }
      if(takerRig.applyPose) takerRig.tick ? takerRig.tick(dt) : takerRig.applyPose();
      if(keeperRig.applyPose){
        if(keeperRig.setIdleClip && !hasIdleLib) keeperRig.setIdleClip(sh.phase==='idle');
        keeperRig.tick ? keeperRig.tick(dt) : keeperRig.applyPose();
      }
      // plant both characters' feet whenever no dive/airborne motion owns their root
      if(takerRig.groundFeet && (sh.phase==='idle'||sh.phase==='runup')) takerRig.groundFeet();
      if(keeperRig.groundFeet && (sh.phase==='idle'||sh.phase==='runup')) keeperRig.groundFeet();
    }
    renderer.render(scene,camera);
  }

  function resetTaker(rig,dt){ const r=rig.root;
    r.position.x=lerp(r.position.x,TAKER_HOME.x,dt*5); r.position.z=lerp(r.position.z,TAKER_HOME.z,dt*5);
    r.rotation.y=lerp(r.rotation.y,Math.PI,dt*5);
    ['legL','legR'].forEach((k,i)=>{ const L=rig.parts[k];
      L.hip.rotation.x=lerp(L.hip.rotation.x,(i?-.04:.04),dt*6); L.knee.rotation.x=lerp(L.knee.rotation.x,.1,dt*6); });
    rig.parts.armL.sh.rotation.x=lerp(rig.parts.armL.sh.rotation.x,0,dt*6);
    rig.parts.armR.sh.rotation.x=lerp(rig.parts.armR.sh.rotation.x,0,dt*6);
    rig.parts.spine.rotation.x=lerp(rig.parts.spine.rotation.x,0.03,dt*6);
    rig.parts.spine.rotation.z=lerp(rig.parts.spine.rotation.z,0,dt*6);
  }
  function resetKeeper(rig,dt){ const r=rig.root;
    r.position.x=lerp(r.position.x,0,dt*4); r.position.y=lerp(r.position.y,0,dt*4);
    r.rotation.z=lerp(r.rotation.z,0,dt*5);
    rig.parts.armL.sh.rotation.z=lerp(rig.parts.armL.sh.rotation.z,0.7,dt*5);
    rig.parts.armR.sh.rotation.z=lerp(rig.parts.armR.sh.rotation.z,-0.7,dt*5);
    ['legL','legR'].forEach(k=>{ const L=rig.parts[k]; L.hip.rotation.x=lerp(L.hip.rotation.x,.22,dt*5);
      L.hip.rotation.z=lerp(L.hip.rotation.z,0,dt*5); L.knee.rotation.x=lerp(L.knee.rotation.x,.4,dt*5); });
  }

  function runShot(dt){
    const s=sh, spec=s.spec, rt=takerRig, kp=keeperRig;
    if(s.phase==='runup'){
      s.t=Math.min(1,s.t+dt/(s.rT||RUNUP_T)); const p=s.t, e=easeInOut(p);
      const clipKick=!!rt.kickActive;
      // approach ball
      rt.root.position.x=lerp(TAKER_HOME.x,TAKER_PLANT.x,e);
      rt.root.position.z=lerp(TAKER_HOME.z,TAKER_PLANT.z,e);
      if(!clipKick){
      // stride cycle (2.5 steps), settle near end
      const stride=Math.sin(p*Math.PI*5)*(1-p)*0.7;
      rt.parts.legL.hip.rotation.x= 0.05+stride;
      rt.parts.legR.hip.rotation.x=-0.05-stride;
      rt.parts.legL.knee.rotation.x=0.2+Math.max(0,-stride)*1.4;
      rt.parts.legR.knee.rotation.x=0.2+Math.max(0, stride)*1.4;
      rt.parts.armL.sh.rotation.x= stride*1.2; rt.parts.armR.sh.rotation.x=-stride*1.2;
      rt.parts.spine.rotation.x=0.08+e*0.06;
      // backswing of kicking (right) leg at the very end
      if(p>0.72){ const b=(p-0.72)/0.28; rt.parts.legR.hip.rotation.x=lerp(-0.1,-0.95,easeOut(b));
        rt.parts.legR.knee.rotation.x=lerp(0.2,1.5,easeOut(b)); rt.parts.spine.rotation.z=lerp(0,0.18,b); }
      }
      // keeper pre-hop
      kp.parts.hips.position.y=0.8+Math.sin(p*Math.PI)*0.05;
      if(p>=1){ s.phase='flight'; s.t=0; }
    } else if(s.phase==='flight'){
      s.t=Math.min(1,s.t+dt/(s.fT||FLIGHT_T)); const p=s.t;
      // taker strike-through then follow
      if(!rt.kickActive){
      if(p<0.18){ const k=easeOut(p/0.18);
        rt.parts.legR.hip.rotation.x=lerp(-0.95,0.7,k); rt.parts.legR.knee.rotation.x=lerp(1.5,0.05,k);
        rt.parts.spine.rotation.x=0.14+k*0.1; rt.parts.spine.rotation.z=lerp(0.18,-0.05,k);
      } else { const k=Math.min(1,(p-0.18)/0.5);
        rt.parts.legR.hip.rotation.x=lerp(0.7,0.25,k); rt.parts.spine.rotation.x=lerp(0.24,0.06,k);
        rt.parts.legL.hip.rotation.x=lerp(0.05,-0.12,k); }
      }
      // ball flight
      if(!s.saved){
        const z=lerp(SPOT_Z,-NET_D*0.55,p);
        const x=spec.tx*p + s.curl*Math.sin(p*Math.PI);
        const arc=Math.sin(p*Math.PI)*(0.18+ (spec.ty>1.3?0.28:0.06))*(1.25-(s.pw!==undefined?s.pw:0.65)*0.85);
        const y=lerp(BALL_R,spec.ty,p)+arc;
        if(s.outcome==='post' && z<=0.07){
          // clattered the woodwork: stop at the frame, kick back into play
          if(!s.vb){ ball.position.set(spec.tx*0.97, Math.min(spec.ty,GOAL_H), 0.08);
            s.vb={ x:(spec.tx>0?-1:1)*(1.2+Math.random()*1.2), y:0.6+Math.random()*0.8, z:6.5+Math.random()*2.5 }; }
        } else {
          ball.position.set(x,y,z);
        }
        ball.rotation.x-=0.6; ball.rotation.y-=s.curl*0.8;
      }
      // keeper reaction: real save animation when available, else procedural dive
      if(p>0.05 && !s.kAnim && kp.playKick && keeperLib.length){
        s.kAnim=true;
        const dir=spec.keeperDir;
        let kd=null;
        if(dir===0){ const cs=keeperLib.filter(k=>k.type==='catch'); kd=cs[(Math.random()*cs.length)|0]||null; }
        else { const ds=keeperLib.filter(k=>k.type==='dive'); kd=ds.find(k=>(k.hipsDx>0)===(dir>0))||ds[0]||null; }
        if(kd) kp.playKick(kd, kd.clip.duration/1.5);
      }
      // keeper dive (after small reaction delay)
      if(p>0.08){ const dp=easeOut(Math.min(1,(p-0.08)/0.62)); const dir=spec.keeperDir, hi=spec.keeperHigh;
        kp.root.position.x=dir*(kp.kickActive?2.30:2.45)*dp;
        kp.root.position.y=(kp.kickActive?(hi?0.85:0.05):(hi?0.95:0.18))*dp;
        if(!kp.kickActive){
        kp.root.rotation.z=-dir*1.25*dp;
        const topArm = dir<0?kp.parts.armL:kp.parts.armR, botArm=dir<0?kp.parts.armR:kp.parts.armL;
        topArm.sh.rotation.z=lerp(topArm.sh.rotation.z, dir<0?2.4:-2.4, 0.3); topArm.up.rotation.x=lerp(topArm.up.rotation.x,-0.2,0.3);
        botArm.sh.rotation.z=lerp(botArm.sh.rotation.z, dir<0?-1.6:1.6, 0.3);
        kp.parts.legL.hip.rotation.x=lerp(kp.parts.legL.hip.rotation.x, -0.2+ (dir>0?1.0:0),0.3);
        kp.parts.legR.hip.rotation.x=lerp(kp.parts.legR.hip.rotation.x, -0.2+ (dir<0?1.0:0),0.3);
        kp.parts.legL.knee.rotation.x=lerp(kp.parts.legL.knee.rotation.x,0.15,0.3);
        kp.parts.legR.knee.rotation.x=lerp(kp.parts.legR.knee.rotation.x,0.15,0.3);
        }
      }
      // trail
      trailBuf.unshift(ball.position.clone()); if(trailBuf.length>trail.length) trailBuf.pop();
      trail.forEach((m,i)=>{ const q=trailBuf[i+1]; if(q && !s.saved){ m.position.copy(q); m.material.opacity=0.22*(1-i/trail.length); } else m.material.opacity=0; });
      // resolve
      if(!s.resolved && p>=0.8){ s.resolved=true;
        const ax=Math.abs(spec.tx);
        const inGoal = ax < GOAL_W/2-0.10 && spec.ty < GOAL_H-0.10;
        const onWood = !inGoal && ax < GOAL_W/2+0.18 && spec.ty < GOAL_H+0.18;
        let outcome;
        if(inGoal){
          let saved;
          if(typeof spec.saved==='boolean'){ saved=spec.saved; }       // deterministic 5-spot rule
          else { const handX=spec.keeperDir*2.05, handY=spec.keeperHigh?2.0:0.95;
            const dist=Math.hypot(spec.tx-handX, spec.ty-handY);
            let reach=1.32-(Math.abs(spec.tx)>GOAL_W/2-1.5?0.42:0);
            if(typeof spec.power==='number') reach*=(1.18-spec.power*0.45);   // slow shots give the keeper time
            saved=dist<reach; }
          outcome = saved ? 'save' : 'goal';
        } else { outcome = onWood ? 'post' : 'miss'; }
        s.outcome=outcome; s.saved=(outcome==='save');
        if(outcome==='save'){ ball.position.set(spec.keeperDir*1.7, spec.keeperHigh?1.85:0.85, 0.36); for(const m of trail)m.material.opacity=0; }
        else if(outcome==='goal'){ ripple={cx:spec.tx,cy:spec.ty,age:0}; } // net ripple on goal
        onResult&&onResult(outcome);
      }
      if(p>=1){ s.phase='done'; s.t=0; }
    } else if(s.phase==='done'){
      s.t+=dt; // hold celebration pose briefly, then idle
      // keeper settles onto the turf after his dive — no hovering, no extra reactions
      if(kp && kp.root.position.y>0.001){ kp.root.position.y=Math.max(0, kp.root.position.y-dt*2.6); }
      if(s.vb){ // post rebound physics-lite
        s.vb.y-=11*dt;
        ball.position.x+=s.vb.x*dt; ball.position.z+=s.vb.z*dt;
        ball.position.y=Math.max(BALL_R, ball.position.y+s.vb.y*dt);
        if(ball.position.y<=BALL_R+0.001 && s.vb.y<0){ s.vb.y=Math.abs(s.vb.y)*0.45; s.vb.x*=0.8; s.vb.z*=0.8; }
        ball.rotation.x-=dt*8;
      } else if(s.outcome==='miss'){ ball.position.z-=dt*11; ball.rotation.x-=dt*8; } // sails into the stands
      for(const m of trail) m.material.opacity=lerp(m.material.opacity,0,dt*6);
      if(s.t>1.1){ s.phase='idle'; if(takerRig&&takerRig.stopKick) takerRig.stopKick(); if(keeperRig&&keeperRig.stopKick) keeperRig.stopKick(); }
    }
    // net ripple
    if(ripple){ ripple.age+=dt; const pos=backGeo.attributes.position; const A=0.55*Math.exp(-ripple.age*3);
      for(let i=0;i<pos.count;i++){ const bx=base[i*3], by=base[i*3+1];
        const d=Math.hypot(bx-ripple.cx, (by+GOAL_H/2-GOAL_H/2)-ripple.cy);
        const off=-A*Math.exp(-d*1.8)*Math.sin(ripple.age*16-d*4);
        pos.array[i*3+2]=off; }
      pos.needsUpdate=true; if(ripple.age>1.0){ ripple=null; for(let i=0;i<pos.count;i++)pos.array[i*3+2]=0; pos.needsUpdate=true; } }
  }

  function resize(){ const w=container.clientWidth,h=container.clientHeight;
    renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  resize(); window.addEventListener('resize',resize);
  let raf; (function loop(){ raf=requestAnimationFrame(loop); update(); })();

  return { setMatch, setAimNDC, setAimPoint, projectGoal, projectNDC, setAiming, fireShot, resize, setStarTaker, _scene:scene, _camera:camera, _rigs:()=>({taker:takerRig,keeper:keeperRig}), _kicks:()=>kickLib,
    setReticleWarn:(w)=>{ ring.material.color.set(w?'#FF2D2D':'#C8F23C'); dot.material.color.set(w?'#FF2D2D':'#C8F23C'); },
    _dbg:()=>({phase:sh.phase, t:+sh.t.toFixed(2), saved:sh.saved, resolved:sh.resolved, pw:sh.pw, fT:sh.fT, ball:ball.position.toArray().map(n=>+n.toFixed(2)), aiming}),
    dispose(){ cancelAnimationFrame(raf); window.removeEventListener('resize',resize); renderer.dispose(); container.removeChild(renderer.domElement); } };
}

/* ---------------- stadium ---------------- */
function buildStadium(scene, night){
  const env=new THREE.Group(); scene.add(env);
  const crowd=crowdTexture(night);
  const standMat=(rx,ry)=>{ const t=crowd.clone(); t.needsUpdate=true; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
    return new THREE.MeshStandardMaterial({map:t,roughness:.97}); };
  const roofMat=new THREE.MeshStandardMaterial({color:night?'#0D0F19':'#14181f',roughness:.85,metalness:.25});
  const wallMat=new THREE.MeshStandardMaterial({color:night?'#1B1433':'#1f2630',roughness:.92});
  const bunt=night?buntingTexture():null;

  function tribune(x,z,rotY,len,height){
    const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY;
    // lower perimeter wall (kills sky-leak at pitch level)
    const wall=new THREE.Mesh(new THREE.BoxGeometry(len,2.6,0.7), wallMat); wall.position.set(0,1.3,0.2); wall.receiveShadow=true; g.add(wall);
    // raked seating, nearly upright so it forms a tall backdrop
    const rake=new THREE.Mesh(new THREE.PlaneGeometry(len,height), standMat(len/5.5, height/4));
    rake.position.set(0, 2.4+height*0.42, -height*0.12); rake.rotation.x=-0.32; rake.receiveShadow=true; g.add(rake);
    // pennant bunting rows over the crowd (night/arcade staging)
    if(night){ [4.2,6.1].forEach(y=>{
      const yc=2.4+height*0.42, zc=-height*0.12;
      const z=zc+(yc-y)*0.331+0.32;            // sit just in front of the tilted rake
      const t=bunt.clone(); t.needsUpdate=true; t.wrapS=THREE.RepeatWrapping; t.repeat.set(len/11,1);
      const b=new THREE.Mesh(new THREE.PlaneGeometry(len,1.5), new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
      b.position.set(0,y,z); b.rotation.x=-0.32; g.add(b);
    }); }
    // roof lip
    const roof=new THREE.Mesh(new THREE.BoxGeometry(len,0.5,6), roofMat);
    roof.position.set(0, 2.4+height*0.86, -height*0.32); roof.castShadow=true; g.add(roof);
    env.add(g);
  }
  tribune(0,-6.4,0,54,18);          // behind the goal — tall main backdrop
  tribune(-17.5,9,Math.PI/2,60,15); // left
  tribune(17.5,9,-Math.PI/2,60,15); // right
  tribune(0,28,Math.PI,54,15);      // behind camera (fills the world)

  // LED hoarding ring near pitch edge
  const hoard=new THREE.MeshBasicMaterial({map:hoardingTexture(night)});
  const hb=new THREE.Mesh(new THREE.PlaneGeometry(26,0.62),hoard); hb.position.set(0,0.34,-3.0); env.add(hb);
  [[-12.6,9,Math.PI/2],[12.6,9,-Math.PI/2]].forEach(([x,z,r])=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(30,0.62),hoard.clone());
    m.position.set(x,0.34,z); m.rotation.y=r; env.add(m); });

  // floodlight pylons (4 corners)
  const pyMat=new THREE.MeshStandardMaterial({color:night?'#8a90a8':'#cfd6dd',roughness:.6,metalness:.4});
  const bankMat=new THREE.MeshStandardMaterial({color:'#fffdf2',emissive:'#fff3c8',emissiveIntensity:night?1.6:.5,roughness:.4});
  const glowT=night?glowTexture():null;
  [[-21,-13],[21,-13],[-23,30],[23,30]].forEach(([x,z])=>{
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.26,19,10),pyMat); pole.position.set(x,9.5,z); env.add(pole);
    const bank=new THREE.Mesh(new THREE.BoxGeometry(3.6,1.6,0.4),bankMat); bank.position.set(x,19.2,z); bank.lookAt(0,0,8); env.add(bank);
    if(night){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,color:'#fff6d8',transparent:true,opacity:.85,depthWrite:false}));
      sp.scale.set(8,8,1); sp.position.set(x,19.2,z); env.add(sp); }
  });
  return env;
}
