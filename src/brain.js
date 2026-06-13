/* ============ THE BRAIN ============ */
/* Voice-reactive point-cloud brain. capture.js drives `brain.amp` (0..1)
   and `brain.active`; everything else is self-contained. */

export const brain = { amp: 0, active: false };

var canvas=document.getElementById('gl');
var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
var scene=new THREE.Scene();
var camera=new THREE.PerspectiveCamera(40,1,0.1,100);
camera.position.set(0,0,4.6);

var group=new THREE.Group(); scene.add(group);
group.position.y=0.42;                       // brain rides upper-center
group.rotation.y=Math.PI*0.5-0.35;           // start near side profile
group.rotation.x=0.10; group.rotation.z=-0.05;

function sprite(inner){
  var c=document.createElement('canvas');c.width=c.height=64;
  var g=c.getContext('2d');
  var rad=g.createRadialGradient(32,32,0,32,32,32);
  rad.addColorStop(0,'rgba(255,255,255,'+(inner||1)+')');
  rad.addColorStop(.3,'rgba(205,228,255,.8)');
  rad.addColorStop(.65,'rgba(120,170,235,.28)');
  rad.addColorStop(1,'rgba(120,170,235,0)');
  g.fillStyle=rad;g.fillRect(0,0,64,64);
  var t=new THREE.Texture(c);t.needsUpdate=true;return t;
}
var tex=sprite(1);

/* ridged gyri field — bands, not random fuzz */
function gyri(x,y,z){
  var a=Math.sin(x*2.2+Math.sin(y*3.1+z*1.3)*1.3);
  var b=Math.sin(y*2.8+Math.sin(z*2.4+x*1.1)*1.5);
  var r=(1-Math.abs(a))*0.62+(1-Math.abs(b))*0.38;   // 0..1 ridges
  return r-0.5;
}
/* anatomical side-profile shaping */
function shape(d){
  var x=d.x,y=d.y,z=d.z, r=1;
  if(y<0) r*=1-0.15*(-y);                                   // flat-ish bottom
  var temporal=Math.max(0,-y)*Math.abs(x)*Math.max(0,z*0.6+0.5);
  r+=temporal*0.22;                                          // temporal lobe bulge
  if(z<-0.25&&y<0){                                          // occipital tuck for cerebellum
    r*=1-0.38*Math.min(1,(-z-0.25)*1.7)*Math.min(1,-y*2.4);
  }
  if(z>0.6&&y>0.3) r*=1-0.06*(z-0.6);                        // frontal round-off
  return r;
}

var deep=new THREE.Color(0x27457F), mist=new THREE.Color(0x99C4F0), core=new THREE.Color(0xEAF4FF);
var pos=[],col=[];

