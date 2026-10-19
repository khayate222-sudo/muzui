import {z} from 'zod';
export const buildingKinds=['floor','wall','window','door','roof','table','chair','shelf','plant','lamp','lantern','armchair','recordplayer','easel','telescope','aquarium','cushions','arch','clock','bunting'] as const;
export const buildingColors=['wood','cream','stone','clay','moss','slate','sakura','midnight','copper'] as const;
export const buildingLabels={floor:'床',wall:'壁',window:'窓',door:'扉',roof:'屋根',table:'テーブル',chair:'椅子',shelf:'棚',plant:'鉢植え',lamp:'ランプ',lantern:'紙の灯り',armchair:'読書の椅子',recordplayer:'レコードの小机',easel:'絵描きのイーゼル',telescope:'星見の望遠鏡',aquarium:'小さな水槽',cushions:'窓辺のクッション',arch:'花のアーチ',clock:'古い置き時計',bunting:'小さなガーランド'} as const;
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
 const [front,side,top]=buildingPalette[p.color],height=({floor:6,wall:66,window:66,door:66,roof:24,table:26,chair:22,shelf:52,plant:34,lamp:58,lantern:58,armchair:38,recordplayer:30,easel:64,telescope:60,aquarium:42,cushions:10,arch:90,clock:52,bunting:64})[p.kind];
 let w=34,d=17;if(['wall','window','door'].includes(p.kind)){if(p.rotation%2)d=5;else w=10;}if(['chair','plant','lamp'].includes(p.kind)){w=14;d=9;}
 const z=p.z===0?0:(p.z-1)*64+6,box:{points:number[][];color:string}[]=[{points:[[-w,-z],[-w,-height-z],[0,d-height-z],[0,d-z]],color:front},{points:[[0,d-z],[0,d-height-z],[w,-height-z],[w,-z]],color:side},{points:[[-w,-height-z],[0,-d-height-z],[w,-height-z],[0,d-height-z]],color:top}];
 if(p.kind==='roof')box.push({points:[[-40,-z],[0,-36-z],[40,-z],[0,20-z]],color:front});
 if(p.kind==='window')box.push({points:[[-7,-48-z],[-7,-25-z],[7,-20-z],[7,-43-z]],color:'#b5d3ce'});
 if(p.kind==='door')box.push({points:[[-7,-48-z],[-7,-2-z],[7,4-z],[7,-42-z]],color:'#715c48'});
 if(p.kind==='plant')box.push({points:[[-19,-24-z],[0,-58-z],[19,-24-z],[0,-12-z]],color:'#849a70'});
 if(p.kind==='lamp')box.push({points:[[-22,-43-z],[-12,-68-z],[12,-68-z],[22,-43-z]],color:'#f0da9d'});
 const add=(points:number[][],color:string)=>box.push({points:points.map(([x,y])=>[x,y-z]),color});
 if(p.kind==='lantern'){box.splice(0);add([[-7,0],[-7,-16],[7,-16],[7,0]],side);add([[-18,-20],[-23,-37],[-15,-60],[15,-60],[23,-37],[18,-20]],'#edcf93');for(const x of [-10,0,10])add([[x-1,-57],[x+1,-57],[x+1,-23],[x-1,-23]],'#bf9e6a');add([[-14,-63],[14,-63],[10,-58],[-10,-58]],side);}
 if(p.kind==='armchair'){add([[-35,-17],[-35,-48],[20,-48],[35,-32],[0,-15]],top);add([[-30,-12],[0,4],[30,-12],[0,-27]],'#c6c5aa');add([[-37,-8],[-37,-29],[-25,-34],[-25,-4]],side);add([[24,-2],[24,-27],[36,-32],[36,-10]],front);}
 if(p.kind==='recordplayer'){add([[-23,-32],[0,-44],[24,-32],[0,-21]],'#5c615c');add([[-15,-32],[0,-39],[15,-32],[0,-25]],'#323f3d');add([[-3,-33],[0,-35],[4,-33],[0,-30]],'#d2b37c');add([[8,-34],[9,-32],[23,-37],[22,-39]],'#e4ceb0');}
 if(p.kind==='easel'){box.splice(0);add([[-26,1],[-5,-68],[1,-66],[-19,1]],side);add([[20,4],[0,-67],[5,-68],[27,4]],front);add([[-28,-59],[21,-59],[21,-23],[-28,-23]],side);add([[-23,-55],[17,-55],[17,-27],[-23,-27]],'#f4e8cc');add([[-20,-30],[-5,-43],[3,-35],[15,-45],[15,-30]],'#92a58a');}
 if(p.kind==='telescope'){box.splice(0);for(const x of [-25,0,25])add([[x,4],[0,-42],[4,-42],[x+4,4]],side);add([[-30,-58],[22,-77],[29,-61],[-23,-42]],front);add([[22,-77],[29,-61],[36,-63],[29,-80]],'#a8c7cb');}
 if(p.kind==='aquarium'){add([[-31,-36],[0,-21],[31,-36],[0,-51]],'#b1d3ca');add([[-31,-36],[-31,-10],[0,6],[0,-21]],'#9bbfb6');add([[0,-21],[0,6],[31,-10],[31,-36]],'#759f9f');add([[-22,-24],[-12,-27],[-5,-19],[-14,-17]],'#dfa36f');add([[12,-9],[14,-29],[18,-14],[22,-26],[22,-9]],'#677f60');}
 if(p.kind==='cushions'){add([[-30,-10],[0,-25],[30,-10],[0,5]],top);add([[-18,-16],[-3,-23],[12,-14],[-3,-7]],'#c69e8f');add([[0,-6],[15,-13],[29,-6],[15,2]],'#a6ad8b');}
 if(p.kind==='arch'){box.splice(0);add([[-36,0],[-36,-70],[-26,-84],[-19,-78],[-27,-65],[-27,0]],side);add([[27,0],[27,-65],[19,-78],[26,-84],[36,-70],[36,0]],front);add([[-28,-72],[-16,-91],[16,-91],[28,-72],[22,-68],[12,-82],[-12,-82],[-22,-68]],'#8fa17c');for(const [x,y] of [[-26,-76],[-11,-85],[8,-85],[25,-74]])add([[x-5,y],[x,y-6],[x+5,y],[x,y+5]],'#e3c0ad');}
 if(p.kind==='clock'){add([[-25,-45],[0,-58],[25,-45],[0,-32]],'#efe5cd');add([[0,-53],[2,-53],[2,-44],[12,-42],[11,-40],[0,-42]],'#6c6759');}
 if(p.kind==='bunting'){box.splice(0);for(const x of [-35,35])add([[x-2,0],[x-2,-65],[x+2,-65],[x+2,0]],side);add([[-35,-58],[35,-58],[35,-55],[-35,-55]],'#b1a38a');for(const [i,x]of [-24,-8,8,24].entries())add([[x-6,-55],[x+6,-55],[x,-39]],i%2?'#c6a181':'#90a18b');}
 return box;
}
