import {AbstractMesh,Matrix,Vector3,VertexBuffer} from '@babylonjs/core';

export class SelectedSkinVertices{
 readonly output:Float32Array;readonly supported:boolean;private positions:any;private matrixIndices:any;private matrixWeights:any;private extraIndices:any;private extraWeights:any;private final=Matrix.Zero();private temporary=Matrix.Zero();private point=Vector3.Zero();
 constructor(readonly mesh:AbstractMesh,readonly vertices:number[]){
  this.positions=mesh.getVerticesData(VertexBuffer.PositionKind);this.matrixIndices=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);this.matrixWeights=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);this.extraIndices=mesh.numBoneInfluencers>4?mesh.getVerticesData(VertexBuffer.MatricesIndicesExtraKind):null;this.extraWeights=mesh.numBoneInfluencers>4?mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind):null;this.supported=!!mesh.skeleton&&!!this.positions&&!!this.matrixIndices&&!!this.matrixWeights&&(mesh.numBoneInfluencers<=4||!!this.extraIndices&&!!this.extraWeights);this.output=new Float32Array(vertices.length*3);
 }
 update(){
  if(!this.supported){const all=this.mesh.getPositionData(true);if(all)for(let i=0;i<this.vertices.length;i++){const source=this.vertices[i]*3;this.output[i*3]=all[source];this.output[i*3+1]=all[source+1];this.output[i*3+2]=all[source+2];}return this.output;}
  const matrices=this.mesh.skeleton!.getTransformMatrices(this.mesh)!;
  for(let i=0;i<this.vertices.length;i++){const vertex=this.vertices[i],weightOffset=vertex*4;this.final.reset();for(let influence=0;influence<4;influence++){const weight=this.matrixWeights[weightOffset+influence];if(weight>0){Matrix.FromFloat32ArrayToRefScaled(matrices,Math.floor(this.matrixIndices[weightOffset+influence]*16),weight,this.temporary);this.final.addToSelf(this.temporary);}}if(this.extraIndices&&this.extraWeights)for(let influence=0;influence<4;influence++){const weight=this.extraWeights[weightOffset+influence];if(weight>0){Matrix.FromFloat32ArrayToRefScaled(matrices,Math.floor(this.extraIndices[weightOffset+influence]*16),weight,this.temporary);this.final.addToSelf(this.temporary);}}const source=vertex*3;Vector3.TransformCoordinatesFromFloatsToRef(this.positions[source],this.positions[source+1],this.positions[source+2],this.final,this.point);this.point.toArray(this.output,i*3);}
  return this.output;
 }
 maxReferenceError(){const reference=this.mesh.getPositionData(true);if(!reference)return Infinity;let maximum=0;const selected=this.update();for(let i=0;i<this.vertices.length;i++){const source=this.vertices[i]*3,target=i*3;maximum=Math.max(maximum,Math.abs(selected[target]-reference[source]),Math.abs(selected[target+1]-reference[source+1]),Math.abs(selected[target+2]-reference[source+2]));}return maximum;}
}
