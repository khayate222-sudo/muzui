import type {PublicUser} from './community';
export const playSymbols=['leaf','moon','star','house','note','ticket'] as const;
export type PlaySymbol=typeof playSymbols[number];
export type PlayTable={worldId:string;roundId:string;revision:number;members:PublicUser[];cards:(PlaySymbol|null)[];revealed:number[];matched:number[];turns:number;complete:boolean};
export type PlayState={table:PlayTable|null};
