import { h } from './dom';
import { initials } from './format';
import type { Author } from '../types';

export function avatarEl(a: Author, cls = 'av'): HTMLElement {
  const box = h('span', { class: cls }, initials(a.name));
  if (a.avatar) {
    const img = h('img', { src: a.avatar, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
    img.addEventListener('load', () => { box.textContent = ''; box.append(img); }, { once: true });
  }
  return box;
}
