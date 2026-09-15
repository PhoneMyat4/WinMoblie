import { StorageService } from './storage';
import { compressImageForOcr, compressImage, compressImageToBase64 } from './imageCompression';
import { authenticatedFetch } from './apiClient';

export { compressImageForOcr, compressImage, compressImageToBase64 };

export interface ExtractedBoxSpecs {
  brand: string;
  model: string;
  color: string;
  ram: string;
  rom: string;
  imei1: string;
  imei2: string;
  barcode: string;
  serialNumber: string;
  confidence: 'high' | 'medium' | 'low' | 'unreadable' | string;
  detectionNotes: string;
}

export interface BoxExtractionResponse {
  success: boolean;
  data?: ExtractedBoxSpecs;
  error?: string;
}

/**
 * Captures the current frame from an active HTMLVideoElement, draws to canvas, and compresses
 */
export const captureVideoFrame = async (
  video: HTMLVideoElement,
  maxDimension = 1600,
  quality = 0.88
): Promise<{ base64: string; mimeType: string; compressedSize: number }> => {
  const vidW = video.videoWidth || video.clientWidth || 640;
  const vidH = video.videoHeight || video.clientHeight || 480;

  if (vidW <= 0 || vidH <= 0) {
    throw new Error('Camera video stream is not yet displaying video frames. Please wait a second and try again.');
  }

  let width = vidW;
  let height = vidH;

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
    throw new Error('Canvas context could not be created for frame capture.');
  }

  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch (drawErr: any) {
    throw new Error(`Failed to capture video snapshot: ${drawErr?.message || 'Video frame not accessible'}`);
  }

  const base64 = canvas.toDataURL('image/jpeg', quality);
  const compressedSize = Math.round((base64.length * 3) / 4);

  return {
    base64,
    mimeType: 'image/jpeg',
    compressedSize,
  };
};

/**
 * Sends compressed base64 image data to the backend Gemini Multimodal API endpoint
 */
export const requestBoxSpecsExtraction = async (
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<ExtractedBoxSpecs> => {
  const response = await authenticatedFetch('/api/extract-box-specs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64,
      mimeType,
    }),
  });

  const json: BoxExtractionResponse = await response.json().catch(() => ({
    success: false,
    error: 'Failed to communicate with AI server endpoint.',
  }));

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error || `Server extraction error (HTTP ${response.status})`);
  }

  // Ensure client-side safety: normalize and translate any residual Chinese color or brand names
  const specs = json.data;
  if (specs.color) {
    specs.color = normalizeChineseColor(specs.color);
  }

  return specs;
};

/**
 * Checks if a string contains Chinese/CJK characters
 */
export const hasChineseCharacters = (str?: string): boolean => {
  if (!str) return false;
  return /[\u4e00-\u9fa5\u3040-\u30ff]/.test(str);
};

/**
 * Comprehensive mapping for phone packaging color finishes from Chinese to standard English
 */