function addCerebrum(n){
  var RX=0.74,RY=0.84,RZ=1.16, added=0;
  while(added<n){
    var u=Math.random(),v=Math.random();
    var th=Math.acos(2*u-1),ph=2*Math.PI*v;
    var dx=Math.sin(th)*Math.cos(ph),dy=Math.cos(th),dz=Math.sin(th)*Math.sin(ph);
    var g=gyri(dx*2.6,dy*2.6,dz*2.6);
    // bias sampling onto ridge tops so the folds read as solid winding bands
    if(Math.random()>0.30+0.70*Math.max(0,g+0.5))continue;
    var s=shape({x:dx,y:dy,z:dz});
    var shell=0.92+0.08*Math.random();                       // hug the surface
    var r=s*(1+g*0.13)*shell;
    var x=dx*RX*r, y=dy*RY*r, z=dz*RZ*r;
    x+=Math.sign(x)*0.05*(y>0?1:0.35);                      // longitudinal fissure
    pos.push(x,y,z);
    var bright=0.35+0.65*Math.max(0,g+0.5);                  // ridge tops glow
    var c=deep.clone().lerp(mist,Math.min(1,bright*1.15*(0.6+0.4*((dy+1)/2))));
    if(g>0.32&&Math.random()<0.25)c=core.clone();            // hot highlights ride the folds
    else if(Math.random()<0.03)c=core.clone();
    col.push(c.r,c.g,c.b);
    added++;
  }
}
function addCerebellum(n){
  var cx=0,cy=-0.50,cz=-0.80, RX=0.46,RY=0.30,RZ=0.40;
  for(var i=0;i<n;i++){
    var u=Math.random(),v=Math.random();
    var th=Math.acos(2*u-1),ph=2*Math.PI*v;
    var dx=Math.sin(th)*Math.cos(ph),dy=Math.cos(th),dz=Math.sin(th)*Math.sin(ph);
    var st=1-Math.abs(Math.sin(dy*9+dx*2));                 // fine horizontal striations
    var shell=0.85+0.15*Math.random();
    var r=(1+(st-0.5)*0.10)*shell;
    pos.push(cx+dx*RX*r, cy+dy*RY*r, cz+dz*RZ*r);
    var c=deep.clone().lerp(mist,0.3+0.5*st);
    col.push(c.r,c.g,c.b);
  }
}
function addStem(n){
  for(var i=0;i<n;i++){
    var t=Math.random();
    var ang=Math.random()*Math.PI*2, rr=0.085*(1-t*0.35)*Math.sqrt(Math.random());
    pos.push(Math.cos(ang)*rr, -0.46-t*0.55, -0.46+t*0.10+Math.sin(ang)*rr);
    var c=deep.clone().lerp(mist,0.35);
    col.push(c.r,c.g,c.b);
  }
}
addCerebrum(12500); addCerebellum(2100); addStem(300);
var total=pos.length/3;

var geo=new THREE.BufferGeometry();
geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
var mat=new THREE.PointsMaterial({size:0.027,map:tex,vertexColors:true,transparent:true,
  opacity:0.85,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true});
group.add(new THREE.Points(geo,mat));

/* soft interior glow — single large sprite behind the point cloud */
var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0x4A7BC4,transparent:true,
  opacity:0.16,depthWrite:false,blending:THREE.AdditiveBlending}));
glow.scale.set(2.5,2.1,1);
group.add(glow);

/* neural wireframe: connect near neighbors of a sample */
var meshMat=(function(){
  var M=1500, idxs=[], cell=0.13, grid={};
  for(var i=0;i<M;i++) idxs.push((Math.random()*total)|0);
  function key(x,y,z){return ((x/cell)|0)+','+((y/cell)|0)+','+((z/cell)|0);}
  idxs.forEach(function(pi){
    var k=key(pos[pi*3]+10,pos[pi*3+1]+10,pos[pi*3+2]+10);
    (grid[k]=grid[k]||[]).push(pi);
  });
  var lpos=[],maxD=0.125,made=0;
  for(var n=0;n<idxs.length&&made<2600;n++){
    var pi=idxs[n], px=pos[pi*3],py=pos[pi*3+1],pz=pos[pi*3+2];
    var gx=((px+10)/cell)|0, gy=((py+10)/cell)|0, gz=((pz+10)/cell)|0, links=0;
    for(var ax=-1;ax<=1&&links<2;ax++)for(var ay=-1;ay<=1&&links<2;ay++)for(var az=-1;az<=1&&links<2;az++){
      var arr=grid[(gx+ax)+','+(gy+ay)+','+(gz+az)]; if(!arr)continue;
      for(var q=0;q<arr.length&&links<2;q++){
        var qi=arr[q]; if(qi===pi)continue;
        var qx=pos[qi*3],qy=pos[qi*3+1],qz=pos[qi*3+2];
        var dxx=px-qx,dyy=py-qy,dzz=pz-qz;
        if(dxx*dxx+dyy*dyy+dzz*dzz<maxD*maxD){
          lpos.push(px,py,pz,qx,qy,qz); links++; made++;
        }
      }
    }
  }
  var lgeo=new THREE.BufferGeometry();
  lgeo.setAttribute('position',new THREE.Float32BufferAttribute(lpos,3));
  var lmat=new THREE.LineBasicMaterial({color:0x9FC8F5,transparent:true,opacity:0.10,
    blending:THREE.AdditiveBlending,depthWrite:false});
  group.add(new THREE.LineSegments(lgeo,lmat));
  return lmat;
})();

