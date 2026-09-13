import {AbstractMesh,Color3,DynamicTexture,Mesh,MeshBuilder,PBRMaterial,Quaternion,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';

export type AstronautFinish='player'|'firefighter'|'engineer';
export type CrewActivityPose={activity:string;taskId:string|null;thinking?:boolean;time:number};
export type CrewActivityRig={reset():void;apply(pose:CrewActivityPose):void};

function material(name:string,color:string,mesh:AbstractMesh){
 const result=new PBRMaterial(name,mesh.getScene());result.albedoColor=Color3.FromHexString(color).toLinearSpace();result.metallic=.02;result.roughness=.56;result.maxSimultaneousLights=5;return result;
}

function boneNode(meshes:AbstractMesh[],name:string){
 for(const mesh of meshes)for(const bone of mesh.skeleton?.bones??[])if(bone.name.replace('mixamorig:','')===name)return bone.getTransformNode();
 return null;
}

function attach(mesh:Mesh,node:TransformNode|null,position:Vector3,rotation=Vector3.Zero(),prefix='firefighter'){
 if(!node){mesh.dispose();return;}mesh.name=`${prefix}-${mesh.name}`;mesh.isPickable=false;mesh.parent=node;mesh.position.copyFrom(position);mesh.rotationQuaternion=Quaternion.FromEulerVector(rotation);
}

function addFirefighterKit(meshes:AbstractMesh[],finish:AstronautFinish){
 const source=meshes.find(mesh=>mesh.getTotalVertices()>0);if(!source)return;
 const accentHex=finish==='firefighter'?'#2b8f88':finish==='engineer'?'#d08a32':'#b86159',prefix=finish;
 const scene=source.getScene(),ivory=material(`${prefix}-turnout-ivory`,'#e9ded0',source),charcoal=material(`${prefix}-protective-charcoal`,'#263238',source),reflective=material(`${prefix}-reflective-champagne`,'#d6c7ad',source),helmet=material(`${prefix}-helmet-ivory`,'#eee5da',source),accent=material(`${prefix}-gear-accent`,accentHex,source);
 reflective.metallic=.28;reflective.roughness=.34;
 helmet.metallic=.05;helmet.roughness=.3;helmet.clearCoat.isEnabled=true;helmet.clearCoat.intensity=.42;helmet.clearCoat.roughness=.24;
 accent.metallic=.04;accent.roughness=.4;
 const box=(name:string,size:{width:number;height:number;depth:number},mat:PBRMaterial,node:string,at:Vector3,rotation=Vector3.Zero())=>{const part=MeshBuilder.CreateBox(name,size,scene);part.material=mat;attach(part,boneNode(meshes,node),at,rotation,prefix);return part;};
 const cylinder=(name:string,diameter:number,height:number,mat:PBRMaterial,node:string,at:Vector3,rotation=Vector3.Zero())=>{const part=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:24},scene);part.material=mat;attach(part,boneNode(meshes,node),at,rotation,prefix);return part;};
 // A compact coat shell and real raised pockets make the base suit read as turnout gear.
 box('turnout-coat-body',{width:.43,height:.34,depth:.25},ivory,'Spine1',new Vector3(0,.055,.018));
 box('turnout-collar',{width:.34,height:.075,depth:.27},charcoal,'Spine2',new Vector3(0,.105,.015));
 box('turnout-pocket-left',{width:.14,height:.1,depth:.055},accent,'Spine1',new Vector3(-.115,-.055,.145));
 box('turnout-pocket-right',{width:.14,height:.1,depth:.055},accent,'Spine1',new Vector3(.115,-.055,.145));
 box('turnout-coat-reflective-band',{width:.445,height:.052,depth:.267},reflective,'Spine1',new Vector3(0,-.07,.018));
 for(const side of ['Left','Right']){
  cylinder(`${side.toLowerCase()}-sleeve-reflective-band`,.205,.052,reflective,`${side}ForeArm`,new Vector3(0,.11,0));
  cylinder(`${side.toLowerCase()}-trouser-reflective-band`,.225,.06,reflective,`${side}Leg`,new Vector3(0,.32,0));
  box(`${side.toLowerCase()}-protective-boot`,{width:.205,height:.16,depth:.31},charcoal,`${side}Foot`,new Vector3(0,.07,.075),new Vector3(.18,0,0));
 }
 // The engineer gets a compact utility rim; the firefighter retains a broad rescue brim.
 cylinder('helmet-brim',finish==='engineer'?.4:.5,.045,finish==='player'?helmet:accent,'Head',new Vector3(0,.255,.015));
 const crown=MeshBuilder.CreateSphere('helmet-crown',{diameter:.37,segments:24},scene);crown.material=helmet;crown.scaling.set(1,.68,1);attach(crown,boneNode(meshes,'Head'),new Vector3(0,.31,.005));
 box('helmet-crest',{width:finish==='engineer'?.12:.055,height:finish==='engineer'?.08:.16,depth:.31},accent,'Head',new Vector3(0,finish==='engineer'?.39:.41,.005));
 box('helmet-front-shield',{width:.16,height:.13,depth:.035},accent,'Head',new Vector3(0,.305,.195),new Vector3(-.08,0,0));
 if(finish!=='player'){
  const badgeTexture=new DynamicTexture(`${prefix}-helmet-badge-texture`,{width:256,height:112},scene,false);
  badgeTexture.hasAlpha=true;badgeTexture.drawText(finish==='firefighter'?'FIRE':'ENG',null,76,'bold 54px Arial','#fff',accentHex,true,true);
  const badgeMaterial=new StandardMaterial(`${prefix}-helmet-badge`,scene);badgeMaterial.diffuseTexture=badgeTexture;badgeMaterial.opacityTexture=badgeTexture;badgeMaterial.emissiveColor=Color3.FromHexString(accentHex).scale(.18);badgeMaterial.roughness=.5;
  const badge=MeshBuilder.CreatePlane('helmet-role-badge',{width:.135,height:.058},scene);badge.material=badgeMaterial;attach(badge,boneNode(meshes,'Head'),new Vector3(0,.31,.216),new Vector3(-.08,0,0),prefix);
  const handle=box('work-tool-handle',{width:.035,height:.24,depth:.035},charcoal,'RightHand',new Vector3(0,-.09,.04),new Vector3(0,0,.35));
  const head=box('work-tool-head',{width:.14,height:.045,depth:.045},accent,'RightHand',new Vector3(-.025,-.19,.04),new Vector3(0,0,.35));
  handle.setEnabled(false);head.setEnabled(false);
 }
}

