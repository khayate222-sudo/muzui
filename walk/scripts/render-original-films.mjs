// Rebuild WALK's original, silent 12-second landscape films from its own artwork.
// Requires ffmpeg with libx264. No external clips, music or network access.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(root+'public/films',{recursive:true});
for(const genre of ['discovery','music','video','art','meme','game','anime']){
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',root+'public/art/world-'+genre+'.webp','-vf',"zoompan=z='1.035+0.035*on/287':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=288:s=960x640:fps=24,format=yuv420p",'-an','-c:v','libx264','-threads','2','-preset','medium','-crf','25','-movflags','+faststart','-map_metadata','-1',root+'public/films/walk-'+genre+'.mp4'],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
  console.log('Rendered '+genre+' (12s, silent, 960×640 H.264)');
}
