import {t,tr} from './i18n';
import Phaser from 'phaser';
import type { Place } from '../shared/worlds';
import type { HitRegion } from './world-input';
import { rectangle } from './world-input';
import type { WorldLight } from './world-light';
import { worldEmblem } from './world-emblem';

const frames = ['garden', 'japan', 'cinema', 'game', 'cave', 'fantasy'] as const;
type ArtFrame = typeof frames[number];
type IllustratedNode = { image: Phaser.GameObjects.Image; key: string; frame?: string };
const fontFamily = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
function addFrames(texture: Phaser.Textures.Texture) {
  const source = texture.getSourceImage() as HTMLImageElement;
  const w = source.width / 3, h = source.height / 2;
  for (const [i, name] of frames.entries()) if (!texture.has(name)) texture.add(name, 0, i % 3 * w, Math.floor(i / 3) * h, w, h);
}
export function prepareIllustrations(scene: Phaser.Scene) {
  scene.data.set('art-sprites', []);
  if (scene.textures.exists('world-buildings')) addFrames(scene.textures.get('world-buildings'));
  // Canvas renderer does not support image tints. Prepare the evening wash once,
  // preserve source alpha, and reuse the textures instead of filtering every frame.
  for (const key of ['world-buildings', 'world-ground', 'world-station']) {
    if (!scene.textures.exists(key) || scene.textures.exists(key + '-evening')) continue;
    const source = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const texture = scene.textures.createCanvas(key + '-evening', source.width, source.height);
    if (!texture) continue;
    const ctx = texture.context;
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = key === 'world-ground' ? 'rgba(73, 66, 119, .38)' : 'rgba(66, 56, 108, .23)';
    ctx.fillRect(0, 0, source.width, source.height);
    ctx.globalCompositeOperation = 'source-over';
    texture.refresh();
    if (key === 'world-buildings') addFrames(texture);
  }
}
function illustratedImage(scene: Phaser.Scene, x: number, y: number, key: string, frame?: string) {
  const image = scene.add.image(x, y, key, frame);
  const nodes = scene.data.get('art-sprites') as IllustratedNode[];
  nodes.push({ image, key, frame });
  return image;
}
const masks = new WeakMap<object, Map<string, { alpha: Uint8Array; w: number; h: number }>>();
function spriteMask(scene: Phaser.Scene, image: Phaser.GameObjects.Image, key: string, frame?: string): HitRegion {
  const texture = scene.textures.get(key), source = texture.getSourceImage() as HTMLImageElement, f = texture.get(frame);
  let cache = masks.get(source);
  if (!cache) { cache = new Map(); masks.set(source, cache); }
  const name = frame || '__BASE';
  let mask = cache.get(name);
  if (!mask) {
    const canvas = document.createElement('canvas'); canvas.width = f.cutWidth; canvas.height = f.cutHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    const pixels = ctx.getImageData(0, 0, f.cutWidth, f.cutHeight).data, alpha = new Uint8Array(f.cutWidth * f.cutHeight);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
    mask = { alpha, w: f.cutWidth, h: f.cutHeight }; cache.set(name, mask);
  }
  return { kind: 'mask', x: image.x - image.displayWidth * image.originX, y: image.y - image.displayHeight * image.originY, width: image.displayWidth, height: image.displayHeight, pixelWidth: mask.w, pixelHeight: mask.h, alpha: mask.alpha };
}
function frameFor(place: Place): ArtFrame {
  if (place.gate === 'cave') return 'cave';
  if (place.gate === 'castle') return place.theme === 'fantasy' ? 'fantasy' : 'game';
  if (place.theme === 'japan') return 'japan';
  if (place.theme === 'future') return 'cinema';
  return 'garden';
}
export function drawIllustratedBuilding(scene: Phaser.Scene, c: Phaser.GameObjects.Container, place: Place, back = false, guide = false): HitRegion[] | null {
  if (!scene.textures.exists('world-buildings')) return null;
  const key = place.theme === 'station' && scene.textures.exists('world-station') ? 'world-station' : 'world-buildings';
  const frame = key === 'world-station' ? undefined : frameFor(place), image = illustratedImage(scene, 0, 0, key, frame).setDisplaySize(360, 360).setOrigin(.5, .86);
  const shadow = scene.add.graphics().fillStyle(0x614e49, .12).fillEllipse(0, 10, 245, 62);
  const halo = scene.add.graphics().lineStyle(3, 0xf4d49e, .9).strokeEllipse(0, 12, 260, 76).setVisible(false);
  c.add([shadow, halo, image]); c.setData('halo', halo);
  const badge = scene.add.graphics().setPosition(-16, 26).setScale(.55);
  for (const item of worldEmblem(place)) {
    badge.fillStyle(Phaser.Display.Color.HexStringToColor(item.fill).color);
    if (item.kind === 'circle') badge.fillCircle(item.x, item.y, item.r);
    else if (item.kind === 'rect') badge.fillRoundedRect(item.x, item.y, item.width, item.height, 3);
    else badge.fillPoints(item.points.reduce<{ x: number; y: number }[]>((a, n, i) => { if (i % 2 === 0) a.push({ x: n, y: item.points[i + 1] }); return a; }, []), true);
  }
  const label = scene.add.text(0, 73, back ? '← '+place.title : guide ? tr('案内 · {title}',{title:place.title}) : place.title, { fontFamily, fontSize: '24px', fontStyle: 'bold', color: '#584b43', backgroundColor: '#fff7e9', padding: { x: 14, y: 10 }, align: 'center', wordWrap: { width: 210 } }).setOrigin(.5);
  c.add([badge, label]);
  return [spriteMask(scene, image, key, frame), rectangle(-label.width / 2, 73 - label.height / 2, label.width, label.height)];
}
function lamp(scene: Phaser.Scene, x: number, y: number) {
  const pole = scene.add.graphics().setDepth(y);
  pole.lineStyle(5, 0x615c55).lineBetween(x, y, x, y - 89);
  pole.lineStyle(3, 0x84725e).lineBetween(x - 12, y - 91, x + 12, y - 91);
  pole.fillStyle(0xf4d598).fillRoundedRect(x - 10, y - 90, 20, 28, 7);
  pole.lineStyle(2, 0x725a48).strokeRoundedRect(x - 10, y - 90, 20, 28, 7);
  const glow = scene.add.graphics().setDepth(y - 1);
  for (let i = 4; i > 0; i--) glow.fillStyle(0xffd39a, .025 * (5 - i)).fillEllipse(x, y + 4, i * 38, i * 17);
  glow.fillStyle(0xffe1a2, .18).fillCircle(x, y - 78, 24);
  (scene.data.get('art-glows') as Phaser.GameObjects.Graphics[]).push(glow);
}
export function drawIllustratedGround(scene: Phaser.Scene, coast = false) {
  if (!scene.textures.exists('world-ground')) return false;
  illustratedImage(scene, 1000, coast ? -145 : 0, 'world-ground').setOrigin(.5, 0).setDisplaySize(2200, coast ? 1545 : 1400).setDepth(-100);
  scene.data.set('art-glows', []);
  return true;
}
export function drawIllustratedPlace(scene: Phaser.Scene, place: Place) {
  drawIllustratedGround(scene, place.theme === 'station');
  const wash = scene.add.graphics().setDepth(-90);
  const tone = place.theme === 'future' ? 0x739baf : place.theme === 'fantasy' ? 0x9283a3 : place.theme === 'japan' ? 0xd8a591 : 0xb3bc98;
  if (place.theme !== 'station') wash.fillStyle(tone, .13).fillRect(0, 0, 2000, 1400);
  for (const [x, y] of [[270, 670], [1720, 700], [610, 1190], [1430, 1160]]) lamp(scene, x, y);
  if (place.theme === 'station' && scene.textures.exists('world-station')) {
    const hall = scene.add.container(1030, 590).setDepth(580).setSize(460, 370);
    const image = illustratedImage(scene, 0, 0, 'world-station').setDisplaySize(490, 440).setOrigin(.5, .86);
    const shadow = scene.add.graphics().fillStyle(0x624b43, .1).fillEllipse(0, 15, 440, 110);
    const label = scene.add.text(0, 65, t('不思議な駅 · 好きな世界へ'), { fontFamily, fontSize: '23px', color: '#554a40', backgroundColor: '#fff6e5', padding: { x: 18, y: 10 } }).setOrigin(.5);
    hall.add([shadow, image, label]);
    hall.setData('hitRegions', [spriteMask(scene, image, 'world-station'), rectangle(-label.width / 2, 65 - label.height / 2, label.width, label.height)]);
    return hall;
  }
  const plaque = scene.add.text(1040, 132, place.title, { fontFamily, fontSize: '28px', fontStyle: 'bold', color: '#625246', backgroundColor: '#fff7e9', padding: { x: 24, y: 13 } }).setOrigin(.5).setDepth(150);
  plaque.setAlpha(.95);
  // An actual place marker, not an implied resident or audience.
  const emblem = scene.add.graphics().setPosition(1040, 560).setDepth(-60).setAlpha(.28).setScale(2);
  for (const item of worldEmblem(place)) {
    emblem.fillStyle(Phaser.Display.Color.HexStringToColor(item.fill).color);
    if (item.kind === 'circle') emblem.fillCircle(item.x, item.y, item.r);
    else if (item.kind === 'rect') emblem.fillRoundedRect(item.x, item.y, item.width, item.height, 3);
    else emblem.fillPoints(item.points.reduce<{ x: number; y: number }[]>((a, n, i) => { if (i % 2 === 0) a.push({ x: n, y: item.points[i + 1] }); return a; }, []), true);
  }
  const venue = scene.add.container(1100, 540).setDepth(540).setSize(360, 360);
  venue.setData('hitRegions', drawIllustratedBuilding(scene, venue, place, false, true));
  return venue;
}
export function applyWorldLight(scene: Phaser.Scene, light: WorldLight) {
  for (const node of scene.data.get('art-sprites') as IllustratedNode[] || []) {
    const key = light === 'evening' && scene.textures.exists(node.key + '-evening') ? node.key + '-evening' : node.key;
    node.image.setTexture(key, node.frame);
  }
  for (const glow of scene.data.get('art-glows') as Phaser.GameObjects.Graphics[] || []) glow.setVisible(light === 'evening');
  scene.cameras.main.setBackgroundColor(light === 'evening' ? '#79738e' : '#e8d9b9');
}
