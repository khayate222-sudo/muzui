import { expect,it } from 'vitest';
import { containsContainer,containsLocal,isTap,polygon,rectangle } from '../src/world-input';
it('normalizes the origin for negative local coordinates in buildings, posts and avatars',()=>{
 for(const [shape,x,y,ox,oy]of [[rectangle(-72,-104,144,138),0,-75,72,56],[rectangle(-24,-89,48,102),0,-40,22.5,45],[polygon([-132,-95,-20,-196,130,-126,130,0,45,38,-110,10]),-20,-170,135,150]] as const){
  expect(containsContainer([shape],x+ox,y+oy,ox,oy)).toBe(true);expect(containsContainer([shape],500+ox,500+oy,ox,oy)).toBe(false);
 }
});
it('matches roofs and side walls while excluding the empty sky around a building',()=>{
 const roof=polygon([-132,-95,-20,-196,130,-126,60,-65]);expect(containsLocal([roof],-20,-180)).toBe(true);expect(containsLocal([roof],-120,-180)).toBe(false);expect(containsLocal([roof],-20,-196)).toBe(true);
});
it('does not turn a drag, pinch or long press into a click',()=>{
 const start={x:40,y:50,time:100};expect(isTap(start,{x:44,y:54,time:250})).toBe(true);expect(isTap(start,{x:55,y:50,time:250})).toBe(false);expect(isTap(start,{x:40,y:50,time:900})).toBe(false);expect(isTap(start,{x:40,y:50,time:250},true)).toBe(false);
});
