import type {BuildingPiece} from './building';
export const cosmeticCatalog=[{id:'sakura',label:'桜色の素材',cost:150},{id:'midnight',label:'夜空色の素材',cost:150},{id:'copper',label:'銅色の素材',cost:150}] as const;
export type Cosmetic=typeof cosmeticCatalog[number]['id'];
export type GameJob={id:string;ownerId:string;ownerName:string;workerId:string|null;workerName:string|null;title:string;description:string;reward:number;state:'open'|'requested'|'assigned'|'submitted'|'completed'|'cancelled';delivery:{note:string;blueprint?:BuildingPiece[]}|null;createdAt:number;updatedAt:number};
export type ArcadeRound={requestId:string;choice:'sun'|'moon';outcome:'sun'|'moon';bet:number;net:number;createdAt:number};
export type EconomyState={coins:number;chips:number;coinClaimed:boolean;chipClaimed:boolean;owned:Cosmetic[];catalog:typeof cosmeticCatalog;jobs:GameJob[];rounds:ArcadeRound[];arcadeEnabled:boolean;realMoneyPurchases:false;cashOut:false};
