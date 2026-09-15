import React, { useState } from 'react';
import { 
  Globe, 
  ThumbsUp, 
  MessageCircle, 
  Share2, 
  MoreHorizontal, 
  Store, 
  CheckCircle2, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X
} from 'lucide-react';
import { SocialMarketingMediaItem, ShopSettings } from '../../types';

interface FacebookPostPreviewProps {
  pageName: string;
  caption: string;
  selectedMedia: SocialMarketingMediaItem[];
  settings?: ShopSettings;
  isVerified?: boolean;
}

export const FacebookPostPreview: React.FC<FacebookPostPreviewProps> = ({
  pageName,
  caption,
  selectedMedia,
  settings,
  isVerified = true,
}) => {
  const [activePhotoModalIndex, setActivePhotoModalIndex] = useState<number | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(48);

  const displayPageName = pageName || settings?.shopName || 'Golden Star Mobile';
  const logoUrl = settings?.invoiceCustomization?.shopLogoUrl;

  const handleLikeToggle = () => {
    setIsLiked(!isLiked);
    setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
  };

  const visibleImages = selectedMedia.slice(0, 4);
  const extraCount = selectedMedia.length > 4 ? selectedMedia.length - 4 : 0;
  const FALLBACK_STUDIO_PHOTO = 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=1200&auto=format&fit=crop&q=80';

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    if (target.src !== FALLBACK_STUDIO_PHOTO) {
      target.src = FALLBACK_STUDIO_PHOTO;
    }
  };

  return (
    <div id="facebook-post-preview-card" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden max-w-xl mx-auto transition-all">
      {/* Facebook Feed Card Header */}
      <div className="p-3.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={displayPageName} 
              className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700" 
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
              <Store className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 hover:underline cursor-pointer">
                {displayPageName}
              </span>
              {isVerified && (
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>Just now</span>
              <span>•</span>
              <Globe className="w-3 h-3 text-slate-400" />
              <span>Public</span>
            </div>
          </div>
        </div>

        <button 
          type="button"
          aria-label="Post options"
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Post Caption Body */}
      <div className="px-4 py-3">
        {caption ? (
          <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed font-sans select-text">
            {caption}
          </p>
        ) : (
          <p className="text-sm italic text-slate-400 dark:text-slate-500">
            Ad copy text will appear here once generated in Step 3 or typed into the draft console...
          </p>
        )}
      </div>

      {/* Media Rendering Engine: Multi-Image Facebook Newsfeed Collage */}
      {selectedMedia.length > 0 ? (
        <div className="w-full bg-slate-950 border-t border-b border-slate-100 dark:border-slate-800">
          {/* Layout for exactly 1 photo */}
          {selectedMedia.length === 1 && (
            <div 
              className="relative aspect-video max-h-96 w-full cursor-pointer overflow-hidden group bg-black"
              onClick={() => setActivePhotoModalIndex(0)}
            >
              <img 
                src={selectedMedia[0].url} 
                alt="Product visual" 
                className="w-full h-full object-contain group-hover:scale-[1.01] transition-transform duration-200"
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={handleImageError}
              />
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-xs rounded text-[11px] text-white/90 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-3 h-3" />
                <span>Zoom</span>
              </div>
            </div>
          )}

          {/* Layout for 2 photos (side-by-side) */}
          {selectedMedia.length === 2 && (
            <div className="grid grid-cols-2 gap-0.5 aspect-video w-full bg-slate-900">
              {selectedMedia.map((media, idx) => (
                <div 
                  key={media.id} 
                  className="relative h-full w-full cursor-pointer overflow-hidden group"
                  onClick={() => setActivePhotoModalIndex(idx)}
                >
                  <img 
                    src={media.url} 
                    alt={`Photo ${idx + 1}`} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={handleImageError}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Layout for 3 photos (1 dominant left, 2 stacked right) */}
          {selectedMedia.length === 3 && (
            <div className="grid grid-cols-3 gap-0.5 aspect-video w-full bg-slate-900">
              <div 
                className="col-span-2 relative h-full w-full cursor-pointer overflow-hidden group"
                onClick={() => setActivePhotoModalIndex(0)}
              >
                <img 
                  src={selectedMedia[0].url} 
                  alt="Primary product" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={handleImageError}
                />
              </div>
              <div className="grid grid-rows-2 gap-0.5 h-full">
                {selectedMedia.slice(1, 3).map((media, idx) => (
                  <div 
                    key={media.id} 
                    className="relative h-full w-full cursor-pointer overflow-hidden group"
                    onClick={() => setActivePhotoModalIndex(idx + 1)}
                  >
                    <img 
                      src={media.url} 
                      alt={`Photo ${idx + 2}`} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={handleImageError}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Layout for 4 or more photos (2x2 grid with +N overlay) */}
          {selectedMedia.length >= 4 && (
            <div className="grid grid-cols-2 grid-rows-2 gap-0.5 aspect-square max-h-96 w-full bg-slate-900">
              {visibleImages.map((media, idx) => {
                const isLastWithExtra = idx === 3 && extraCount > 0;
                return (
                  <div 
                    key={media.id} 
                    className="relative h-full w-full cursor-pointer overflow-hidden group"
                    onClick={() => setActivePhotoModalIndex(idx)}
                  >
                    <img 
                      src={media.url} 
                      alt={`Gallery item ${idx + 1}`} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={handleImageError}
                    />
                    {isLastWithExtra && (
                      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex items-center justify-center text-white text-2xl font-bold tracking-wider hover:bg-black/75 transition-colors">
                        +{extraCount}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 border-t border-b border-dashed border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No media selected yet. Upload local photos or generate AI images in Step 2.
          </p>
        </div>
      )}

      {/* Engagement Counter Strip */}
      <div className="px-4 py-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1">
            <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[9px] text-white">👍</span>
            <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] text-white">❤️</span>
          </div>
          <span>{likeCount}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>12 comments</span>
          <span>5 shares</span>
        </div>
      </div>

      {/* Action Buttons: Like, Comment, Share */}
      <div className="px-2 py-1 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={handleLikeToggle}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isLiked 
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ThumbsUp className={`w-4 h-4 ${isLiked ? 'fill-blue-600 dark:fill-blue-400' : ''}`} />
          <span>Like</span>
        </button>

        <button
          type="button"
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Comment</span>
        </button>

        <button
          type="button"
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>
      </div>

      {/* Photo Lightbox Modal */}
      {activePhotoModalIndex !== null && selectedMedia[activePhotoModalIndex] && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setActivePhotoModalIndex(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActivePhotoModalIndex(null)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white rounded-full bg-black/40 hover:bg-black/60 transition-colors"
              aria-label="Close photo preview"
            >
              <X className="w-6 h-6" />
            </button>

            <img 
              src={selectedMedia[activePhotoModalIndex].url} 
              alt="Full resolution preview" 
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={handleImageError}
            />

            <div className="mt-3 flex items-center gap-4 text-xs text-white/80">
              <span>Photo {activePhotoModalIndex + 1} of {selectedMedia.length}</span>
              {selectedMedia[activePhotoModalIndex].source && (
                <span className="px-2 py-0.5 bg-white/20 rounded capitalize">
                  {selectedMedia[activePhotoModalIndex].source.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {selectedMedia.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setActivePhotoModalIndex((activePhotoModalIndex - 1 + selectedMedia.length) % selectedMedia.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={() => setActivePhotoModalIndex((activePhotoModalIndex + 1) % selectedMedia.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
