/**
 * Returns an inline script string that prevents flash of wrong theme (FOWT).
 * This runs synchronously in <head> before any body content renders.
 */
export function getThemeScript(): string {
  return `
    (function() {
      try {
        var stored = localStorage.getItem('octavious-theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = stored === 'light' ? 'light'
                  : stored === 'dark' ? 'dark'
                  : prefersDark ? 'dark' : 'light';
        document.documentElement.classList.add(theme);
      } catch (e) {
        document.documentElement.classList.add('dark');
      }
    })();
  `
}
