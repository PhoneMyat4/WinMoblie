import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Camera, 
  Image as ImageIcon, 
  Trash2, 
  Link as LinkIcon, 
  Sparkles, 
  Check, 
  X, 
  RefreshCw,
  Eye
} from 'lucide-react';
import { compressImageToBase64 } from '../../utils/imageCompression';

interface ProductPhotoUploaderProps {
  currentImageUrl?: string;
  onImageChange: (imageUrl: string | undefined) => void;
  productName?: string;
  category?: string;
  brand?: string;
}

// Preset photo catalogs for mobile shop items
const PHOTO_PRESETS = [
  {
    name: 'iPhone (Dark)',
    category: 'new_phones',
    url: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'iPhone (Silver/White)',
    category: 'new_phones',
    url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'Samsung Galaxy',
    category: 'new_phones',
    url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'Xiaomi / Android',
    category: 'new_phones',
    url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'Smart Watch',
    category: 'gadgets',
    url: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'Wireless Earbuds',
    category: 'gadgets',
    url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'Fast Charger & Cable',
    category: 'accessories',
    url: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'Protective Case',
    category: 'accessories',
    url: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&auto=format&fit=crop&q=80'
  },
  {
    name: 'Power Bank',
    category: 'accessories',
    url: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400&auto=format&fit=crop&q=80'
  }
];

export const ProductPhotoUploader: React.FC<ProductPhotoUploaderProps> = ({
  currentImageUrl,
  onImageChange,
  productName = 'Product',
  category,
  brand,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Compress & optimize image file via centralized imageCompression utility (max 600x600 JPEG at 0.85)
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const compressedDataUrl = await compressImageToBase64(file, { maxDimension: 600, quality: 0.85 });
      onImageChange(compressedDataUrl);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to process and compress image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) {
      setErrorMessage('Please enter a valid image URL.');
      return;
    }
    onImageChange(urlInput.trim());
    setUrlInput('');
    setErrorMessage(null);
  };

  const handleRemovePhoto = () => {
    onImageChange(undefined);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div id="product-photo-uploader-container" className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-4 space-y-3">
      
      {/* Hidden File & Camera Inputs */}
      <input
        ref={fileInputRef}
        id="product-photo-file-input"
        type="file"
        accept="image/png, image/jpeg, image/webp, image/gif, image/avif"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        id="product-photo-camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header & Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <ImageIcon className="w-4 h-4 text-indigo-600" />
          <span>Product Photo / Image</span>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              activeTab === 'upload' ? 'bg-white text-indigo-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload / Camera
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              activeTab === 'presets' ? 'bg-white text-indigo-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              activeTab === 'url' ? 'bg-white text-indigo-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Web URL
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between animate-in fade-in">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Area: Preview (if photo present) OR Upload Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        
        {/* Left: Thumbnail Preview Frame */}
        <div className="sm:col-span-4 flex flex-col items-center">
          <div 
            className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 overflow-hidden flex items-center justify-center bg-white shadow-xs group transition-all ${
              currentImageUrl 
                ? 'border-indigo-300 ring-2 ring-indigo-100' 
                : 'border-dashed border-slate-300 bg-slate-100/60'
            }`}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center gap-1.5 text-indigo-600">
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span className="text-[10px] font-bold">Optimizing...</span>
              </div>
            ) : currentImageUrl ? (
              <>
                <img
                  src={currentImageUrl}
                  alt={productName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onError={() => setErrorMessage('Unable to load image from given source.')}
                />
                
                {/* Overlay Quick Actions */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-2xs">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white transition-all shadow-sm"
                    title="View Full Size Image"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-all shadow-sm"
                    title="Remove Photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                <ImageIcon className="w-7 h-7 text-slate-300 mb-1" />
                <span className="text-[10px] font-semibold leading-tight">No Photo</span>
              </div>
            )}
          </div>

          {currentImageUrl && (
            <div className="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                Change
              </button>
              <span className="text-slate-300 text-xs">•</span>
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {/* Right: Active Tab Control Panel */}
        <div className="sm:col-span-8">
          
          {/* Tab 1: Upload File & Mobile Camera */}
          {activeTab === 'upload' && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-3.5 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/70'
                  : 'border-slate-300 hover:border-indigo-400 bg-white'
              }`}
            >
              <Upload className="w-5 h-5 text-indigo-600 mb-1" />
              <p className="text-xs font-bold text-slate-800">
                Drag & drop product photo, or choose source
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                PNG, JPG, WEBP • Auto-compressed for fast loading
              </p>

              <div className="flex items-center gap-2 mt-2.5 flex-wrap justify-center">
                <button
                  type="button"
                  id="browse-product-photo-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Browse File</span>
                </button>

                <button
                  type="button"
                  id="take-product-camera-btn"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Take Camera Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Curated Presets */}
          {activeTab === 'presets' && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-600 font-medium flex items-center justify-between">
                <span>Select a high-quality product preset:</span>
                <span className="text-[10px] text-indigo-600 font-bold">{PHOTO_PRESETS.length} Presets</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                {PHOTO_PRESETS.map((preset) => {
                  const isSelected = currentImageUrl === preset.url;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => onImageChange(preset.url)}
                      className={`p-1.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.name}
                        className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200"
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-800 truncate leading-tight group-hover:text-indigo-600">
                          {preset.name}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-indigo-600 ml-auto shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: Direct Web Image URL */}
          {activeTab === 'url' && (
            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
              <label htmlFor="product-photo-url-input" className="block text-[11px] font-bold text-slate-700">
                Paste Direct Web Image URL (HTTPS)
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="product-photo-url-input"
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyUrl();
                      }
                    }}
                    placeholder="https://example.com/phone-image.jpg"
                    className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Lightbox / Full Size Modal */}
      {isPreviewOpen && currentImageUrl && (
        <div
          id="product-photo-lightbox-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-modal-backdrop"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div className="relative max-w-lg w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 p-2 animate-modal-content">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={currentImageUrl}
              alt={productName}
              className="w-full max-h-[70vh] object-contain rounded-xl"
            />
            <div className="p-3 text-center text-white">
              <p className="font-bold text-sm">{productName}</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
