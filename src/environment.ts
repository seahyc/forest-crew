import {Engine,Scene,Color3,Color4,Vector3,Vector4,HemisphericLight,DirectionalLight,FreeCamera,MeshBuilder,StandardMaterial,PBRMaterial,TransformNode,Mesh,VertexData,Texture,HDRCubeTexture,MirrorTexture,Plane,FresnelParameters,ShadowGenerator,DefaultRenderingPipeline,ParticleSystem,ShaderMaterial,ImportMeshAsync,Matrix,Quaternion,SSAO2RenderingPipeline} from '@babylonjs/core';

import {createRenderQualityPolicy,renderQuality} from './render-quality.mjs';

const C=(hex:string)=>Color3.FromHexString(hex);
const base=import.meta.env.BASE_URL;
export function createEnvironment(canvas:HTMLCanvasElement){
 const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'});
 const mobile=matchMedia('(pointer: coarse)').matches&&navigator.maxTouchPoints>0;
 const performancePolicy=createRenderQualityPolicy({mobile});
 const quality=()=>({...renderQuality({width:canvas.clientWidth,height:canvas.clientHeight,dpr:devicePixelRatio,mobile,maxSamples:engine.getCaps().maxMSAASamples,tier:performancePolicy.diagnostics().tier}),...performancePolicy.diagnostics()});
 engine.maxFPS=quality().maxFPS;
 engine.setHardwareScalingLevel(quality().hardwareScaling);
 const scene=new Scene(engine);scene.clearColor=new Color4(.22,.64,.86,1);
 scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.00115;scene.fogColor=C('#62b6da');
 scene.environmentTexture=new HDRCubeTexture(`${base}textures/sky.hdr`,scene,128,false,true,false,true);scene.environmentIntensity=.48;
 const camera=new FreeCamera('embodied camera',new Vector3(0,3.4,-8.6),scene);camera.minZ=.08;camera.maxZ=1600;camera.fov=.88;camera.setTarget(new Vector3(0,1.35,0));
 const sky=MeshBuilder.CreateSphere('blue atmospheric sky',{diameter:2200,segments:32,sideOrientation:Mesh.BACKSIDE},scene);
 const skyMat=new ShaderMaterial('clear azure sky',scene,{vertexSource:`precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying float height; void main(){height=normalize(position).y;gl_Position=worldViewProjection*vec4(position,1.0);}`,fragmentSource:`precision highp float; varying float height; void main(){float h=pow(clamp(height,0.0,1.0),0.42);vec3 horizon=vec3(.29,.53,.66);vec3 zenith=vec3(.012,.26,.46);gl_FragColor=vec4(mix(horizon,zenith,h),1.0);}`},{attributes:['position'],uniforms:['worldViewProjection']});skyMat.backFaceCulling=false;sky.material=skyMat;sky.isPickable=false;sky.infiniteDistance=true;sky.applyFog=false;

 const hemi=new HemisphericLight('blue sky fill',new Vector3(0,1,0),scene);hemi.intensity=.18;hemi.diffuse=C('#d9f1ff');hemi.groundColor=C('#17313a');
 const sun=new DirectionalLight('late afternoon sun',new Vector3(-.7,-.65,.5),scene);sun.position.set(35,55,-35);sun.intensity=5.1;sun.diffuse=C('#ffe6c2');sun.shadowMinZ=35;sun.shadowMaxZ=115;
 const shadows=new ShadowGenerator(2048,sun);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;shadows.bias=.00018;shadows.normalBias=.025;sun.autoCalcShadowZBounds=false;sun.autoUpdateExtends=false;sun.orthoLeft=-14;sun.orthoRight=44;sun.orthoTop=22;sun.orthoBottom=-34;
 const ao=quality().ambientOcclusion?new SSAO2RenderingPipeline('contact ambient occlusion',scene,{ssaoRatio:.5,blurRatio:.5},[camera]):null;if(ao){ao.radius=.7;ao.totalStrength=.7;ao.expensiveBlur=false;ao.samples=8;}
 const pipeline=new DefaultRenderingPipeline('filmic image',true,scene,[camera]);pipeline.samples=quality().samples;pipeline.fxaaEnabled=quality().fxaa;pipeline.bloomEnabled=true;pipeline.bloomThreshold=1.18;pipeline.bloomWeight=.09;pipeline.bloomKernel=32;pipeline.imageProcessingEnabled=true;pipeline.imageProcessing.toneMappingEnabled=true;pipeline.imageProcessing.toneMappingType=1;pipeline.imageProcessing.exposure=1;pipeline.imageProcessing.contrast=1.14;
 const pbr=(name:string,color:string,rough=.6,metal=0)=>{const m=new PBRMaterial(name,scene);m.albedoColor=C(color).toLinearSpace();m.roughness=rough;m.metallic=metal;m.maxSimultaneousLights=5;return m;};
 const pink=pbr('lacquered warm pink deck','#f37aaa',.22),pinkEdge=pbr('pink edge fascia','#c74775',.34),ivory=pbr('warm ivory enamel','#f1e6d4',.35),chrome=pbr('brushed polished chrome','#e6eeed',.17,.9),coral=pbr('coral pump enamel','#e9979f',.28),dark=pbr('charcoal fittings','#202725',.38),leaf=pbr('palm leaf green','#477b35',.48),leafLight=pbr('sunlit fronds','#87a941',.44),trunk=pbr('fibrous palm bark','#9c8154',.72);
 pink.clearCoat.isEnabled=true;pink.clearCoat.intensity=.9;pink.clearCoat.roughness=.1;
 const basalt=pbr('rough volcanic basalt','#535753',.8);basalt.albedoTexture=new Texture(`${base}textures/basalt-color.jpg`,scene);basalt.bumpTexture=new Texture(`${base}textures/basalt-normal.jpg`,scene);basalt.bumpTexture.level=.28;basalt.clearCoat.isEnabled=true;basalt.clearCoat.intensity=.08;basalt.clearCoat.roughness=.45;
 const wetRock=basalt.clone('wet basalt shore')!;wetRock.albedoColor=C('#343b3e').toLinearSpace();wetRock.roughness=.42;wetRock.clearCoat.isEnabled=true;wetRock.clearCoat.intensity=.3;wetRock.clearCoat.roughness=.28;
 const surface=basalt.clone('walkable lava')!;(surface.albedoTexture as Texture).uScale=4;(surface.albedoTexture as Texture).vScale=7;(surface.bumpTexture as Texture).uScale=4;(surface.bumpTexture as Texture).vScale=7;
 const cast=(mesh:Mesh)=>{mesh.receiveShadows=true;if(!/distant|future/.test(mesh.name))shadows.addShadowCaster(mesh);return mesh;};
 function box(name:string,w:number,h:number,d:number,p:Vector3,m:any){const x=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);x.position=p;x.material=m;return cast(x);}
 function tube(name:string,points:Vector3[],radius:number,material:any,tess=10){const m=MeshBuilder.CreateTube(name,{path:points,radius,tessellation:tess,cap:Mesh.CAP_ALL},scene);m.material=material;return cast(m);}
 let seed=73011;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 function rock(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,material=basalt){
  const mesh=MeshBuilder.CreateSphere(name,{diameter:2,segments:24,updatable:true},scene);const pos=mesh.getVerticesData('position')!,normals=mesh.getVerticesData('normal')!;
  for(let i=0;i<pos.length;i+=3){const a=pos[i],b=pos[i+1],c=pos[i+2];const noise=1+.16*Math.sin(a*8+c*4)*Math.cos(b*9-c*3)+.065*Math.sin(a*27+b*17+c*21);pos[i]*=noise;pos[i+1]*=noise;pos[i+2]*=noise;}
  VertexData.ComputeNormals(pos,mesh.getIndices()!,normals);mesh.updateVerticesData('position',pos);mesh.updateVerticesData('normal',normals);mesh.position.set(x,y,z);mesh.scaling.set(sx,sy,sz);mesh.rotation.y=rnd()*6.28;mesh.material=material;cast(mesh);return mesh;
 }
 // Pink deck at y=0. Every traversable surface shares that height.
 const deck=box('pink deck structural slab',12,.32,10,new Vector3(-1,-.23,-3),pinkEdge);
 const boardMeshes:Mesh[]=[];
 for(let i=0;i<40;i++){const plank=box('individual pink plank',11.98,.07,.241,new Vector3(-1,-.035,-7.86+i*.25),pink);boardMeshes.push(plank);shadows.removeShadowCaster(plank);for(const x of [-6.8,4.8]){const screw=MeshBuilder.CreateCylinder('deck fastener',{height:.006,diameter:.022,tessellation:8},scene);screw.position.set(x,.004,plank.position.z);screw.material=chrome;screw.isPickable=false;}}
 const mergedBoards=Mesh.MergeMeshes(boardMeshes,true,true);if(mergedBoards){mergedBoards.name='pink deck planks';mergedBoards.receiveShadows=true;}
 const fasteners=scene.meshes.filter(m=>m.name==='deck fastener') as Mesh[];const mergedFasteners=Mesh.MergeMeshes(fasteners,true,true);if(mergedFasteners){mergedFasteners.name='deck fasteners';mergedFasteners.isPickable=false;}
 const collisionDeck=box('deck collider',12,.15,10,new Vector3(-1,-.085,-3),pinkEdge);collisionDeck.isVisible=false;
 const causeway=box('lava causeway',6,.35,12,new Vector3(0,-.18,7),surface);
 const grove=MeshBuilder.CreateCylinder('rounded grove ground',{height:.4,diameterTop:16,diameterBottom:17,tessellation:40},scene);grove.position.set(.7,-.205,18);grove.material=surface;cast(grove);
 // Render a continuous irregular shore over the simple hidden physics surfaces.
 causeway.isVisible=false;grove.isVisible=false;
 const groundPositions:number[]=[],groundIndices:number[]=[],groundUvs:number[]=[];
 const seg=96,rings=16;
 for(let j=0;j<=rings;j++)for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,t=j/rings,edge=8.3+.45*Math.sin(a*7)+.3*Math.sin(a*13),r=t*edge,x=.7+Math.cos(a)*r,z=18+Math.sin(a)*r,y=t<.81?-.005:-.005-Math.pow((t-.81)/.19,1.5)*.62;groundPositions.push(x,y,z);groundUvs.push(x*.11,z*.11);if(j<rings&&i<seg){const v=j*(seg+1)+i;groundIndices.push(v,v+seg+1,v+1,v+1,v+seg+1,v+seg+2);}}
 const gm=new Mesh('continuous basalt grove',scene),gn:number[]=[];VertexData.ComputeNormals(groundPositions,groundIndices,gn);const gd=new VertexData();gd.positions=groundPositions;gd.indices=groundIndices;gd.normals=gn;gd.uvs=groundUvs;gd.applyToMesh(gm);gm.material=basalt;cast(gm);
 const roadPositions:number[]=[],roadIndices:number[]=[],roadUvs:number[]=[];for(let j=0;j<=48;j++)for(let i=0;i<=12;i++){const z=1+j/48*13,edge=3.8+.25*Math.sin(z*1.8),t=(i-6)/6,x=t*edge,y=Math.abs(t)<.75?-.005:-.005-Math.pow((Math.abs(t)-.75)/.25,1.4)*.65;roadPositions.push(x,y,z);roadUvs.push(x*.11,z*.11);if(j<48&&i<12){const v=j*13+i;roadIndices.push(v,v+13,v+1,v+1,v+13,v+14);}}const rm=new Mesh('continuous basalt causeway',scene),rn:number[]=[];VertexData.ComputeNormals(roadPositions,roadIndices,rn);const rd=new VertexData();rd.positions=roadPositions;rd.indices=roadIndices;rd.normals=rn;rd.uvs=roadUvs;rd.applyToMesh(rm);rm.material=basalt;cast(rm);
 const colliders=[collisionDeck,causeway,grove];
 const terrainMeshes=new Set<Mesh>([causeway,grove]);
 // Jagged raised margins hide rectilinear collision bases while keeping the walking ribbon clear.
 for(let i=0;i<0;i++){const z=1.8+i*.38;for(const side of [-1,1])rock('coastal lava',side*(4.2+rnd()*.5),-.24,z,.65+rnd()*.85,.32+rnd()*.45,.5+rnd()*.8,rnd()>.6?wetRock:basalt);}
 for(let i=0;i<0;i++){const a=i/48*Math.PI*2;rock('grove shoreline',.7+Math.cos(a)*(7.7+rnd()),-.25,18+Math.sin(a)*(7.5+rnd()),1.1+rnd()*1.3,.5+rnd()*.55,.8+rnd(),wetRock);}
 for(let i=0;i<0;i++)rock('foreground black reef',-8-rnd()*5,-.4,-4+rnd()*10,1+rnd()*2,.4+rnd()*.9,1+rnd()*2,wetRock);
 // Broad flat-topped volcanic island on the horizon, with layered rough ridges.
 const volcano=MeshBuilder.CreateGround('distant flat-topped volcano',{width:72,height:47,subdivisions:80,updatable:true},scene);const vp=volcano.getVerticesData('position')!,vn=volcano.getVerticesData('normal')!;for(let i=0;i<vp.length;i+=3){const x=vp[i]/36,z=vp[i+2]/23.5,r=Math.sqrt(x*x+z*z),ridge=.08*Math.sin(x*17+z*8)+.035*Math.sin(z*37-x*19);vp[i+1]=r>1?-.5:r<.46?11.3+.18*Math.sin(x*22+z*9):Math.max(-.5,11.5*(1-(r-.46)/.54)+ridge*12); }VertexData.ComputeNormals(vp,volcano.getIndices()!,vn);volcano.updateVerticesData('position',vp);volcano.updateVerticesData('normal',vn);volcano.position.set(-55,0,100);volcano.material=basalt;

 for(const [x,z,s] of [[90,165,16],[-150,210,23],[160,290,24],[30,330,30]]){for(let i=0;i<6;i++)rock('future grove island',x+(rnd()-.5)*s,0,z+(rnd()-.5)*s,s*.8,2+rnd()*s*.2,s*.45);}
 // Chrome swimming ladder curves naturally over the deck into the sea.
 for(const x of [3.1,4]){const path=[];for(let i=0;i<=20;i++){const a=Math.PI-i/20*Math.PI;path.push(new Vector3(x,.05+Math.sin(a)*1.15,-7.7-Math.cos(a)*.52));}path.push(new Vector3(x,-1.8,-8.22));tube('ladder rail',path,.037,chrome,12);}
 for(let i=0;i<6;i++)tube('ladder rung',[new Vector3(3.1,-.1-i*.28,-8.2),new Vector3(4,-.1-i*.28,-8.2)],.032,chrome);
 // Reclining chair: the familiar mundane object anchors the surreal composition.
 const chairRoot=new TransformNode('quiet deck lounger',scene);chairRoot.position.set(-4.65,0,-5.4);chairRoot.rotation.y=.18;
 const chairParts=[box('wood chair frame',1.6,.12,2.55,new Vector3(0,.38,0),pbr('warm chair timber','#bb9472',.55)),box('linen seat',1.49,.2,1.55,new Vector3(0,.55,.4),ivory),box('linen back',1.49,.2,1.4,new Vector3(0,.9,-.87),ivory)];chairParts[2].rotation.x=-.62;for(const x of [-.66,.66])for(const z of [-1,1])chairParts.push(box('chair foot',.09,.42,.09,new Vector3(x,.21,z),coral));chairParts.forEach(p=>p.parent=chairRoot);
 const pump=box('pink portable water pump',1.15,1.2,.86,new Vector3(-4.5,.7,.1),coral);
 for(const x of [-4.85,-4.15])box('pump skid',.12,.14,1.18,new Vector3(x,.1,.1),chrome);
 tube('pump carry handle',[new Vector3(-4.9,1.27,.1),new Vector3(-4.9,1.52,.1),new Vector3(-4.1,1.52,.1),new Vector3(-4.1,1.27,.1)],.037,chrome);
 const dial=MeshBuilder.CreateCylinder('pump pressure gauge',{height:.07,diameter:.28,tessellation:32},scene);dial.rotation.x=Math.PI/2;dial.position.set(-4.5,.99,-.36);dial.material=ivory;cast(dial);
 tube('pump gauge needle',[new Vector3(-4.5,.99,-.404),new Vector3(-4.43,1.07,-.404)],.007,dark);
 const port=MeshBuilder.CreateCylinder('hose outlet',{height:.16,diameter:.2,tessellation:20},scene);port.rotation.x=Math.PI/2;port.position.set(-4.5,.48,-.4);port.material=chrome;
 tube('water intake line',[new Vector3(-5,.4,.3),new Vector3(-6,.12,.7),new Vector3(-7.2,-.2,.5),new Vector3(-8,-.7,.2)],.067,ivory);
 // Layered coconut crowns: closed folded leaflets catch light as volumes rather than crossed cards.
 const treeBases:{x:number,z:number}[]=[];
 function palm(x:number,z:number,h:number){treeBases.push({x,z});
  const bend=(rnd()-.5)*2.0,points=[];for(let i=0;i<=18;i++){const t=i/18;points.push(new Vector3(x+bend*t*t,h*t,z+.5*t*t));}
  const stem=MeshBuilder.CreateTube('curved palm trunk',{path:points,radiusFunction:i=>.18*(1-i/30),tessellation:12,cap:Mesh.CAP_ALL},scene);stem.material=trunk;cast(stem);colliders.push(stem);
  const top=points.at(-1)!,vertices:number[]=[],indices:number[]=[],colors:number[]=[];
  const addClosedBlade=(path:Vector3[],widths:number[],folds:number[],twist:number,green:number)=>{
   const first=vertices.length/3,last=path.length-1;
   for(let i=0;i<=last;i++){const tangent=(i===last?path[i].subtract(path[i-1]):path[i+1].subtract(path[i])).normalize(),flat=new Vector3(-tangent.z,0,tangent.x).normalize(),normal=Vector3.Cross(tangent,flat).normalize(),spin=twist*(i/last-.15),across=flat.scale(Math.cos(spin)).add(normal.scale(Math.sin(spin))).normalize(),face=Vector3.Cross(tangent,across).normalize(),w=widths[i],f=folds[i],c=path[i];
    for(const v of [c.subtract(across.scale(w)),c.add(face.scale(f)),c.add(across.scale(w)),c.subtract(face.scale(f*.42))]){vertices.push(v.x,v.y,v.z);colors.push(.88+rnd()*.12,.9+rnd()*.1,green,1);}
   }
   for(let i=0;i<last;i++)for(let q=0;q<4;q++){const a=first+i*4+q,b=first+i*4+(q+1)%4,c=first+(i+1)*4+q,d=first+(i+1)*4+(q+1)%4;indices.push(a,c,b,b,c,d);}
   indices.push(first+2,first+1,first,first,first+3,first+2);const end=first+last*4;indices.push(end,end+1,end+2,end+2,end+3,end);
  };
  for(let k=0;k<14;k++){
   const a=k*2.399+rnd()*.22,dir=new Vector3(Math.cos(a),0,Math.sin(a)),side=new Vector3(-dir.z,0,dir.x),young=k<3,mature=k<11;
   const L=young?1.65+rnd()*.55:2.7+rnd()*1.15,rise=young?2.05:mature?.85:-.08,droop=young?.32:mature?1.3:1.9,roll=(rnd()-.5)*.35;
   const at=(t:number)=>top.add(dir.scale(L*t)).add(side.scale(Math.sin(t*Math.PI)*roll)).add(new Vector3(0,rise*Math.sin(t*Math.PI*.72)-droop*t*t,0));
   const rachisPath=[];for(let j=0;j<=7;j++)rachisPath.push(at(j/7));addClosedBlade(rachisPath,rachisPath.map((_,j)=>.035-j*.0037),rachisPath.map((_,j)=>.025-j*.0026),roll,young?.55:.67);
   for(let j=1;j<=9;j++){const t=j/10,anchor=at(t),len=(young?.34:.78)*Math.pow(Math.sin(t*Math.PI),.62)+.1;
    for(const sign of [-1,1]){const sweep=.18+.16*t,down=.08+.18*t+(mature?0:.06),tip=anchor.add(side.scale(sign*len)).add(dir.scale(sweep)).add(new Vector3(0,-down,0)),bow=side.scale(sign*(.05+.06*Math.sin(t*Math.PI))),p1=Vector3.Lerp(anchor,tip,.34).add(bow).add(new Vector3(0,.04,0)),p2=Vector3.Lerp(anchor,tip,.7).add(bow.scale(.55)).add(new Vector3(0,-.02,0)),width=.072*(.75+.25*Math.sin(t*Math.PI));
     addClosedBlade([anchor,p1,p2,tip],[width*.55,width,width*.62,.008],[.018,.035,.024,.005],sign*(.52+.35*t)+(rnd()-.5)*.18,young?.54:.66);
    }
   }
  }
  const m=new Mesh('layered coconut crown',scene),normals:number[]=[];VertexData.ComputeNormals(vertices,indices,normals);const data=new VertexData();data.positions=vertices;data.indices=indices;data.normals=normals;data.colors=colors;data.applyToMesh(m);m.material=rnd()>.4?leaf:leafLight;cast(m);
 }
 for(const [x,z,h] of [[-5,14,5.7],[-4.6,18,7.8],[-3.3,22,8.8],[-1,23,7],[1.7,24,8.5],[4.5,22,9.2],[6.1,18,6.7],[5.7,13,5.2],[2.9,20,6.5],[-5.4,23,6.6],[6.4,24,7.1]])palm(x,z,h);
 const assetsReady=Promise.all([
  ImportMeshAsync(`${base}models/fern-02/fern.gltf`,scene).then(result=>{
   const sources=result.meshes.filter(m=>m instanceof Mesh&&m.getTotalVertices()>0) as Mesh[];
   for(const source of sources){source.receiveShadows=true;source.setEnabled(false);if(source.material instanceof PBRMaterial){source.material.backFaceCulling=false;source.material.twoSidedLighting=true;source.material.albedoColor.set(.75,.85,.58);source.material.maxSimultaneousLights=5;}}
   for(let i=0;i<150;i++){const a=rnd()*Math.PI*2,r=3.8+rnd()*3.5,x=.7+Math.cos(a)*r,z=18+Math.sin(a)*r;if(z<19&&Math.abs(x)<3.6)continue;
    const source=sources[i%sources.length],mesh=source.createInstance('fern understory');mesh.parent=null;mesh.position.set(x,.02,z);const scale=1.1+rnd()*2;mesh.scaling.set(scale,scale,scale);mesh.rotationQuaternion=Quaternion.FromEulerAngles(0,rnd()*6.28,0);mesh.receiveShadows=true;shadows.addShadowCaster(mesh);
   }
  }),
  ImportMeshAsync(`${base}models/coast-rocks.glb`,scene).then(result=>{
   const source=result.meshes.find(m=>m instanceof Mesh&&m.getTotalVertices()>0) as Mesh;source.setEnabled(false);
   const mat=source.material as PBRMaterial;mat.albedoColor.set(.13,.15,.15);mat.metallic=0;mat.roughness=.76;if(mat.bumpTexture)mat.bumpTexture.level=.28;mat.clearCoat.isEnabled=true;mat.clearCoat.intensity=.16;mat.clearCoat.roughness=.4;mat.maxSimultaneousLights=5;
   const patches=[[-.2,.015,7,.18,.23,.33,0],[.5,.025,18,.36,.32,.48,.12],[-10,.02,-1,.18,.30,.20,.4],[8,.02,17,.18,.26,.25,-.8],[-7,.02,18,.18,.27,.25,.6]];
   for(const [x,y,z,sx,sy,sz,rot] of patches){const mesh=source.clone('scanned volcanic shelf',null)!;mesh.setEnabled(true);mesh.makeGeometryUnique();mesh.parent=null;mesh.position.set(x,y,z);mesh.scaling.set(sx,sy,sz);mesh.rotationQuaternion=Quaternion.FromEulerAngles(0,rot,0);mesh.computeWorldMatrix(true);mesh.bakeCurrentTransformIntoVertices();const pos=mesh.getVerticesData('position')!,normals=mesh.getVerticesData('normal')!;for(let i=0;i<pos.length;i+=3){const px=pos[i],pz=pos[i+2],pathClear=Math.abs(px)<2.85&&pz<13&&pz>1,groveClear=Math.hypot(px-.7,pz-18)<6.0,deckClear=px>=-7&&px<=5&&pz>=-8&&pz<=2;if(pathClear||groveClear||deckClear)pos[i+1]=Math.min(pos[i+1],-.012);}VertexData.ComputeNormals(pos,mesh.getIndices()!,normals);mesh.updateVerticesData('position',pos,true);mesh.updateVerticesData('normal',normals);mesh.receiveShadows=true;shadows.addShadowCaster(mesh);}
  })
 ]);
 const sea=MeshBuilder.CreateGround('reflective blue ocean',{width:2800,height:2800},scene);sea.position.y=-.39;sea.isPickable=false;
 const seaMat=new StandardMaterial('deep blue reflective water',scene);seaMat.diffuseColor=C('#052e55');seaMat.specularColor=C('#e5f7ff');seaMat.specularPower=190;seaMat.disableLighting=true;seaMat.emissiveColor=C('#063951');seaMat.ambientColor=C('#020a12');
 const mirror=new MirrorTexture('sea reflection',quality().reflectionSize,scene,true);mirror.mirrorPlane=new Plane(0,-1,0,-.4);mirror.refreshRate=quality().reflectionRefreshRate;mirror.adaptiveBlurKernel=.4;mirror.level=.55;mirror.renderList=scene.meshes.filter(m=>m!==sea);seaMat.reflectionTexture=mirror;
 const fresnel=new FresnelParameters();fresnel.bias=.08;fresnel.power=3;fresnel.leftColor=Color3.White();fresnel.rightColor=new Color3(.08,.08,.08);seaMat.reflectionFresnelParameters=fresnel;
 const ocean=new ShaderMaterial('sunlit rippled ocean',scene,{vertexSource:`precision highp float;attribute vec3 position;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 worldPos;varying vec4 clipPos;void main(){worldPos=(world*vec4(position,1.)).xyz;clipPos=worldViewProjection*vec4(position,1.);gl_Position=clipPos;}`,fragmentSource:`precision highp float;varying vec3 worldPos;varying vec4 clipPos;uniform sampler2D reflected;uniform vec3 eye;uniform float time;
 void main(){vec2 p=worldPos.xz;float a=sin(p.x*.72+p.y*1.45+time*.32),b=sin(p.x*1.9-p.y*.86-time*.27),c=sin(p.x*4.2+p.y*2.7+time*.2);vec3 n=normalize(vec3((a*.011+b*.006),1.,(b*.009+c*.003)));vec3 v=normalize(eye-worldPos);float distanceToEye=length(eye-worldPos);vec2 uv=clipPos.xy/clipPos.w*.5+.5;uv+=n.xz*.009/(1.+distanceToEye*.01);vec3 reflectedColor=texture2D(reflected,clamp(uv,vec2(.001),vec2(.999))).rgb;float f=.34+.56*pow(1.-max(dot(n,v),0.),3.5);vec3 deep=mix(vec3(.003,.06,.18),vec3(.008,.15,.3),clamp(distanceToEye/180.,0.,1.));vec3 light=normalize(vec3(.7,.65,-.5));float spec=pow(max(dot(reflect(-light,n),v),0.),280.);vec3 color=mix(deep,reflectedColor*.88,f)+vec3(1.,.78,.48)*spec*1.35;float ripple=.5+.5*sin(p.y*2.2+sin(p.x*.7)+time*.24);color+=vec3(.001,.003,.004)*ripple*max(0.,1.-distanceToEye/110.);gl_FragColor=vec4(color,1.);}`},{attributes:['position'],uniforms:['world','worldViewProjection','eye','time'],samplers:['reflected']});scene.customRenderTargets.push(mirror);ocean.setTexture('reflected',mirror);ocean.setVector3('eye',camera.position);ocean.setFloat('time',0);ocean.backFaceCulling=false;sea.material=ocean;
 function canOccupy(x:number,z:number){const deckArea=x>=-7&&x<=5&&z>=-8&&z<=2;const pathArea=Math.abs(x)<=2.65&&z>=1&&z<=13;const groveArea=Math.hypot(x-.7,z-18)<=6.3;const clearPump=Math.hypot(x+4.5,z-.1)>1.05;const clearChair=!(x< -3.65&&x> -5.7&&z> -7.1&&z< -3.7);const clearTrees=treeBases.every(p=>Math.hypot(x-p.x,z-p.z)>.3);return (deckArea||pathArea||groveArea)&&clearPump&&clearChair&&clearTrees;}
 for(const mesh of scene.meshes)mesh.freezeWorldMatrix();
 let reflectionCount=scene.meshes.length;
 function update(t:number){ocean.setFloat('time',t);ocean.setVector3('eye',camera.position);if(scene.meshes.length!==reflectionCount){reflectionCount=scene.meshes.length;mirror.renderList=scene.meshes.filter(m=>m!==sea&&m.isVisible&&m.name!=='fern understory'&&m.name!=='deck fasteners'&&!m.name.startsWith('water '));}}
 function resize(){engine.setHardwareScalingLevel(quality().hardwareScaling);camera.fovMode=canvas.clientWidth<canvas.clientHeight?1:0;engine.resize();}
 function observePerformance(sample:{dt:number;fps:number;active:boolean}){const before=performancePolicy.diagnostics(),after=performancePolicy.observe(sample);if(after.tier!==before.tier){mirror.refreshRate=after.reflectionRefreshRate;pipeline.bloomEnabled=after.bloomEnabled;if(after.tier==='reduced-resolution'){engine.setHardwareScalingLevel(quality().hardwareScaling);engine.resize();}}return quality();}
 resize();
 return {resize,renderQuality:quality,observePerformance,assetsReady,engine,scene,camera,colliders,canOccupy,shadows,terrainMeshes,spawn:new Vector3(0,0,-3),update,dispose:()=>engine.dispose(),setEstablishingView:()=>{camera.position.set(8.5,3.2,-10);camera.setTarget(new Vector3(-2,2.1,14));},materials:{ivory,chrome,dark},tube};
}