const addRotation=(node:TransformNode|null|undefined,x=0,y=0,z=0)=>{if(!node)return;const current=node.rotationQuaternion??Quaternion.FromEulerVector(node.rotation);node.rotationQuaternion=current.multiply(Quaternion.FromEulerAngles(x,y,z));};

/** Cache the finished rig's neutral transforms and add snapshot-driven work gestures. */
export function createCrewActivityRig(meshes:AbstractMesh[]):CrewActivityRig{
 const names=['Spine1','Spine2','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'] as const;
 const bones=Object.fromEntries(names.map(name=>[name,boneNode(meshes,name)])) as Record<typeof names[number],TransformNode|null>;
 const rest=new Map(names.map(name=>[name,bones[name]?.rotationQuaternion?.clone()??Quaternion.FromEulerVector(bones[name]?.rotation??Vector3.Zero())]));
 const tools=meshes.filter(mesh=>mesh.name.includes('-work-tool-'));
 const reset=()=>{for(const name of names){const node=bones[name],rotation=rest.get(name);if(node&&rotation)node.rotationQuaternion=rotation.clone();}for(const tool of tools)tool.setEnabled(false);};
 const apply=(pose:CrewActivityPose)=>{
  const working=pose.activity==='working',pumping=pose.activity==='pumping'&&pose.taskId==='operate_pump',phase=pose.time*Math.PI*2;
  for(const tool of tools)tool.setEnabled(working&&pose.taskId==='repair_pump');
  if(working){
   if(pose.taskId==='fetch_hose'){
    const lift=.12*Math.sin(phase*1.1);addRotation(bones.Spine1,-.16);addRotation(bones.LeftArm,.72+lift,0,-.2);addRotation(bones.RightArm,.58-lift,0,.2);addRotation(bones.LeftForeArm,.55);addRotation(bones.RightForeArm,.7);
   }else if(pose.taskId==='connect_hose'){
    const twist=.18*Math.sin(phase*1.5);addRotation(bones.Spine1,-.12);addRotation(bones.LeftArm,.86,0,-.28);addRotation(bones.RightArm,.86,0,.28);addRotation(bones.LeftForeArm,.62+twist);addRotation(bones.RightForeArm,.62-twist);addRotation(bones.LeftHand,0,twist);addRotation(bones.RightHand,0,-twist);
   }else if(pose.taskId==='repair_pump'){
    const strike=.3*(.5+.5*Math.sin(phase*1.35));addRotation(bones.Spine1,-.28);addRotation(bones.Head,.12);addRotation(bones.LeftArm,.7,0,-.22);addRotation(bones.LeftForeArm,.78);addRotation(bones.RightArm,.55+strike,0,.18);addRotation(bones.RightForeArm,.7+strike*.45);
   }
  }else if(pumping){
   const lever=.22*Math.sin(phase*1.2);addRotation(bones.Spine1,-.14-lever*.12);addRotation(bones.LeftArm,.78+lever,0,-.22);addRotation(bones.RightArm,.78+lever,0,.22);addRotation(bones.LeftForeArm,.72-lever*.55);addRotation(bones.RightForeArm,.72-lever*.55);
  }else if(pose.activity==='idle'){
   addRotation(bones.Spine1,.012*Math.sin(phase*.28));
   if(pose.thinking){addRotation(bones.Head,0,.07*Math.sin(phase*.18));addRotation(bones.Spine2,0,.025*Math.sin(phase*.18));}
  }
 };
 return {reset,apply};
}

