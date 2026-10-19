import {z} from 'zod';
export const buildingKinds=['floor','wall','window','door','roof','table','chair','shelf','plant','lamp'] as const;
export const buildingColors=['wood','cream','stone','clay','moss','slate','sakura','midnight','copper'] as const;
export const buildingLabels={floor:'床',wall:'壁',window:'窓',door:'扉',roof:'屋根',table:'テーブル',chair:'椅子',shelf:'棚',plant:'鉢植え',lamp:'ランプ'} as const;
export const colorLabels={wood:'木の色',cream:'生成り',stone:'石の色',clay:'赤土',moss:'苔色',slate:'青灰色',sakura:'桜色の素材',midnight:'夜空色の素材',copper:'銅色の素材'} as const;
export const buildingPalette={wood:['#b18a62','#86664b','#d4b48b'],cream:['#e0d3b8','#b7a88e','#f3e9d3'],stone:['#b0b3ac','#868f8a','#d1d2c7'],clay:['#bd8067','#925a4d','#d8a58a'],moss:['#899c74','#637c5d','#b5c39b'],slate:['#8a9da7','#647a87','#b5c4c7'],sakura:['#c99c9a','#a97f83','#e7c6bb'],midnight:['#7e8d9e','#56687a','#b2c0ce'],copper:['#b98160','#8f6248','#d8ab7c']} as const;
export function protectedCell(x:number,y:number){return (x===5||x===6)&&y>=8;}
export const buildingPieceSchema=z.object({x:z.number().int().min(0).max(11),y:z.number().int().min(0).max(9),z:z.number().int().min(0).max(2),kind:z.enum(buildingKinds),color:z.enum(buildingColors),rotation:z.number().int().min(0).max(3)}).strict();
export const buildingPiecesSchema=z.array(buildingPieceSchema).max(180).superRefine((pieces,ctx)=>{
 const cells=new Set<string>();for(const p of pieces){const key=`${p.x}:${p.y}:${p.z}`;if(cells.has(key))ctx.addIssue({code:'custom',message:'同じマスと高さには一つだけ置けます'});cells.add(key);if(protectedCell(p.x,p.y))ctx.addIssue({code:'custom',message:'入口の通路には建築できません'});if(p.kind==='floor'&&p.z!==0)ctx.addIssue({code:'custom',message:'床は高さ0に置いてください'});}
});
export type BuildingPiece=z.infer<typeof buildingPieceSchema>;
export type Building={revision:number;pieces:BuildingPiece[];updatedAt:number};
export type BuildingSnapshot={id:string;revision:number;createdAt:number;pieceCount:number};
export const emptyBuilding=():Building=>({revision:0,pieces:[],updatedAt:0});
export function canonicalPieces(pieces:BuildingPiece[]){return [...pieces].sort((a,b)=>a.y-b.y||a.x-b.x||a.z-b.z);}
export function buildingCellPoint(x:number,y:number){return {x:1000+(x-y)*70,y:370+(x+y)*35};}
export function buildingPolygons(p:BuildingPiece):{points:number[][];color:string}[]{
 const [front,side,top]=buildingPalette[p.color],height=({floor:6,wall:66,window:66,door:66,roof:24,table:26,chair:22,shelf:52,plant:34,lamp:58})[p.kind];
 let w=34,d=17;if(['wall','window','door'].includes(p.kind)){if(p.rotation%2)d=5;else w=10;}if(['chair','plant','lamp'].includes(p.kind)){w=14;d=9;}
 const z=p.z===0?0:(p.z-1)*64+6,box:{points:number[][];color:string}[]=[{points:[[-w,-z],[-w,-height-z],[0,d-height-z],[0,d-z]],color:front},{points:[[0,d-z],[0,d-height-z],[w,-height-z],[w,-z]],color:side},{points:[[-w,-height-z],[0,-d-height-z],[w,-height-z],[0,d-height-z]],color:top}];
 if(p.kind==='roof')box.push({points:[[-40,-z],[0,-36-z],[40,-z],[0,20-z]],color:front});
 if(p.kind==='window')box.push({points:[[-7,-48-z],[-7,-25-z],[7,-20-z],[7,-43-z]],color:'#b5d3ce'});
 if(p.kind==='door')box.push({points:[[-7,-48-z],[-7,-2-z],[7,4-z],[7,-42-z]],color:'#715c48'});
 if(p.kind==='plant')box.push({points:[[-19,-24-z],[0,-58-z],[19,-24-z],[0,-12-z]],color:'#849a70'});
 if(p.kind==='lamp')box.push({points:[[-22,-43-z],[-12,-68-z],[12,-68-z],[22,-43-z]],color:'#f0da9d'});
 return box;
}
