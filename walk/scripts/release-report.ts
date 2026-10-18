import {releaseReport} from '../shared/release-report';
const args=process.argv.slice(2);
if(args.some(a=>a!=='--probe'))throw new Error('Usage: npm run release:report [-- --probe]');
console.log(JSON.stringify(await releaseReport(process.env,args.includes('--probe')),null,2));