/** Preserve the existing rig and silhouettes; soften split surface normals and finish the suit. */
export function finishAstronaut(meshes:AbstractMesh[],finish:AstronautFinish='player'){
 const finishes=new Map<PBRMaterial,PBRMaterial>();
 for(const mesh of meshes){
 let mat=mesh.material;
  if(mat instanceof PBRMaterial){
   const originalName=mat.name;
   let finished:PBRMaterial=mat;
   if(['white','gray','flag','transparent_mask'].includes(originalName)){
    let avatarMat=finishes.get(mat);
    if(!avatarMat){avatarMat=mat.clone(`${finish}-turnout-${originalName}`) as PBRMaterial;finishes.set(mat,avatarMat);}
    mesh.material=avatarMat;finished=avatarMat;
   }
   if(originalName==='white'){finished.albedoColor=Color3.FromHexString('#e8ddd0').toLinearSpace();finished.metallic=.01;finished.roughness=.5;}
   if(originalName==='gray'){finished.albedoColor=Color3.FromHexString('#28343a').toLinearSpace();finished.metallic=.04;finished.roughness=.5;}
   if(originalName==='flag'){finished.albedoTexture=null;finished.albedoColor=Color3.FromHexString(finish==='firefighter'?'#2b8f88':finish==='engineer'?'#d08a32':'#b86159').toLinearSpace();finished.metallic=.02;finished.roughness=.42;}
   if(originalName==='transparent_mask'){finished.albedoColor=Color3.FromHexString('#665750').toLinearSpace();finished.metallic=.55;finished.roughness=.2;finished.clearCoat.isEnabled=true;finished.clearCoat.intensity=.55;finished.clearCoat.roughness=.18;}
   finished.maxSimultaneousLights=5;
  }
  const positions=mesh.getVerticesData('position'),normals=mesh.getVerticesData('normal');if(!positions||!normals)continue;
  const groups=new Map<string,number[]>();
  for(let i=0;i<positions.length;i+=3){const key=[positions[i],positions[i+1],positions[i+2]].map(v=>v.toFixed(5)).join(':');const group=groups.get(key)||[];group.push(i);groups.set(key,group);}
  const result=normals.slice();
  for(const group of groups.values())for(const i of group){const n=new Vector3(normals[i],normals[i+1],normals[i+2]),sum=Vector3.Zero();for(const j of group){const other=new Vector3(normals[j],normals[j+1],normals[j+2]);if(Vector3.Dot(n,other)>.25)sum.addInPlace(other);}sum.normalize();result[i]=sum.x;result[i+1]=sum.y;result[i+2]=sum.z;}
  mesh.setVerticesData('normal',result,true);
 }
 addFirefighterKit(meshes,finish);
}
