// Shared request boundary: stale responses cannot restore a previous user's UI.
export function createAuthenticatedRequest(onExpired, request = fetch) {
  let generation = 0;
  return {
    invalidate() { generation++; },
    async fetch(url, options) {
      const started = generation;
      const response = await request(url, options);
      if (started !== generation) throw new DOMException('Stale session', 'AbortError');
      if (response.status === 401) {
        generation++;
        onExpired();
        throw new DOMException('Session expired', 'AbortError');
      }
      return response;
    }
  };
}
