import { useEffect } from 'react';

/**
 * Global New-Tab Event Listener Hook
 * Intercepts clicks on any DOM element (or child of an element) that has:
 *   data-open-new-tab="true"
 *   data-url="/path" (or "?tab=...")
 *
 * Runs synchronously within the user-interaction callstack to guarantee
 * compatibility with standard browser pop-up blocker security rules.
 */
export function useGlobalNewTabLinks() {
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      // Find matching target element or closest matching ancestor
      const targetElement = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-open-new-tab="true"]'
      );

      if (!targetElement) return;

      const destinationUrl = targetElement.getAttribute('data-url');
      if (!destinationUrl) return;

      // Prevent standard in-page navigation or form submissions if nested
      event.preventDefault();
      event.stopPropagation();

      // Open in a new tab securely with noopener,noreferrer
      window.open(destinationUrl, '_blank', 'noopener,noreferrer');
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const targetElement = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-open-new-tab="true"]'
      );

      if (!targetElement) return;

      // Avoid triggering when user is typing inside an input or textarea
      const tag = (event.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const destinationUrl = targetElement.getAttribute('data-url');
      if (!destinationUrl) return;

      event.preventDefault();
      event.stopPropagation();

      window.open(destinationUrl, '_blank', 'noopener,noreferrer');
    };

    document.addEventListener('click', handleGlobalClick, true);
    document.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
      document.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, []);
}

/**
 * Helper utility to build a direct new-tab route URL for tabs or paths
 */
export function getTabUrl(tab: string): string {
  const currentSearch = new URLSearchParams(window.location.search);
  currentSearch.set('tab', tab);
  return `${window.location.pathname}?${currentSearch.toString()}`;
}