export const CHINESE_TO_ENGLISH_COLOR_MAP: Record<string, string> = {
  // Titanium / Premium metals
  '原色钛金属': 'Natural Titanium',
  '原色钛': 'Natural Titanium',
  '钛原色': 'Natural Titanium',
  '黑色钛金属': 'Black Titanium',
  '钛黑色': 'Titanium Black',
  '钛黑': 'Titanium Black',
  '白色钛金属': 'White Titanium',
  '钛白色': 'Titanium White',
  '钛白': 'Titanium White',
  '蓝色钛金属': 'Blue Titanium',
  '钛蓝色': 'Titanium Blue',
  '钛蓝': 'Titanium Blue',
  '沙漠钛金属': 'Desert Titanium',
  '沙漠金': 'Desert Titanium / Sand Gold',
  '沙漠钛': 'Desert Titanium',
  '钛灰色': 'Titanium Gray',
  '钛灰': 'Titanium Gray',
  '钛空银': 'Space Silver',
  '钛银': 'Titanium Silver',

  // Black & Charcoal
  '暗夜黑': 'Midnight Black',
  '子夜黑': 'Midnight Black',
  '幻夜黑': 'Phantom Black',
  '幻影黑': 'Phantom Black',
  '曜石黑': 'Obsidian Black',
  '曜黑': 'Obsidian Black',
  '玄黑': 'Space Black',
  '碳黑': 'Carbon Black',
  '深空黑': 'Space Black',
  '深空黑色': 'Space Black',
  '亮黑': 'Jet Black',
  '亮黑色': 'Jet Black',
  '墨黑': 'Ink Black',
  '石墨色': 'Graphite',
  '石墨黑': 'Graphite Black',
  '纯黑': 'Pure Black',
  '黑色': 'Black',
  '黑': 'Black',

  // White & Light Silver
  '星芒白': 'Starlight White',
  '星光白': 'Starlight White',
  '星光色': 'Starlight',
  '珍珠白': 'Pearl White',
  '冰川白': 'Glacier White',
  '雪山白': 'Snow Mountain White',
  '陶瓷白': 'Ceramic White',
  '云朵白': 'Cloud White',
  '羽砂白': 'Feather Sand White',
  '纯白': 'Pure White',
  '白色': 'White',
  '白': 'White',

  // Gray & Silver
  '深空灰': 'Space Gray',
  '深空灰色': 'Space Gray',
  '星空灰': 'Starry Gray',
  '太空银': 'Space Silver',
  '亮银': 'Bright Silver',
  '流光银': 'Liquid Silver',
  '银色': 'Silver',
  '灰色': 'Gray',
  '银': 'Silver',
  '灰': 'Gray',

  // Blue tones
  '远峰蓝': 'Sierra Blue',
  '海湾蓝': 'Bay Blue',
  '海蓝色': 'Ocean Blue',
  '天青蓝': 'Sky Blue',
  '天空蓝': 'Sky Blue',
  '冰川蓝': 'Glacier Blue',
  '冰霜蓝': 'Frost Blue',
  '暮光蓝': 'Twilight Blue',
  '深海蓝': 'Deep Sea Blue',
  '宝石蓝': 'Sapphire Blue',
  '海洋蓝': 'Ocean Blue',
  '幻影蓝': 'Phantom Blue',
  '浅蓝色': 'Light Blue',
  '浅蓝': 'Light Blue',
  '蓝色': 'Blue',
  '深蓝': 'Dark Blue',
  '蓝': 'Blue',

  // Purple & Violet tones
  '极光紫': 'Aurora Purple',
  '暮光紫': 'Twilight Purple',
  '暗夜紫': 'Midnight Purple',
  '深紫色': 'Deep Purple',
  '深紫': 'Deep Purple',
  '暗紫': 'Deep Purple',
  '香芋紫': 'Taro Purple',
  '罗兰紫': 'Lavender Purple',
  '紫罗兰': 'Violet Purple',
  '幻影紫': 'Phantom Purple',
  '魅夜紫': 'Phantom Purple',
  '烟雨紫': 'Misty Purple',
  '紫色': 'Purple',
  '紫': 'Purple',

  // Green & Teal tones
  '苍岭绿': 'Alpine Green',
  '森林绿': 'Forest Green',
  '橄榄绿': 'Olive Green',
  '翡翠绿': 'Emerald Green',
  '松岭绿': 'Pine Green',
  '薄荷绿': 'Mint Green',
  '草木绿': 'Grass Green',
  '墨绿': 'Dark Green',
  '青色': 'Cyan Green',
  '青绿': 'Teal Green',
  '浅绿': 'Light Green',
  '绿色': 'Green',
  '绿': 'Green',

  // Gold & Champagne
  '流光金': 'Champagne Gold',
  '土豪金': 'Gold',
  '香槟金': 'Champagne Gold',
  '琥珀金': 'Amber Gold',
  '金色': 'Gold',
  '金': 'Gold',
  '玫瑰金': 'Rose Gold',
  '玫瑰金色': 'Rose Gold',

  // Pink & Coral
  '樱花粉': 'Sakura Pink',
  '玫瑰粉': 'Rose Pink',
  '珊瑚粉': 'Coral Pink',
  '粉色': 'Pink',
  '粉': 'Pink',

  // Orange & Yellow
  '日落橙': 'Sunset Orange',
  '活力橙': 'Dynamic Orange',
  '珊瑚橙': 'Coral Orange',
  '橙色': 'Orange',
  '橙': 'Orange',
  '柠檬黄': 'Lemon Yellow',
  '明黄色': 'Bright Yellow',
  '黄色': 'Yellow',
  '黄': 'Yellow',

  // Red
  '中国红': 'Product Red',
  '烈焰红': 'Flame Red',
  '酒红': 'Burgundy Red',
  '红色': 'Red',
  '红': 'Red',
};

/**
 * Normalizes any Chinese smartphone packaging color into its clean English moniker
 */
export const normalizeChineseColor = (rawColor?: string): string => {
  if (!rawColor) return '';
  let c = String(rawColor).trim();

  // Strip common label prefixes: "颜色: ", "颜色：", "Color: "
  c = c.replace(/^(颜色|顏色|COLOR|Color|Col)[\s:：]*/i, '').trim();

  // Exact match
  if (CHINESE_TO_ENGLISH_COLOR_MAP[c]) {
    return CHINESE_TO_ENGLISH_COLOR_MAP[c];
  }

  // Multi-character match
  for (const [zh, en] of Object.entries(CHINESE_TO_ENGLISH_COLOR_MAP)) {
    if (c.includes(zh) && zh.length >= 2) {
      return en;
    }
  }

  // Single-character match if Chinese characters exist
  if (hasChineseCharacters(c)) {
    for (const [zh, en] of Object.entries(CHINESE_TO_ENGLISH_COLOR_MAP)) {
      if (c.includes(zh)) {
        return en;
      }
    }
  }

  return c;
};

/**
 * Common popular smartphone color presets for quick selection
 */
export const POPULAR_PHONE_COLORS = [
  'Midnight Black',
  'Obsidian Black',
  'Natural Titanium',
  'Desert Titanium',
  'Aurora Purple',
  'Glacier Blue',
  'Sierra Blue',
  'Starlight White',
  'Space Gray',
  'Space Silver',
  'Forest Green',
  'Alpine Green',
  'Rose Gold',
  'Sunset Orange',
];

