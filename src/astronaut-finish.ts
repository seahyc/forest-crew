import {AbstractMesh,Color3,Mesh,MeshBuilder,PBRMaterial,Quaternion,TransformNode,Vector3} from '@babylonjs/core';

function material(name:string,color:string,mesh:AbstractMesh){
 const result=new PBRMaterial(name,mesh.getScene());result.albedoColor=Color3.FromHexString(color).toLinearSpace();result.metallic=.02;result.roughness=.62;result.maxSimultaneousLights=5;return result;
}

function boneNode(meshes:AbstractMesh[],name:string){
 for(const mesh of meshes)for(const bone of mesh.skeleton?.bones??[])if(bone.name.replace('mixamorig:','')===name)return bone.getTransformNode();
 return null;
}

function attach(mesh:Mesh,node:TransformNode|null,position:Vector3,rotation=Vector3.Zero()){
 if(!node){mesh.dispose();return;}mesh.name=`firefighter-${mesh.name}`;mesh.isPickable=false;mesh.parent=node;mesh.position.copyFrom(position);mesh.rotationQuaternion=Quaternion.FromEulerVector(rotation);
}

function addFirefighterKit(meshes:AbstractMesh[]){
 const source=meshes.find(mesh=>mesh.getTotalVertices()>0);if(!source)return;
 const scene=source.getScene(),tan=material('firefighter-turnout-tan','#a9683f',source),navy=material('firefighter-protective-navy','#182b35',source),reflective=material('firefighter-reflective-fluorescent','#eef06a',source),red=material('firefighter-helmet-red','#c83d2f',source),yellow=material('firefighter-helmet-yellow','#f4bf3d',source);
 const box=(name:string,size:{width:number;height:number;depth:number},mat:PBRMaterial,node:string,at:Vector3,rotation=Vector3.Zero())=>{const part=MeshBuilder.CreateBox(name,size,scene);part.material=mat;attach(part,boneNode(meshes,node),at,rotation);};
 const cylinder=(name:string,diameter:number,height:number,mat:PBRMaterial,node:string,at:Vector3,rotation=Vector3.Zero())=>{const part=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:24},scene);part.material=mat;attach(part,boneNode(meshes,node),at,rotation);};
 // A compact coat shell and real raised pockets make the base suit read as turnout gear.
 box('turnout-coat-body',{width:.43,height:.34,depth:.25},tan,'Spine1',new Vector3(0,.055,.018));
 box('turnout-collar',{width:.34,height:.075,depth:.27},navy,'Spine2',new Vector3(0,.105,.015));
 box('turnout-pocket-left',{width:.14,height:.1,depth:.055},tan,'Spine1',new Vector3(-.115,-.055,.145));
 box('turnout-pocket-right',{width:.14,height:.1,depth:.055},tan,'Spine1',new Vector3(.115,-.055,.145));
 box('turnout-coat-reflective-band',{width:.445,height:.052,depth:.267},reflective,'Spine1',new Vector3(0,-.07,.018));
 for(const side of ['Left','Right']){
  cylinder(`${side.toLowerCase()}-sleeve-reflective-band`,.205,.052,reflective,`${side}ForeArm`,new Vector3(0,.11,0));
  cylinder(`${side.toLowerCase()}-trouser-reflective-band`,.225,.06,reflective,`${side}Leg`,new Vector3(0,.32,0));
  box(`${side.toLowerCase()}-protective-boot`,{width:.205,height:.16,depth:.31},navy,`${side}Foot`,new Vector3(0,.07,.075),new Vector3(.18,0,0));
 }
 // Broad brim, domed crown and raised crest retain an astronaut-firefighter silhouette.
 cylinder('helmet-brim',.5,.045,red,'Head',new Vector3(0,.255,.015));
 const crown=MeshBuilder.CreateSphere('helmet-crown',{diameter:.37,segments:24},scene);crown.material=red;crown.scaling.set(1,.68,1);attach(crown,boneNode(meshes,'Head'),new Vector3(0,.31,.005));
 box('helmet-crest',{width:.055,height:.16,depth:.31},yellow,'Head',new Vector3(0,.41,.005));
 box('helmet-front-shield',{width:.16,height:.13,depth:.035},yellow,'Head',new Vector3(0,.305,.195),new Vector3(-.08,0,0));
}

/** Preserve the existing rig and silhouettes; soften split surface normals and finish the suit. */
export function finishAstronaut(meshes:AbstractMesh[]){
 for(const mesh of meshes){
  const mat=mesh.material;
  if(mat instanceof PBRMaterial){
   if(mat.name==='white'){mat.albedoColor=Color3.FromHexString('#ad7048').toLinearSpace();mat.metallic=0;mat.roughness=.62;}
   if(mat.name==='gray'){mat.albedoColor=Color3.FromHexString('#1d3139').toLinearSpace();mat.metallic=.02;mat.roughness=.58;}
   if(mat.name==='flag'){mat.albedoTexture=null;mat.albedoColor=Color3.FromHexString('#eef06a').toLinearSpace();mat.metallic=0;mat.roughness=.55;}
   if(mat.name==='transparent_mask'){mat.albedoColor=Color3.FromHexString('#68473a').toLinearSpace();mat.metallic=.8;mat.roughness=.16;mat.clearCoat.isEnabled=true;}
   mat.maxSimultaneousLights=5;
  }
  const positions=mesh.getVerticesData('position'),normals=mesh.getVerticesData('normal');if(!positions||!normals)continue;
  const groups=new Map<string,number[]>();
  for(let i=0;i<positions.length;i+=3){const key=[positions[i],positions[i+1],positions[i+2]].map(v=>v.toFixed(5)).join(':');const group=groups.get(key)||[];group.push(i);groups.set(key,group);}
  const result=normals.slice();
  for(const group of groups.values())for(const i of group){const n=new Vector3(normals[i],normals[i+1],normals[i+2]),sum=Vector3.Zero();for(const j of group){const other=new Vector3(normals[j],normals[j+1],normals[j+2]);if(Vector3.Dot(n,other)>.25)sum.addInPlace(other);}sum.normalize();result[i]=sum.x;result[i+1]=sum.y;result[i+2]=sum.z;}
  mesh.setVerticesData('normal',result,true);
 }
 addFirefighterKit(meshes);
}
