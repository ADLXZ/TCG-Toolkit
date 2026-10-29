// Card visuals shared by search, favorites and My cards: rarity badge, image with
// 3D hover tilt and original-image upgrade, and the large preview dialog.
import {t, getLanguage} from './i18n.js';
import {largeImageUrl} from './logic.js';
import {rarityTier, rarityDescription} from './rarities.js';
const $ = id => document.getElementById(id);
const el = (tag, className = '', text = '') => {const node = document.createElement(tag); node.className = className; node.textContent = text; return node;};
// Some cards (e.g. WS Climax) are printed landscape. Flag them once loaded so CSS
// turns them upright and they fill the same portrait frame as every other card.
export function markOrientation(image) {
  image.classList.toggle('landscape', image.naturalWidth > image.naturalHeight * 1.05);
}
export function rarityBadge(item) {
  if (!item.rarity) return '';
  const badge = el('span', `rarity-tag tier-${rarityTier(item.game, item.rarity)}`, item.rarity);
  badge.title = rarityDescription(item.game, item.rarity, getLanguage()) ?? t('rarity_value', {rarity: item.rarity});
  return badge;
}
export function cardImage(item, {noReferrer = false} = {}) {
  const frame = el('span', 'card-image');
  const fallback = el('span', 'image-fallback', t('no_image'));
  frame.append(fallback);
  if (!item.image_url) return frame;
  let url;
  try { url = new URL(item.image_url); } catch { return frame; }
  if (!['http:', 'https:'].includes(url.protocol)) return frame;
  const image = document.createElement('img');
  image.alt = item.name; image.loading = 'lazy'; image.decoding = 'async';
  if (noReferrer) image.referrerPolicy = 'no-referrer';
  image.addEventListener('load', () => { fallback.hidden = true; markOrientation(image); });
  image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; frame.classList.remove('zoomable'); frame.removeAttribute('role'); frame.removeAttribute('tabindex'); }, {once: true});
  image.src = url.href;
  const tilt = el('span', 'tilt'); tilt.append(image, el('span', 'glare'));
  frame.append(tilt);
  if (canTilt.matches) attachTilt(frame, tilt, image, largeImageUrl(url.href));
  if (largeImageUrl(url.href)) {
    frame.classList.add('zoomable'); frame.tabIndex = 0; frame.setAttribute('role', 'button');
    frame.setAttribute('aria-label', t('image_preview', {name: item.name})); frame.title = t('image_preview', {name: item.name});
    // Buttons inside the frame (the grid favorite star) keep their own action.
    frame.addEventListener('click', event => { if (!event.target.closest('button')) openPreview(item, url.href); });
    frame.addEventListener('keydown', event => {
      if (event.target === frame && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openPreview(item, url.href); }
    });
  }
  return frame;
}
// Only for a real mouse, and never when the system asks for reduced motion.
const canTilt = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
const TILT_DEGREES = 12;
// The tilt scales the card up, so the first hover fetches the original image and
// swaps it in only once fully decoded; on failure the thumbnail simply stays.
function upgradeImage(image, large) {
  const full = new Image();
  full.src = large;
  full.decode().then(() => { if (image.isConnected && !image.hidden) image.src = large; }, () => {});
}
function attachTilt(frame, tilt, image, large) {
  let frameRequest = 0, pointer = null, upgraded = !large;
  const apply = () => {
    frameRequest = 0;
    const box = tilt.getBoundingClientRect();
    const x = Math.min(Math.max((pointer.x - box.left) / box.width, 0), 1);
    const y = Math.min(Math.max((pointer.y - box.top) / box.height, 0), 1);
    tilt.style.setProperty('--ry', `${(x - .5) * 2 * TILT_DEGREES}deg`);
    tilt.style.setProperty('--rx', `${(.5 - y) * 2 * TILT_DEGREES}deg`);
    tilt.style.setProperty('--mx', `${x * 100}%`);
    tilt.style.setProperty('--my', `${y * 100}%`);
  };
  frame.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || event.target.closest('button')) return;
    pointer = {x: event.clientX, y: event.clientY};
    tilt.classList.add('active');
    if (!upgraded) { upgraded = true; upgradeImage(image, large); }
    frameRequest ||= requestAnimationFrame(apply);
  });
  frame.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frameRequest); frameRequest = 0;
    tilt.classList.remove('active');
    for (const name of ['--rx', '--ry', '--mx', '--my']) tilt.style.removeProperty(name);
  });
}
let previewRequest = 0;
export function openPreview(item, thumbnail) {
  const image = $('preview-image'), current = ++previewRequest;
  // Show the thumbnail at once, then swap in the full image when it has loaded.
  image.src = thumbnail; image.alt = item.name;
  $('preview-name').textContent = item.name; $('preview-number').textContent = item.card_number;
  $('image-dialog').classList.add('loading');
  const full = new Image();
  full.onload = () => { if (current === previewRequest) { image.src = full.src; $('image-dialog').classList.remove('loading'); } };
  full.onerror = () => { if (current === previewRequest) $('image-dialog').classList.remove('loading'); };
  full.src = largeImageUrl(thumbnail);
  $('image-dialog').showModal();
}
$('preview-close').addEventListener('click', () => $('image-dialog').close());
// A click on the backdrop lands on the dialog element itself.
$('image-dialog').addEventListener('click', event => { if (event.target === $('image-dialog')) $('image-dialog').close(); });
$('image-dialog').addEventListener('close', () => { previewRequest++; $('preview-image').removeAttribute('src'); });
