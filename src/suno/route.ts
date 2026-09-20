/**
 * True for Suno's Create page. The content script is injected on every
 * suno.com page (Suno is an SPA, so a client-side navigation from another page
 * never re-injects it) and uses this to decide when to run.
 */
export function isCreatePath(pathname: string): boolean {
  return /^\/create(?:\/|$)/.test(pathname);
}

/**
 * Whether a URL reported by a location-change event is a real page navigation.
 * The Navigation API also reports downloads (the backup export's `blob:` link),
 * which must not be mistaken for leaving /create.
 */
export function isPageNavigation(url: URL): boolean {
  return url.protocol === 'https:' || url.protocol === 'http:';
}
