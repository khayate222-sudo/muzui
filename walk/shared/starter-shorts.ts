import type {Post} from './model';
export const starterShorts=[
  {slug:'sketch-mug',genre:'art',title:'一緒に描こう、小さなマグ。',kind:'drawing',description:'楕円から輪郭、取っ手、やわらかな影へ。一本ずつ線が増える、32秒の描画レッスン。',question:'このマグ、何色にしたい？'},
  {slug:'sketch-leaf',genre:'art',title:'拾った葉っぱを、一枚だけ。',kind:'drawing',description:'外側のかたち、葉脈、重なる緑。身近な一枚を描いてみる、32秒の描画レッスン。',question:'今日、持ち帰りたい色は？'},
  {slug:'sketch-window',genre:'art',title:'窓の向こうに、好きな街を。',kind:'drawing',description:'窓枠を描いて、向こう側へ光を置く。余白から景色が生まれる、32秒の描画レッスン。',question:'この窓辺に、何を置きたい？'},
  {slug:'coffee-letter',genre:'discovery',title:'珈琲が冷める前に。',kind:'story',description:'ひとり分の珈琲、机に届く小さな便り。湯気の向こうに余白が増える、32秒の描画短編。',question:'誰に「また、ここで」と伝えたい？'},
  {slug:'rain-light',genre:'discovery',title:'雨の向こうに、ひとつの灯り。',kind:'story',description:'窓を流れる雨と、ふいに灯る机の明かり。雨上がりを待つ、32秒の描画短編。',question:'雨の日、どこで過ごしたい？'},
  {slug:'paper-flight',genre:'discovery',title:'帰り道の、紙ひこうき。',kind:'story',description:'一枚の紙が折られ、窓の向こうへ出かけ、また机へ。寄り道する32秒の描画短編。',question:'明日、どこへ寄り道しよう？'},
] as const;
export const shortDuration=32;
export function starterShort(post:Pick<Post,'id'|'mediaUrl'|'origin'|'type'|'isSample'>){
  return post.origin==='editorial'&&!post.isSample&&post.type==='video'?starterShorts.find(f=>post.id==='walk-short-'+f.slug&&post.mediaUrl==='/films/walk-short-'+f.slug+'.mp4'):undefined;
}
export const shortPoster=(slug:string)=>'/films/walk-short-'+slug+'.jpg';
export const isShortMedia=(value:string)=>starterShorts.some(f=>value==='/films/walk-short-'+f.slug+'.mp4');
