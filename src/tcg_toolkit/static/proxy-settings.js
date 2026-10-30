import {apiRequest, isLocalFrontend, setDirectSearch} from './api.js';
export function createProxySettings() {
  const panel = document.getElementById('proxy-settings'), toggle = document.getElementById('proxy-enabled');
  let generation = 0, enabled = true;
  // A switch button: aria-checked is both the visible state and what assistive tech announces.
  function show(value) { enabled = value; toggle.setAttribute('aria-checked', String(value)); }
  function clear() { generation++; panel.hidden = true; show(true); setDirectSearch(false); }
  toggle.addEventListener('click', () => {
    if (panel.hidden) return;
    show(!enabled); setDirectSearch(!enabled);
  });
  return {clear, async activate() {
    clear(); const current = generation;
    if (!isLocalFrontend()) return;
    try {
      const response = await apiRequest('/api/yuyutei/proxy-config');
      const data = response.ok ? await response.json() : null;
      if (current === generation && data?.available === true) panel.hidden = false;
    } catch { /* Capability unavailable: keep the switch hidden. */ }
  }};
}
