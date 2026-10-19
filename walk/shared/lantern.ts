import type {PublicUser} from './community';
export const lanternWorld='venue:lantern';
export const lanternTables=['moon','sun'] as const;
export type LanternChoice='sun'|'moon';
export type LanternMember={user:PublicUser;ready:{choice:LanternChoice;bet:number}|null};
export type LanternTable={id:typeof lanternTables[number];roundId:string;revision:number;members:LanternMember[];result:{outcome:LanternChoice;results:{userId:string;net:number}[]}|null};
export type LanternState={enabled:boolean;table:LanternTable|null};
