/**
 * Favicon Management Utility
 * Handles dynamic DOM favicon updates, format conversions, and canvas sizing for crisp tab display.
 */

export function updateDocumentFavicon(faviconUrl?: string): void {
  if (typeof document === 'undefined') return;

  const validUrl = faviconUrl && faviconUrl.trim() ? faviconUrl.trim() : '/vite.svg';

  // 1. Primary standard favicon link
  let iconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement;
  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    document.head.appendChild(iconLink);
  }
  iconLink.href = validUrl;

  // 2. Shortcut icon link for older browsers & bookmarks
  let shortcutLink = document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement;
  if (!shortcutLink) {
    shortcutLink = document.createElement('link');
    shortcutLink.rel = 'shortcut icon';
    document.head.appendChild(shortcutLink);
  }
  shortcutLink.href = validUrl;

  // 3. Apple touch icon for mobile home screens & Safari bookmarks
  let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
  if (!appleLink) {
    appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleLink);
  }
  appleLink.href = validUrl;
}

/**
 * Optimizes an uploaded image file into a square crisp favicon PNG (or passes SVG/ICO directly).
 * Resolves to a clean Data URI.
 */
export async function processFaviconImage(file: File): Promise<string> {
  // SVG files can be preserved directly as data URIs for vector sharpness
  if (file.type === 'image/svg+xml') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Raster images (PNG, JPG, WEBP, ICO) are loaded onto a 64x64 canvas for high-DPI crispness
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data'));
      img.onload = () => {
        const targetSize = 64; // High-DPI 64x64 canvas (scales crisply to 16px and 32px tabs)
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(e.target?.result as string);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Clear canvas with full alpha transparency
        ctx.clearRect(0, 0, targetSize, targetSize);

        // Aspect ratio fit centered inside target square
        const aspect = img.width / img.height;
        let drawWidth = targetSize;
        let drawHeight = targetSize;
        let offsetX = 0;
        let offsetY = 0;

        if (aspect > 1) {
          drawHeight = targetSize / aspect;
          offsetY = (targetSize - drawHeight) / 2;
        } else {
          drawWidth = targetSize * aspect;
          offsetX = (targetSize - drawWidth) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        resolve(canvas.toDataURL('image/png', 0.95));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
