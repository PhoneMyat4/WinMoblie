import React, { useState } from 'react';
import { 
  Pin, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  Eye, 
  Trash2, 
  Edit3, 
  Tag, 
  Clock, 
  User, 
  ShieldAlert, 
  Megaphone, 
  Sparkles, 
  BellRing,
  Bell,
  Package,
  Layers,
  X,
  FileText
} from 'lucide-react';
import { Announcement, AnnouncementCategory, AnnouncementPriority, StaffUser } from '../../types';
import { realtimeSync } from '../../services/firebaseRealtimeService';

interface NoticeBoardViewProps {
  currentUser: StaffUser | null;
  canManageAnnouncements: boolean;
  announcements: Announcement[];
  onSelectAnnouncement?: (announcement: Announcement) => void;
}

const CATEGORY_MAP: Record<AnnouncementCategory, { label: string; bg: string; text: string; border: string; icon: any }> = {
  urgent_alert: { label: 'Urgent Alert', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: ShieldAlert },
  operational_notice: { label: 'Operational Notice', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Layers },
  policy_update: { label: 'Policy Update', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: FileText },
  promotional_campaign: { label: 'Promotion / Campaign', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: Megaphone },
  stock_alert: { label: 'Stock & Inventory Alert', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: Package },
  shift_handover: { label: 'Shift Handover', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: Clock },
  general: { label: 'General Announcement', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', icon: Bell }
};

const PRIORITY_MAP: Record<AnnouncementPriority, { label: string; badge: string }> = {
  low: { label: 'Low', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
  medium: { label: 'Medium', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  high: { label: 'High Priority', badge: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold' },
  urgent: { label: 'CRITICAL ALERT', badge: 'bg-rose-100 text-rose-800 border-rose-300 font-bold animate-pulse' }
};

const EMOJI_OPTIONS = ['👍', '❤️', '🚀', '🔥', '📦', '🔒', '✅', '👀'];

export const NoticeBoardView: React.FC<NoticeBoardViewProps> = ({
  currentUser,
  canManageAnnouncements,
  announcements
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [activeAckModalItem, setActiveAckModalItem] = useState<Announcement | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    category: AnnouncementCategory;
    priority: AnnouncementPriority;
    isPinned: boolean;
    tags: string;
    attachmentTitle: string;
    attachmentSubtitle: string;
  }>({
    title: '',
    content: '',
    category: 'urgent_alert',
    priority: 'high',
    isPinned: true,
    tags: 'iPhone 16, Shift Update',
    attachmentTitle: '',
    attachmentSubtitle: ''
  });

  const handleOpenCreateModal = (existing?: Announcement) => {
    if (existing) {
      setEditingAnnouncement(existing);
      setFormData({
        title: existing.title,
        content: existing.content,
        category: existing.category,
        priority: existing.priority,
        isPinned: existing.isPinned,
        tags: existing.tags ? existing.tags.join(', ') : '',
        attachmentTitle: existing.attachments?.[0]?.title || '',
        attachmentSubtitle: existing.attachments?.[0]?.subtitle || ''
      });
    } else {
      setEditingAnnouncement(null);
      setFormData({
        title: '',
        content: '',
        category: 'urgent_alert',
        priority: 'high',
        isPinned: true,
        tags: '',
        attachmentTitle: '',
        attachmentSubtitle: ''
      });
    }
    setShowCreateModal(true);
  };

  const handleSaveAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) return;

    const tagsArray = formData.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const attachments = formData.attachmentTitle.trim() ? [
      {
        type: 'product' as const,
        title: formData.attachmentTitle.trim(),
        subtitle: formData.attachmentSubtitle.trim() || 'Attached Item / Directive',
        badge: 'Attached Context'
      }
    ] : undefined;

    if (editingAnnouncement) {
      const updated: Announcement = {
        ...editingAnnouncement,
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category,
        priority: formData.priority,
        isPinned: formData.isPinned,
        pinnedAt: formData.isPinned ? (editingAnnouncement.pinnedAt || new Date().toISOString()) : undefined,
        pinnedBy: formData.isPinned ? (editingAnnouncement.pinnedBy || currentUser?.name || 'Manager') : undefined,
        tags: tagsArray,
        attachments,
        updatedAt: new Date().toISOString()
      };
      realtimeSync.updateAnnouncement(updated);
    } else {
      const newAnn: Announcement = {
        id: `ann-${Date.now()}`,
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category,
        priority: formData.priority,
        isPinned: formData.isPinned,
        pinnedAt: formData.isPinned ? new Date().toISOString() : undefined,
        pinnedBy: formData.isPinned ? (currentUser?.name || 'Manager') : undefined,
        authorId: currentUser?.id || 'staff-1',
        authorName: currentUser?.name || 'Store Staff',
        authorRole: currentUser?.role || 'Manager',
        createdAt: new Date().toISOString(),
        acknowledgedBy: currentUser ? [
          {
            staffId: currentUser.id,
            staffName: currentUser.name,
            staffRole: currentUser.role,
            acknowledgedAt: new Date().toISOString()
          }
        ] : [],
        reactions: [],
        tags: tagsArray,
        attachments
      };
      realtimeSync.postAnnouncement(newAnn);
    }

    setShowCreateModal(false);
    setEditingAnnouncement(null);
  };

  const handleTogglePin = (ann: Announcement) => {
    if (!canManageAnnouncements) return;
    realtimeSync.togglePin(ann.id, currentUser?.name || 'Manager');
  };

  const handleDelete = (id: string) => {
    if (!canManageAnnouncements) return;
    if (confirm('Are you sure you want to remove this notice?')) {
      realtimeSync.deleteAnnouncement(id);
    }
  };

  const handleAcknowledge = (ann: Announcement) => {
    if (!currentUser) return;
    realtimeSync.acknowledgeAnnouncement(ann.id, {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role
    });
  };

  const handleReact = (ann: Announcement, emoji: string) => {
    if (!currentUser) return;
    realtimeSync.reactToAnnouncement(ann.id, emoji, currentUser.id);
  };

  // Filtering
  const filteredAnnouncements = announcements.filter(item => {
    if (pinnedOnly && !item.isPinned) return false;
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchContent = item.content.toLowerCase().includes(q);
      const matchAuthor = item.authorName.toLowerCase().includes(q);
      const matchTags = item.tags?.some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchContent && !matchAuthor && !matchTags) return false;
    }
    return true;
  });

  // Split into pinned and normal
  const pinnedAnnouncements = filteredAnnouncements.filter(a => a.isPinned);
  const otherAnnouncements = filteredAnnouncements.filter(a => !a.isPinned);

  const renderAnnouncementCard = (ann: Announcement, isPinnedBlock: boolean = false) => {
    const catConfig = CATEGORY_MAP[ann.category] || CATEGORY_MAP.operational_notice;
    const CategoryIcon = catConfig.icon;
    const prioConfig = PRIORITY_MAP[ann.priority] || PRIORITY_MAP.medium;

    const hasAcknowledged = currentUser && ann.acknowledgedBy?.some(ack => ack.staffId === currentUser.id);
    const ackCount = ann.acknowledgedBy?.length || 0;

    return (
      <div 
        key={ann.id}
        id={`announcement-card-${ann.id}`}
        className={`rounded-xl border transition-all duration-200 bg-white shadow-sm overflow-hidden ${
          isPinnedBlock 
            ? 'border-amber-300 ring-1 ring-amber-100/80 shadow-amber-50/50' 
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Card Header Bar */}
        <div className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-2.5 ${
          ann.priority === 'urgent' 
            ? 'bg-rose-50/80 border-rose-200' 
            : isPinnedBlock 
              ? 'bg-amber-50/60 border-amber-200/80' 
              : 'bg-slate-50/70 border-slate-100'
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            {ann.isPinned && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-sm">
                <Pin className="w-3 h-3 fill-current" /> Pinned Notice
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border ${catConfig.bg} ${catConfig.text} ${catConfig.border}`}>
              <CategoryIcon className="w-3.5 h-3.5" />
              {catConfig.label}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${prioConfig.badge}`}>
              {prioConfig.label}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <User className="w-3.5 h-3.5 text-slate-400" />
              {ann.authorName}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" />
              {new Date(ann.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>

            {/* Manager Controls */}
            {canManageAnnouncements && (
              <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                <button
                  onClick={() => handleTogglePin(ann)}
                  title={ann.isPinned ? 'Unpin announcement' : 'Pin to top of board'}
                  className={`p-1 rounded hover:bg-slate-200 transition-colors ${ann.isPinned ? 'text-amber-600' : 'text-slate-400'}`}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleOpenCreateModal(ann)}
                  title="Edit notice"
                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-200 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(ann.id)}
                  title="Delete notice"
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-200 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="p-5 space-y-3.5">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
            {ann.title}
          </h3>

          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50/50 p-3.5 rounded-lg border border-slate-100 font-normal">
            {ann.content}
          </div>

          {/* Attachments (e.g. Products or Directives) */}
          {ann.attachments && ann.attachments.length > 0 && (
            <div className="space-y-2 pt-1">
              {ann.attachments.map((att, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded bg-indigo-100 text-indigo-700">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-indigo-950">{att.title}</div>
                      {att.subtitle && <div className="text-[11px] text-indigo-600">{att.subtitle}</div>}
                    </div>
                  </div>
                  {att.badge && (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-indigo-200/80 text-indigo-800 rounded">
                      {att.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tags */}
          {ann.tags && ann.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {ann.tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                  <Tag className="w-2.5 h-2.5 text-slate-400" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Card Footer: Acknowledgements & Reactions */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Reaction Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {EMOJI_OPTIONS.slice(0, 5).map(emoji => {
              const reaction = ann.reactions?.find(r => r.emoji === emoji);
              const count = reaction ? reaction.staffIds.length : 0;
              const userHasReacted = currentUser && reaction ? reaction.staffIds.includes(currentUser.id) : false;

              return (
                <button
                  key={emoji}
                  onClick={() => handleReact(ann, emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all ${
                    userHasReacted
                      ? 'bg-blue-100 text-blue-800 border border-blue-300 font-semibold shadow-xs'
                      : count > 0 
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200' 
                        : 'bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200/70'
                  }`}
                  title={`React ${emoji}`}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span className="text-[11px]">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Staff Read Acknowledgement status */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveAckModalItem(ann)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Read by <strong>{ackCount}</strong> staff</span>
            </button>

            {hasAcknowledged ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Acknowledged
              </span>
            ) : (
              <button
                onClick={() => handleAcknowledge(ann)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Acknowledged
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500 text-white shadow-xs">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Store Notice Board</h2>
              <p className="text-xs text-slate-500">
                High-priority announcements, daily shift directives, policy updates & inventory alerts
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {canManageAnnouncements && (
            <button
              onClick={() => handleOpenCreateModal()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Post Announcement
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search notice board by keyword, tag, or manager name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Categories ({announcements.length})
            </button>
            {Object.entries(CATEGORY_MAP).map(([catKey, catMeta]) => {
              const count = announcements.filter(a => a.category === catKey).length;
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    selectedCategory === catKey
                      ? `${catMeta.bg} ${catMeta.text} font-semibold border ${catMeta.border} shadow-2xs`
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <catMeta.icon className="w-3.5 h-3.5" />
                  {catMeta.label} ({count})
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPinnedOnly(!pinnedOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              pinnedOnly 
                ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold' 
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${pinnedOnly ? 'fill-amber-700 text-amber-700' : ''}`} />
            Pinned Only
          </button>
        </div>
      </div>

      {/* Pinned Announcements Section */}
      {pinnedAnnouncements.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
            <Pin className="w-4 h-4 fill-amber-600 text-amber-600" />
            <span>Pinned Store Directives ({pinnedAnnouncements.length})</span>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {pinnedAnnouncements.map(ann => renderAnnouncementCard(ann, true))}
          </div>
        </div>
      )}

      {/* Regular Announcements Section */}
      <div className="space-y-3">
        {pinnedAnnouncements.length > 0 && otherAnnouncements.length > 0 && (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider pt-2">
            <Layers className="w-4 h-4" />
            <span>Recent Store Updates ({otherAnnouncements.length})</span>
          </div>
        )}

        {filteredAnnouncements.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <Megaphone className="w-6 h-6" />
            </div>
            <h4 className="text-base font-semibold text-slate-900 mb-1">No Announcements Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              There are no notices matching your active filters or search terms.
            </p>
            {canManageAnnouncements && (
              <button
                onClick={() => handleOpenCreateModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Post First Notice
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {otherAnnouncements.map(ann => renderAnnouncementCard(ann, false))}
          </div>
        )}
      </div>

      {/* Modal: Create or Edit Announcement */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500 text-white">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    {editingAnnouncement ? 'Edit Announcement' : 'New Store Announcement'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Broadcast critical directives to all cashiers and back-office staff
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAnnouncement} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Notice Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 🚨 High Priority: iPhone 16 Launch Stock Handover Protocol"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as AnnouncementCategory })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                  >
                    <option value="urgent_alert">🚨 Urgent Alert</option>
                    <option value="operational_notice">📋 Operational Notice</option>
                    <option value="policy_update">⚡ Policy Update</option>
                    <option value="promotional_campaign">🏷️ Promotional Campaign</option>
                    <option value="stock_alert">📦 Stock & Inventory Alert</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Priority Level *
                  </label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value as AnnouncementPriority })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                  >
                    <option value="low">Standard / Low</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">CRITICAL ALERT (Red Banner)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Announcement Details & Bullet Points *
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="Detail the shift procedure, warranty rules, IMEI barcode scanning requirement, or cash drawer handover instructions..."
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Pin Notice to Top of Board</span>
                  <input
                    type="checkbox"
                    id="pin-checkbox"
                    checked={formData.isPinned}
                    onChange={e => setFormData({ ...formData, isPinned: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Pinned notices stay prominently displayed at the top of the Notice Board for all shifts.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. iPhone 16, Cash Drawer, IMEI Check, Promotion"
                  value={formData.tags}
                  onChange={e => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="border-t border-slate-100 pt-3.5 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Optional Product / Document Attachment Link
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Attachment Title (e.g. iPhone 16 Pro Max)"
                    value={formData.attachmentTitle}
                    onChange={e => setFormData({ ...formData, attachmentTitle: e.target.value })}
                    className="px-3 py-1.5 text-xs rounded border border-slate-200"
                  />
                  <input
                    type="text"
                    placeholder="Subtitle (e.g. 256GB Desert Titanium)"
                    value={formData.attachmentSubtitle}
                    onChange={e => setFormData({ ...formData, attachmentSubtitle: e.target.value })}
                    className="px-3 py-1.5 text-xs rounded border border-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-xs transition-colors"
                >
                  {editingAnnouncement ? 'Save Changes' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Staff Acknowledgements */}
      {activeAckModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-slate-600" />
                <h3 className="font-bold text-sm text-slate-900">Read & Acknowledged Staff</h3>
              </div>
              <button
                onClick={() => setActiveAckModalItem(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-80 overflow-y-auto space-y-2.5">
              {(!activeAckModalItem.acknowledgedBy || activeAckModalItem.acknowledgedBy.length === 0) ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  No staff members have acknowledged this notice yet.
                </div>
              ) : (
                activeAckModalItem.acknowledgedBy.map((ack, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                        {ack.staffName.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{ack.staffName}</div>
                        <div className="text-[11px] text-slate-500">{ack.staffRole}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 justify-end">
                        <CheckCircle2 className="w-3 h-3" /> Read
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(ack.acknowledgedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setActiveAckModalItem(null)}
                className="px-4 py-1.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
