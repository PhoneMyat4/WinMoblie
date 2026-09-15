/**
 * Global Image Compression Utility
 * Resizes and compresses image Files/Blobs using HTML5 Canvas
 * into optimized JPEG Base64 data URLs before storage in local state or database.
 * Prevents storage quota overflow, speeds up network sync, and protects system performance.
 */

export interface ImageCompressionOptions {
  /**
   * Maximum allowed width or height in pixels.
   * Default: 1280px for general uploads, 1600px for OCR / high-detail scans.
   */
  maxDimension?: number;
  /**
   * JPEG compression quality ratio between 0.1 and 1.0.
   * Default: 0.8 (optimal balance between visual clarity and file footprint).
   */
  quality?: number;
  /**
   * Target MIME type. Default is 'image/jpeg', or 'image/png' when transparency is preserved.
   */
  mimeType?: string;
  /**
   * Whether to preserve alpha transparency (forces output as image/png without dark background).
   */
  preserveTransparency?: boolean;
}

export interface CompressedImageResult {
  base64: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
}

/**
 * Core image compression function utilizing HTML5 Canvas.
 * Supports File, Blob, or existing data URL strings.
 */
export async function compressImage(
  fileOrBlobOrDataUrl: Blob | File | string,
  options: ImageCompressionOptions = {}
): Promise<CompressedImageResult> {
  const maxDimension = options.maxDimension ?? 1280;
  const quality = options.quality ?? 0.8;

  // Detect if input is a PNG or if transparency preservation is requested
  const isPngInput =
    (typeof fileOrBlobOrDataUrl !== 'string' && fileOrBlobOrDataUrl.type === 'image/png') ||
    (typeof fileOrBlobOrDataUrl === 'string' && fileOrBlobOrDataUrl.startsWith('data:image/png'));

  const mimeType =
    options.mimeType ??
    (options.preserveTransparency || isPngInput ? 'image/png' : 'image/jpeg');

  // If already an SVG data URL, preserve vector quality without canvas rasterization
  if (typeof fileOrBlobOrDataUrl === 'string' && fileOrBlobOrDataUrl.startsWith('data:image/svg')) {
    return {
      base64: fileOrBlobOrDataUrl,
      mimeType: 'image/svg+xml',
      originalSize: fileOrBlobOrDataUrl.length,
      compressedSize: fileOrBlobOrDataUrl.length,
    };
  }

  return new Promise((resolve, reject) => {
    const processImageSource = (srcUrl: string, originalSizeBytes: number) => {
      const img = new Image();
      img.onerror = () => {
        reject(new Error('Failed to load image element for canvas compression.'));
      };
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          return reject(new Error('Invalid image dimensions detected.'));
        }

        // Maintain aspect ratio while constraining to maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas 2D context unavailable.'));
        }

        // Ensure canvas is completely clear to preserve alpha transparency
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Smooth image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const base64 = canvas.toDataURL(mimeType, quality);
        const compressedSize = Math.round((base64.length * 3) / 4);

        resolve({
          base64,
          mimeType,
          originalSize: originalSizeBytes,
          compressedSize,
        });
      };

      img.src = srcUrl;
    };

    if (typeof fileOrBlobOrDataUrl === 'string') {
      const approxBytes = Math.round((fileOrBlobOrDataUrl.length * 3) / 4);
      processImageSource(fileOrBlobOrDataUrl, approxBytes);
    } else {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file from disk.'));
      reader.onload = (e) => {
        const resultUrl = e.target?.result as string;
        processImageSource(resultUrl, fileOrBlobOrDataUrl.size);
      };
      reader.readAsDataURL(fileOrBlobOrDataUrl);
    }
  });
}

/**
 * Convenience drop-in helper that returns the base64 string directly.
 */
export async function compressImageToBase64(
  fileOrBlobOrDataUrl: Blob | File | string,
  options: ImageCompressionOptions = {}
): Promise<string> {
  const result = await compressImage(fileOrBlobOrDataUrl, options);
  return result.base64;
}

/**
 * Backward-compatible helper for OCR scanners and high-resolution spec readers
 */
export async function compressImageForOcr(
  fileOrBlob: Blob | File,
  maxDimension = 1600,
  quality = 0.85
): Promise<CompressedImageResult> {
  return compressImage(fileOrBlob, { maxDimension, quality });
}

export interface ProcessLogoOptions {
  maxDimension?: number;
  scale?: number; // 0.2 to 3.0
  offsetX?: number; // px shift
  offsetY?: number; // px shift
  targetWidth?: number;
  targetHeight?: number;
  backgroundColor?: 'transparent' | 'white' | string;
}

/**
 * Dedicated logo image processor that STRICTLY outputs PNG format (`image/png`),
 * preserving complete alpha transparency without generating an unwanted background.
 */
export async function processLogoImage(
  fileOrBlobOrDataUrl: Blob | File | string,
  options: ProcessLogoOptions = {}
): Promise<string> {
  const maxDimension = options.maxDimension ?? 600;
  const scale = options.scale ?? 1.0;
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  const backgroundColor = options.backgroundColor ?? 'transparent';

  return new Promise((resolve, reject) => {
    const handleSrc = (srcUrl: string) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load logo image.'));
      img.onload = () => {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        let canvasWidth = naturalWidth;
        let canvasHeight = naturalHeight;

        if (options.targetWidth && options.targetHeight) {
          canvasWidth = options.targetWidth;
          canvasHeight = options.targetHeight;
        } else if (canvasWidth > maxDimension || canvasHeight > maxDimension) {
          if (canvasWidth > canvasHeight) {
            canvasHeight = Math.round((canvasHeight * maxDimension) / canvasWidth);
            canvasWidth = maxDimension;
          } else {
            canvasWidth = Math.round((canvasWidth * maxDimension) / canvasHeight);
            canvasHeight = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, canvasWidth);
        canvas.height = Math.max(1, canvasHeight);

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D context unavailable'));

        // Always clear transparent background completely
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (backgroundColor && backgroundColor !== 'transparent') {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Calculate scaled dimensions centered
        const drawWidth = canvasWidth * scale;
        const drawHeight = canvasHeight * scale;
        const drawX = (canvasWidth - drawWidth) / 2 + offsetX;
        const drawY = (canvasHeight - drawHeight) / 2 + offsetY;

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // ALWAYS export as PNG to ensure full alpha transparency is preserved
        const pngBase64 = canvas.toDataURL('image/png');
        resolve(pngBase64);
      };
      img.src = srcUrl;
    };

    if (typeof fileOrBlobOrDataUrl === 'string') {
      handleSrc(fileOrBlobOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read logo file.'));
      reader.onload = (e) => handleSrc(e.target?.result as string);
      reader.readAsDataURL(fileOrBlobOrDataUrl);
    }
  });
}