/* synapse nodes */
var sPos=[];
for(var k=0;k<170;k++){var idx=(Math.random()*total)|0;
  sPos.push(pos[idx*3],pos[idx*3+1],pos[idx*3+2]);}
var sgeo=new THREE.BufferGeometry();
sgeo.setAttribute('position',new THREE.Float32BufferAttribute(sPos,3));
var smat=new THREE.PointsMaterial({size:0.085,map:tex,color:0xEAF4FF,transparent:true,
  opacity:0.45,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true});
group.add(new THREE.Points(sgeo,smat));
var sArr=sgeo.attributes.position.array;

var fitScale=0.55;
function resize(){
  var w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h);   // also sets canvas CSS size — without it the canvas
                           // displays at buffer size (2x zoom on retina/dpr>1)
  camera.aspect=w/h; camera.fov=w<420?47:40;
  camera.updateProjectionMatrix();
  // align brain with halo center (37% from top)
  var dist=camera.position.z;
  var vH=2*Math.tan(camera.fov*Math.PI/360)*dist;
  group.position.y=vH*(0.5-0.37);
  // scale the brain to sit inside the halo (#halo is min(76vmin,440px) wide;
  // the brain's longest span is ~2.4 world units)
  var haloPx=Math.min(0.76*Math.min(w,h),440);
  var haloWorld=haloPx*vH/h;
  fitScale=haloWorld*0.80/2.4;
}
window.addEventListener('resize',resize); resize();

var t0=performance.now();
function loop(now){
  var dt=Math.min((now-t0)/1000,0.05); t0=now;
  var B=brain;
  B._a=(B._a||0)+(((B.active?B.amp:0))-(B._a||0))*0.16;
  var a=B._a;

  group.rotation.y+=dt*(0.10+a*0.35);                 // slow drift, quickens with voice
  group.position.x=Math.sin(now*0.00045)*0.05;
  var baseY=group.position.y;
  group.position.y=baseY+Math.sin(now*0.0007)*0.001;  // breathe handled by scale instead
  var s=fitScale*(1+a*0.13+Math.sin(now*0.0011)*0.008);
  group.scale.setScalar(s);

  mat.opacity=0.72+a*0.26;
  mat.size=0.027+a*0.008;
  glow.material.opacity=0.14+a*0.10;

  // brief green pulse after a successful vault sync (brain.pulseT set by capture.js)
  if(brain.pulseT){
    var pt=(now-brain.pulseT)/1200;
    if(pt>=1){brain.pulseT=0;glow.material.color.setHex(0x4A7BC4);}
    else{
      var k=Math.sin(pt*Math.PI);
      glow.material.color.setRGB(0.29+(-0.29+0.31)*k,0.48+(0.82-0.48)*k,0.77+(0.55-0.77)*k);
      glow.material.opacity=0.14+0.18*k;
    }
  }
  smat.opacity=0.30+a*0.55+0.10*Math.sin(now*0.011);
  smat.size=0.080+a*0.12;
  meshMat.opacity=0.07+a*0.16;

  if(B.active&&Math.random()<0.5){
    for(var j=0;j<6;j++){
      var si=(Math.random()*170)|0, pi=(Math.random()*total)|0;
      sArr[si*3]=pos[pi*3];sArr[si*3+1]=pos[pi*3+1];sArr[si*3+2]=pos[pi*3+2];
    }
    sgeo.attributes.position.needsUpdate=true;
  }
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
