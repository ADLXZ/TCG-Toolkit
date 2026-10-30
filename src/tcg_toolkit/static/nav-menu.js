// Portrait phones: each sidebar group ("YuYu-Tei", "Local") collapses into a dropdown.
// Wider layouts show the same groups as plain lists; there the toggles are hidden by CSS.
export const PORTRAIT_MENUS = '(max-width: 700px) and (orientation: portrait)';
const groups = root => [...root.querySelectorAll('#app-nav .nav-group')];

// The toggle names the page you are on when it belongs to that group.
export function syncNavMenus(root = document) {
  for (const group of groups(root)) {
    const current = group.querySelector('.nav-group-items a[aria-current]');
    group.classList.toggle('has-current', Boolean(current));
    group.querySelector('.nav-group-current').textContent = current?.querySelector('span')?.textContent ?? '';
  }
}
function setOpen(group, open) {
  group.classList.toggle('open', open);
  group.querySelector('.nav-group-toggle').setAttribute('aria-expanded', String(open));
}
export function closeNavMenus(root = document, except = null) {
  for (const group of groups(root)) if (group !== except) setOpen(group, false);
}
export function bindNavMenus(root = document, win = globalThis) {
  for (const group of groups(root)) {
    group.querySelector('.nav-group-toggle').addEventListener('click', () => {
      const open = !group.classList.contains('open');
      closeNavMenus(root, group);  // only one menu at a time
      setOpen(group, open);
    });
    group.querySelector('.nav-group-items').addEventListener('click', event => {
      if (event.target.closest('a')) closeNavMenus(root);
    });
  }
  root.addEventListener('pointerdown', event => { if (!event.target.closest?.('#app-nav .nav-group')) closeNavMenus(root); });
  root.addEventListener('keydown', event => {
    const open = root.querySelector('#app-nav .nav-group.open');
    if (event.key !== 'Escape' || !open) return;
    closeNavMenus(root);
    open.querySelector('.nav-group-toggle').focus();
  });
  win.addEventListener?.('hashchange', () => closeNavMenus(root));
  // Rotating to landscape (or widening) switches back to plain lists.
  win.matchMedia?.(PORTRAIT_MENUS).addEventListener?.('change', () => closeNavMenus(root));
}
