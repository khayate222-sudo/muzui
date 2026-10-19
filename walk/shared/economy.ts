import type {BuildingPiece} from './building';
export const cosmeticCatalog=[
 {id:'sakura',label:'桜色の素材',cost:150,category:'material',color:'sakura',description:'やわらかな色で、いつもの部屋に。'},
 {id:'midnight',label:'夜空色の素材',cost:150,category:'material',color:'midnight',description:'やわらかな色で、いつもの部屋に。'},
 {id:'copper',label:'銅色の素材',cost:150,category:'material',color:'copper',description:'やわらかな色で、いつもの部屋に。'},
 {id:'lantern',label:'紙の灯り',cost:100,category:'light',kind:'lantern',description:'紙を透かす、やさしい灯り。'},
 {id:'cushions',label:'窓辺のクッション',cost:100,category:'furniture',kind:'cushions',description:'窓辺に、小さな居場所を。'},
 {id:'bunting',label:'小さなガーランド',cost:100,category:'keepsake',kind:'bunting',description:'手作りの飾りで、待ち合わせを。'},
 {id:'armchair',label:'読書の椅子',cost:200,category:'furniture',kind:'armchair',description:'読みかけの物語と、ひと休み。'},
 {id:'clock',label:'古い置き時計',cost:200,category:'keepsake',kind:'clock',description:'急がない時間を、部屋の片隅に。'},
 {id:'recordplayer',label:'レコードの小机',cost:300,category:'furniture',kind:'recordplayer',description:'お気に入りを囲む、小さな机。'},
 {id:'easel',label:'絵描きのイーゼル',cost:300,category:'keepsake',kind:'easel',description:'描きかけの景色を、そばに。'},
 {id:'aquarium',label:'小さな水槽',cost:400,category:'keepsake',kind:'aquarium',description:'水の色が、部屋のアクセント。'},
 {id:'telescope',label:'星見の望遠鏡',cost:400,category:'keepsake',kind:'telescope',description:'遠い空に、思いを馳せて。'},
 {id:'arch',label:'花のアーチ',cost:600,category:'furniture',kind:'arch',description:'花をくぐる、あなたの庭。'},
] as const;
export type CoinEntry={id:string;kind:'daily'|'shop'|'job_reserve'|'job_reward'|'job_refund';delta:number;createdAt:number};
export type Cosmetic=typeof cosmeticCatalog[number]['id'];
export type GameJob={id:string;ownerId:string;ownerName:string;workerId:string|null;workerName:string|null;title:string;description:string;reward:number;state:'open'|'requested'|'assigned'|'submitted'|'completed'|'cancelled';delivery:{note:string;blueprint?:BuildingPiece[]}|null;createdAt:number;updatedAt:number};
export type ArcadeRound={requestId:string;choice:'sun'|'moon';outcome:'sun'|'moon';bet:number;net:number;createdAt:number};
export type EconomyState={coins:number;chips:number;coinHistory:CoinEntry[];coinClaimed:boolean;chipClaimed:boolean;owned:Cosmetic[];catalog:typeof cosmeticCatalog;jobs:GameJob[];rounds:ArcadeRound[];arcadeEnabled:boolean;realMoneyPurchases:false;cashOut:false};
