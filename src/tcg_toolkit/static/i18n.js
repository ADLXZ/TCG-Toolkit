import {messages} from './locales.js';

export function resolveLanguage(saved, browserLanguage = 'en') {
  if (Object.hasOwn(messages, saved)) return saved;
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

let language = resolveLanguage(localStorage.getItem('language'), navigator.language);
export const getLanguage = () => language;
export function setLanguage(value) {
  language = Object.hasOwn(messages, value) ? value : 'en';
  localStorage.setItem('language', language);
}
export function t(key, parameters = {}) {
  const template = messages[language][key] ?? messages.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => parameters[name] ?? match);
}
export function applyLanguage(root) {
  root.documentElement.lang = language;
  root.querySelectorAll('[data-i18n]').forEach(node => {node.textContent = t(node.dataset.i18n);});
  for (const attribute of ['aria-label', 'placeholder', 'title']) {
    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach(node => {
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)));
    });
  }
}
