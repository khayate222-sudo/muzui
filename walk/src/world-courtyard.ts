import Phaser from 'phaser';
import { gatePoints, type Place } from '../shared/worlds';
import { polygon, rectangle, type HitRegion } from './world-input';
import { avatarFrames } from './world-layout';
import type { WorldLight } from './world-light';

const fontFamily = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
type Entrance = { container: Phaser.GameObjects.Container; regions: HitRegion[]; destination?: string };
// Authored against the integrated painting, in the same 2000 × 1400 space.
// Roof, wall and doorstep all belong to a building; the surrounding paving doesn't.
const buildingOutlines: Record<Place['theme'], number[][]> = {
  station: [[110,525,110,294,300,201,540,272,555,314,541,525], [542,530,542,301,648,233,648,139,772,90,910,140,910,243,1070,290,1070,530], [1070,550,1070,298,1175,179,1328,191,1430,304,1430,550]],
  garden: [[90,535,90,280,300,155,535,275,535,535], [535,535,535,235,790,78,1070,235,1070,535], [1070,550,1070,280,1260,160,1490,280,1490,550]],
  japan: [[105,535,105,255,320,145,540,245,540,535], [540,535,540,205,795,65,1070,205,1070,535], [1070,550,1070,245,1260,145,1480,255,1480,550]],
  future: [[100,535,100,305,237,218,237,167,337,90,440,170,440,220,545,220,545,535], [545,535,545,193,780,30,1025,193,1075,193,1075,535], [1075,550,1075,240,1260,112,1435,240,1435,550]],
  fantasy: [[25,535,25,300,160,195,220,170,220,112,270,112,270,172,370,195,535,300,535,535], [535,535,535,290,647,290,647,190,730,35,810,190,810,187,960,187,1070,300,1070,535], [1070,550,1070,270,1265,148,1490,270,1490,550]],
};
function courtyardBuildings(theme: Place['theme']) {
  return buildingOutlines[theme].map(points => polygon(points.map((value, i) => value * (i % 2 ? 1400 / 1024 : 2000 / 1536))));
}

export function prepareCourtyard(scene: Phaser.Scene) {
  scene.data.set('resident-images', []);
  if (scene.textures.exists('walk-residents')) {
    const texture = scene.textures.get('walk-residents');
    const source = texture.getSourceImage() as HTMLImageElement;
    const evening = scene.textures.createCanvas('walk-residents-evening', source.width, source.height)!;
    evening.context.drawImage(source, 0, 0);
    evening.context.globalCompositeOperation = 'source-atop';
    evening.context.fillStyle = 'rgba(65, 57, 101, .22)'; evening.context.fillRect(0, 0, source.width, source.height);
    evening.context.globalCompositeOperation = 'source-over'; evening.refresh();
    for (const target of [texture, evening]) for (const [i, style] of avatarFrames.entries()) if (!target.has(style)) target.add(style, 0, i % 3 * source.width / 3, Math.floor(i / 3) * source.height / 2, source.width / 3, source.height / 2);
  }
  if (!scene.textures.exists('courtyard')) return;
  const source = scene.textures.get('courtyard').getSourceImage() as HTMLImageElement;
  const texture = scene.textures.createCanvas('courtyard-evening', source.width, source.height);
  if (!texture) return;
  const ctx = texture.context;
  ctx.drawImage(source, 0, 0);
  ctx.fillStyle = 'rgba(65, 57, 101, .34)'; ctx.fillRect(0, 0, source.width, source.height);
  // Windows/thresholds acquire a soft, local glow, all in the same light pass.
  for (const x of [.26, .5, .745]) {
    const glow = ctx.createRadialGradient(source.width * x, source.height * .5, 0, source.width * x, source.height * .5, source.width * .065);
    glow.addColorStop(0, 'rgba(255, 201, 113, .34)'); glow.addColorStop(1, 'rgba(255, 201, 113, 0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, source.width, source.height);
  }
  texture.refresh();
}

export function drawCourtyard(scene: Phaser.Scene, place?: Place): Entrance[] | null {
  if (!scene.textures.exists('courtyard')) return null;
  const background = scene.add.image(1000, 700, 'courtyard').setDisplaySize(2000, 1400).setDepth(-100);
  scene.data.set('courtyard-background', background);
  if (!place) return [];
  const gates = gatePoints(place?.id || '');
  return [0, 1, 2].map(index => {
    const x = [510, 1000, 1490][index], gate = gates.find(g => g.x === x);
    const back = gate?.place.id === place?.parentId;
    const title = gate ? (back ? '← ' : '') + gate.place.title : index === 1 ? '行き先の案内' : 'ほかの世界へ';
    const c = scene.add.container(0, 0).setSize(2000, 1400).setDepth(760);
    const halo = scene.add.graphics().lineStyle(3, 0xffedc7, .85).strokeEllipse(x, 760, 235, 24).setVisible(false);
    const label = scene.add.text(x, 780, title, { fontFamily, fontSize: '22px', color: '#594d40', backgroundColor: '#fff7e8', padding: { x: 16, y: 10 } }).setOrigin(.5);
    c.add([halo, label]); c.setData('halo', halo);
    return { container: c, regions: [courtyardBuildings(place.theme)[index], rectangle(x - label.width / 2, 780 - label.height / 2, label.width, label.height)], destination: gate?.place.id };
  });
}

export function lightCourtyard(scene: Phaser.Scene, light: WorldLight) {
  const background = scene.data.get('courtyard-background') as Phaser.GameObjects.Image | undefined;
  background?.setTexture(light === 'evening' ? 'courtyard-evening' : 'courtyard');
  const residents = (scene.data.get('resident-images') as Phaser.GameObjects.Image[] || []).filter(image => image.active);
  scene.data.set('resident-images', residents);
  for (const image of residents) image.setTexture(light === 'evening' ? 'walk-residents-evening' : 'walk-residents', image.frame.name);
}
