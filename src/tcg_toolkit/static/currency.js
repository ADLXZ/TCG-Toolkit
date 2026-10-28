export async function fetchRate(target, request = fetch, onFetched = () => {}) {
  if (target === 'JPY') return 1;
  const response = await request(`/api/currency/convert?${new URLSearchParams({to: target, amount: 1})}`);
  const data = await response.json();
  if (!response.ok || data.from !== 'JPY' || data.to !== target || data.amount !== 1
      || typeof data.result !== 'number' || !Number.isFinite(data.result) || data.result <= 0) {
    throw new Error('currency_unavailable');
  }
  onFetched(data.fetched_at);
  return data.result;
}

export function formatPrice(jpy, currency, rate, language) {
  return new Intl.NumberFormat(language, {
    style: 'currency', currency, currencyDisplay: 'code',
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(jpy * rate);
}
