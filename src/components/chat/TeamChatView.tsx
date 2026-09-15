import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Paperclip, 
  AlertCircle, 
  Hash, 
  Lock, 
  Plus, 
  Smile, 
  Reply, 
  Trash2, 
  Search, 
  Package, 
  Check, 
  CheckCheck, 
  Users, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  X,
  ShieldAlert,
  HelpCircle,
  Clock,
  ArrowDown
} from 'lucide-react';
import { ChatChannel, ChatMessage, Product, StaffUser } from '../../types';
import { realtimeSync } from '../../services/firebaseRealtimeService';
import { StorageService } from '../../utils/storage';

interface TeamChatViewProps {
  currentUser: StaffUser | null;
  channels: ChatChannel[];
  messages: ChatMessage[];
  products: Product[];
  staffUsers?: StaffUser[];
}

const EMOJI_PICKER = ['👍', '❤️', '🔥', '👏', '✅', '🙏', '👀', '🎉', '⚡', '💯'];

export const TeamChatView: React.FC<TeamChatViewProps> = ({
  currentUser,
  channels,
  messages,
  products,
  staffUsers = []
}) => {
  const [activeChannelId, setActiveChannelId] = useState<string>('general');
  const [inputText, setInputText] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [selectedProductTag, setSelectedProductTag] = useState<Product | null>(null);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [searchInChat, setSearchInChat] = useState('');
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [showNewDmModal, setShowNewDmModal] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelRestricted, setNewChannelRestricted] = useState(false);

  // Fallback to StorageService staff users if none passed
  const allStaff: StaffUser[] = (staffUsers && staffUsers.length > 0)
    ? staffUsers 
    : StorageService.getStaffUsers();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper to generate deterministic DM channel ID
  const getDmChannelId = (id1: string, id2: string) => {
    return `dm_${[id1, id2].sort().join('_')}`;
  };

  // Helper to resolve or create DM channel
  const openDirectMessageWithUser = (targetStaff: StaffUser) => {
    if (!currentUser) return;
    const dmId = getDmChannelId(currentUser.id, targetStaff.id);
    
    // Check if channel already registered
    const existing = channels.find(c => c.id === dmId);
    if (!existing) {
      let roleColor = 'bg-blue-600';
      if (targetStaff.role === 'Owner') roleColor = 'bg-purple-600';
      else if (targetStaff.role === 'Manager') roleColor = 'bg-blue-600';
      else if (targetStaff.role === 'Cashier') roleColor = 'bg-emerald-600';
      else if (targetStaff.role === 'Inventory_Staff') roleColor = 'bg-amber-600';

      const newDmChannel: ChatChannel = {
        id: dmId,
        name: targetStaff.name,
        description: `Private 1-on-1 direct messages with ${targetStaff.name} (${targetStaff.role})`,
        iconName: 'User',
        type: 'direct_message',
        memberIds: [currentUser.id, targetStaff.id],
        recipientUser: {
          id: targetStaff.id,
          name: targetStaff.name,
          role: targetStaff.role,
          email: targetStaff.email,
          avatarColor: roleColor
        },
        createdAt: new Date().toISOString()
      };

      realtimeSync.createChannel(newDmChannel);
    }

    setActiveChannelId(dmId);
    setShowNewDmModal(false);
  };

  // Active channel resolution
  let activeChannel = channels.find(c => c.id === activeChannelId);

  // If active channel is a DM but not in channels list, dynamically construct it
  if (!activeChannel && activeChannelId.startsWith('dm_') && currentUser) {
    const userIds = activeChannelId.replace('dm_', '').split('_');
    const otherUserId = userIds.find(id => id !== currentUser.id) || userIds[0];
    const otherUser = allStaff.find(s => s.id === otherUserId);
    if (otherUser) {
      activeChannel = {
        id: activeChannelId,
        name: otherUser.name,
        description: `Private 1-on-1 direct messages with ${otherUser.name}`,
        iconName: 'User',
        type: 'direct_message',
        memberIds: [currentUser.id, otherUser.id],
        recipientUser: {
          id: otherUser.id,
          name: otherUser.name,
          role: otherUser.role,
          email: otherUser.email,
          avatarColor: 'bg-blue-600'
        },
        createdAt: new Date().toISOString()
      };
    }
  }

  if (!activeChannel) {
    activeChannel = channels[0] || {
      id: 'general',
      name: 'general',
      description: 'General store announcements and shift coordination',
      iconName: 'Hash',
      type: 'public',
      createdAt: new Date().toISOString()
    };
  }

  // Check if current user has permission to access this channel
  const isChannelRestricted = activeChannel.type === 'role_restricted';
  const isDirectMessage = activeChannel.type === 'direct_message';

  let hasAccessToActiveChannel = true;
  if (isDirectMessage) {
    const isMember = activeChannel.memberIds?.includes(currentUser?.id || '') || 
                     activeChannelId.includes(currentUser?.id || '');
    const isOwnerOversight = currentUser?.role === 'Owner';
    hasAccessToActiveChannel = Boolean(isMember || isOwnerOversight);
  } else if (isChannelRestricted) {
    hasAccessToActiveChannel = Boolean(
      activeChannel.allowedRoles?.includes(currentUser?.role || 'Cashier')
    );
  }

  // Get recipient staff details for DMs
  let dmRecipientStaff: StaffUser | undefined;
  if (isDirectMessage && currentUser) {
    const userIds = activeChannel.id.startsWith('dm_') 
      ? activeChannel.id.replace('dm_', '').split('_')
      : (activeChannel.memberIds || []);
    const otherUserId = userIds.find(id => id !== currentUser.id);
    dmRecipientStaff = allStaff.find(s => s.id === otherUserId);
  }

  // Filter messages for active channel
  const currentChannelMessages = messages.filter(m => m.channelId === activeChannelId);

  const displayedMessages = currentChannelMessages.filter(m => {
    if (!searchInChat.trim()) return true;
    const q = searchInChat.toLowerCase();
    return (
      m.content.toLowerCase().includes(q) ||
      m.senderName.toLowerCase().includes(q) ||
      m.productTag?.productName.toLowerCase().includes(q)
    );
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChannelId, messages.length]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedProductTag) return;
    if (!currentUser) return;

    let roleColor = 'bg-blue-600';
    if (currentUser.role === 'Owner') roleColor = 'bg-purple-600';
    else if (currentUser.role === 'Manager') roleColor = 'bg-blue-600';
    else if (currentUser.role === 'Cashier') roleColor = 'bg-emerald-600';
    else if (currentUser.role === 'Inventory_Staff') roleColor = 'bg-amber-600';

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      channelId: activeChannelId,
      senderId: currentUser.id,
      senderName: `${currentUser.name} (${currentUser.role})`,
      senderRole: currentUser.role,
      senderAvatarColor: roleColor,
      recipientId: dmRecipientStaff?.id,
      recipientName: dmRecipientStaff?.name,
      isPrivate: isDirectMessage,
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
      isUrgent: isUrgent,
      replyTo: replyingTo ? {
        id: replyingTo.id,
        senderName: replyingTo.senderName,
        content: replyingTo.content.substring(0, 60) + (replyingTo.content.length > 60 ? '...' : '')
      } : undefined,
      productTag: selectedProductTag ? {
        productId: selectedProductTag.id,
        productName: selectedProductTag.name,
        price: selectedProductTag.sellingPrice,
        stock: selectedProductTag.stock,
        sku: selectedProductTag.sku
      } : undefined
    };

    realtimeSync.sendMessage(newMsg);

    // Play subtle audio if enabled
    if (soundEnabled && typeof window !== 'undefined') {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch {
        // audio context blocked by browser
      }
    }

    setInputText('');
    setIsUrgent(false);
    setReplyingTo(null);
    setSelectedProductTag(null);
  };

  const handleReact = (msgId: string, emoji: string) => {
    if (!currentUser) return;
    realtimeSync.reactToMessage(msgId, emoji, currentUser.id);
  };

  const handleDeleteMessage = (msgId: string) => {
    if (confirm('Delete this message?')) {
      realtimeSync.deleteMessage(msgId);
    }
  };

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    const formattedName = newChannelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newChan: ChatChannel = {
      id: `chan-${Date.now()}`,
      name: formattedName,
      description: newChannelDesc.trim() || 'Store chat channel',
      iconName: 'Hash',
      type: newChannelRestricted ? 'role_restricted' : 'public',
      allowedRoles: newChannelRestricted ? ['Owner', 'Manager'] : undefined,
      createdAt: new Date().toISOString()
    };

    realtimeSync.createChannel(newChan);
    setActiveChannelId(newChan.id);
    setShowNewChannelModal(false);
    setNewChannelName('');
    setNewChannelDesc('');
    setNewChannelRestricted(false);
  };

  const filteredProducts = products.filter(p => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q)) || (p.sku && p.sku.toLowerCase().includes(q));
  }).slice(0, 6);

  // Group public & role restricted channels
  const publicChannels = channels.filter(c => c.type !== 'direct_message');

  // Other staff members for Direct Messaging (excluding current active user)
  const otherStaffUsers = allStaff.filter(s => s.id !== currentUser?.id);

  const filteredDmStaff = otherStaffUsers.filter(s => {
    if (!dmSearchQuery.trim()) return true;
    const q = dmSearchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q) || (s.email && s.email.toLowerCase().includes(q));
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row h-[740px]">
      {/* Left Sidebar: Channels & Direct Messages & Shift Presence */}
      <div className="w-full md:w-64 lg:w-72 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 shrink-0">
        {/* Hub Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center font-bold shadow-xs">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Staff Chat Hub</h3>
              <p className="text-[11px] text-slate-400">Shift Channels & DMs</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewDmModal(true)}
              title="New Private Message"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white transition-colors flex items-center gap-1 text-[11px] font-semibold"
            >
              <Users className="w-3.5 h-3.5" />
            </button>
            {(currentUser?.role === 'Owner' || currentUser?.role === 'Manager') && (
              <button
                onClick={() => setShowNewChannelModal(true)}
                title="Create new group channel"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Channels & Direct Messages Scrollable List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 divide-y divide-slate-800/60">
          {/* Public & Group Channels */}
          <div className="space-y-1">
            <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Channels ({publicChannels.length})</span>
              {(currentUser?.role === 'Owner' || currentUser?.role === 'Manager') && (
                <button
                  onClick={() => setShowNewChannelModal(true)}
                  className="hover:text-blue-400 transition-colors"
                  title="Add Channel"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>

            {publicChannels.map(channel => {
              const isSelected = channel.id === activeChannelId;
              const isRestricted = channel.type === 'role_restricted';
              const userAllowed = !isRestricted || channel.allowedRoles?.includes(currentUser?.role || 'Cashier');
              
              // Count unread or total channel messages
              const countInChan = messages.filter(m => m.channelId === channel.id).length;

              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-xs transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {isRestricted ? (
                      <Lock className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-amber-400'}`} />
                    ) : (
                      <Hash className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    )}
                    <span className="truncate">{channel.name}</span>
                  </div>

                  {!userAllowed ? (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-medium shrink-0">
                      Locked
                    </span>
                  ) : countInChan > 0 ? (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {countInChan}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Direct Messages (Private 1-on-1 Chats with Staff Members) */}
          <div className="pt-3 space-y-1">
            <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-blue-400" />
                <span>Private Messages ({otherStaffUsers.length})</span>
              </span>
              <button
                onClick={() => setShowNewDmModal(true)}
                className="hover:text-blue-400 transition-colors text-[10px] font-normal"
                title="Start new DM"
              >
                + New
              </button>
            </div>

            {otherStaffUsers.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                No other staff accounts found
              </div>
            ) : (
              otherStaffUsers.map(staff => {
                const dmId = getDmChannelId(currentUser?.id || '', staff.id);
                const isSelected = activeChannelId === dmId;

                // Messages in this 1-on-1 conversation
                const dmMessages = messages.filter(m => m.channelId === dmId);
                const lastMsg = dmMessages[dmMessages.length - 1];

                let roleBadgeColor = 'bg-slate-700 text-slate-300';
                if (staff.role === 'Owner') roleBadgeColor = 'bg-purple-900/60 text-purple-300 border border-purple-700/50';
                else if (staff.role === 'Manager') roleBadgeColor = 'bg-blue-900/60 text-blue-300 border border-blue-700/50';
                else if (staff.role === 'Cashier') roleBadgeColor = 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50';
                else if (staff.role === 'Inventory_Staff') roleBadgeColor = 'bg-amber-900/60 text-amber-300 border border-amber-700/50';

                return (
                  <button
                    key={staff.id}
                    id={`btn-dm-${staff.id}`}
                    onClick={() => openDirectMessageWithUser(staff)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-xs transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Avatar with live online dot */}
                      <div className="relative shrink-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-xs ${
                          staff.role === 'Owner' ? 'bg-purple-600' :
                          staff.role === 'Manager' ? 'bg-blue-600' :
                          staff.role === 'Cashier' ? 'bg-emerald-600' : 'bg-amber-600'
                        }`}>
                          {staff.name.charAt(0)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                      </div>

                      {/* Name & Role */}
                      <div className="min-w-0 truncate">
                        <div className="truncate font-medium flex items-center gap-1.5">
                          <span className="truncate">{staff.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                          {lastMsg ? (
                            <span className="truncate">{lastMsg.content}</span>
                          ) : (
                            <span className="italic opacity-70">Start private chat</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      {dmMessages.length > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {dmMessages.length}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Shift Presence Footer */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 text-xs shrink-0">
          <div className="flex items-center justify-between mb-2 text-slate-400">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Current User ({currentUser?.role || 'Guest'})
            </span>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Mute notification sound' : 'Enable notification sound'}
              className="p-1 rounded text-slate-400 hover:text-white"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-blue-400" /> : <VolumeX className="w-3.5 h-3.5 text-rose-400" />}
            </button>
          </div>
          {currentUser && (
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-xs ${
                currentUser.role === 'Owner' ? 'bg-purple-600' :
                currentUser.role === 'Manager' ? 'bg-blue-600' :
                currentUser.role === 'Cashier' ? 'bg-emerald-600' : 'bg-amber-600'
              }`}>
                {currentUser.name.charAt(0)}
              </div>
              <div className="truncate">
                <div className="font-semibold text-white truncate text-xs">{currentUser.name}</div>
                <div className="text-[10px] text-slate-400">{currentUser.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Main Chat Section */}
      <div className="flex-1 flex flex-col bg-slate-50 min-h-0">
        {/* Chat Top Header */}
        <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            {isDirectMessage ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-xs ${
                    dmRecipientStaff?.role === 'Owner' ? 'bg-purple-600' :
                    dmRecipientStaff?.role === 'Manager' ? 'bg-blue-600' :
                    dmRecipientStaff?.role === 'Cashier' ? 'bg-emerald-600' : 'bg-amber-600'
                  }`}>
                    {(dmRecipientStaff?.name || activeChannel.name).charAt(0)}
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">
                      {dmRecipientStaff?.name || activeChannel.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      Private 1-on-1 Message
                    </span>
                    {dmRecipientStaff && (
                      <span className={`px-2 py-0.2 rounded text-[10px] font-semibold ${
                        dmRecipientStaff.role === 'Owner' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        dmRecipientStaff.role === 'Manager' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        dmRecipientStaff.role === 'Cashier' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {dmRecipientStaff.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {dmRecipientStaff?.email ? `${dmRecipientStaff.email} • ` : ''}End-to-end direct staff channel
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                  {isChannelRestricted ? <Lock className="w-4 h-4 text-amber-600" /> : <Hash className="w-4 h-4 text-blue-600" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">#{activeChannel?.name}</h3>
                    {isChannelRestricted && (
                      <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        Restricted Channel (Owner & Manager Only)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{activeChannel?.description}</p>
                </div>
              </div>
            )}
          </div>

          {/* Top Header Actions */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchInChat}
                onChange={e => setSearchInChat(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchInChat && (
                <button 
                  onClick={() => setSearchInChat('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowNewDmModal(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Direct Message</span>
            </button>
          </div>
        </div>

        {/* Message Stream */}
        {!hasAccessToActiveChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-base text-slate-900 mb-1">Confidential Private Channel</h4>
            <p className="text-xs text-slate-500 max-w-sm">
              {isDirectMessage 
                ? 'This 1-on-1 private conversation is encrypted and reserved exclusively for the dedicated participants.'
                : 'This channel is restricted to Store Owners and Managers for confidential shift and financial deliberations.'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Direct Message Starter Watermark */}
            {isDirectMessage && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/70 rounded-xl p-4 text-center space-y-1.5 my-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto shadow-xs">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-slate-900">
                  Private 1-on-1 Direct Message with {dmRecipientStaff?.name || activeChannel.name}
                </h4>
                <p className="text-[11px] text-slate-600 max-w-md mx-auto">
                  Messages in this channel are confidential between you and <strong>{dmRecipientStaff?.name || activeChannel.name}</strong>. Use this for 1-on-1 handover notes, private discount inquiries, or specific task instructions.
                </p>
              </div>
            )}

            {displayedMessages.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <MessageSquare className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">
                  {isDirectMessage 
                    ? `No private messages with ${dmRecipientStaff?.name || activeChannel.name} yet`
                    : `No messages in #${activeChannel?.name} yet`}
                </p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {isDirectMessage
                    ? 'Type a message below or attach a stock inquiry to start this private chat.'
                    : 'Start the shift conversation, ask for stock verification, or request manager approval.'}
                </p>
              </div>
            ) : (
              displayedMessages.map(msg => {
                const isCurrentUser = currentUser?.id === msg.senderId;

                // Sender staff details
                const senderStaff = allStaff.find(s => s.id === msg.senderId);

                return (
                  <div
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`flex items-start gap-3 group ${isCurrentUser ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar with DM trigger popover */}
                    <div 
                      onClick={() => {
                        if (!isCurrentUser && senderStaff) {
                          openDirectMessageWithUser(senderStaff);
                        }
                      }}
                      title={!isCurrentUser ? `Click to send private message to ${msg.senderName}` : undefined}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-xs cursor-pointer hover:scale-105 transition-transform ${msg.senderAvatarColor || 'bg-blue-600'}`}
                    >
                      {msg.senderName.charAt(0)}
                    </div>

                    {/* Message Bubble Container */}
                    <div className={`max-w-[80%] space-y-1 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                      {/* Sender Name & Meta */}
                      <div className={`flex items-center gap-2 text-[11px] text-slate-400 ${isCurrentUser ? 'justify-end' : ''}`}>
                        <button
                          onClick={() => {
                            if (!isCurrentUser && senderStaff) {
                              openDirectMessageWithUser(senderStaff);
                            }
                          }}
                          className="font-semibold text-slate-700 hover:text-blue-600 transition-colors"
                        >
                          {msg.senderName}
                        </button>
                        <span>•</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.isPrivate && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                            <Lock className="w-2.5 h-2.5" /> Private
                          </span>
                        )}
                        {msg.isUrgent && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            URGENT POS
                          </span>
                        )}
                      </div>

                      {/* Reply preview if replying to another message */}
                      {msg.replyTo && (
                        <div className={`text-[11px] px-2.5 py-1 rounded bg-slate-200/70 text-slate-600 border-l-2 border-blue-500 ${isCurrentUser ? 'text-right' : ''}`}>
                          <span className="font-semibold text-slate-700">{msg.replyTo.senderName}:</span> {msg.replyTo.content}
                        </div>
                      )}

                      {/* Message Body Card */}
                      <div className={`p-3.5 rounded-2xl text-sm leading-relaxed shadow-xs ${
                        msg.isUrgent
                          ? 'bg-rose-50 border-2 border-rose-400 text-slate-900 ring-2 ring-rose-200'
                          : isCurrentUser
                            ? 'bg-blue-600 text-white rounded-tr-xs'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                      }`}>
                        {msg.content}

                        {/* Interactive Product Tag Card */}
                        {msg.productTag && (
                          <div className={`mt-2.5 p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                            isCurrentUser 
                              ? 'bg-blue-700/80 border-blue-500 text-white' 
                              : 'bg-slate-50 border-slate-200 text-slate-900'
                          }`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`p-2 rounded ${isCurrentUser ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                <Package className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-bold text-xs leading-tight">{msg.productTag.productName}</div>
                                <div className={`text-[11px] ${isCurrentUser ? 'text-blue-100' : 'text-slate-500'}`}>
                                  SKU: {msg.productTag.sku} • Stock: <span className="font-semibold">{msg.productTag.stock} units</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right font-bold text-xs whitespace-nowrap">
                              {msg.productTag.price.toLocaleString()} Ks
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Reactions & Action Bar */}
                      <div className={`flex flex-wrap items-center gap-1.5 pt-0.5 ${isCurrentUser ? 'justify-end' : ''}`}>
                        {/* Render Existing Reactions */}
                        {msg.reactions && Object.entries(msg.reactions).map(([emoji, staffIds]) => {
                          if (staffIds.length === 0) return null;
                          const hasReacted = currentUser && staffIds.includes(currentUser.id);

                          return (
                            <button
                              key={emoji}
                              onClick={() => handleReact(msg.id, emoji)}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-all ${
                                hasReacted 
                                  ? 'bg-blue-100 border-blue-300 text-blue-800 font-bold' 
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span>{staffIds.length}</span>
                            </button>
                          );
                        })}

                        {/* Quick Reaction, DM & Reply Toolbar (Revealed on hover) */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                          {EMOJI_PICKER.slice(0, 3).map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => handleReact(msg.id, emoji)}
                              className="text-xs hover:scale-125 transition-transform p-0.5"
                            >
                              {emoji}
                            </button>
                          ))}
                          
                          {/* Direct Message Sender button */}
                          {!isCurrentUser && senderStaff && !isDirectMessage && (
                            <button
                              onClick={() => openDirectMessageWithUser(senderStaff)}
                              title={`Direct Message ${senderStaff.name}`}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded flex items-center gap-0.5 text-[10px]"
                            >
                              <MessageSquare className="w-3 h-3 text-blue-500" />
                            </button>
                          )}

                          <button
                            onClick={() => setReplyingTo(msg)}
                            title="Reply to message"
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          >
                            <Reply className="w-3 h-3" />
                          </button>
                          {(isCurrentUser || currentUser?.role === 'Owner' || currentUser?.role === 'Manager') && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              title="Delete message"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Bar */}
        {hasAccessToActiveChannel && (
          <div className="p-3 bg-white border-t border-slate-200 shrink-0">
            {/* Replying Banner */}
            {replyingTo && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center gap-1.5 truncate">
                  <Reply className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Replying to <strong>{replyingTo.senderName}</strong>: {replyingTo.content.substring(0, 40)}...</span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Selected Product Tag Banner */}
            {selectedProductTag && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-between text-xs text-indigo-900">
                <div className="flex items-center gap-2 truncate">
                  <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">Attached Stock: <strong>{selectedProductTag.name}</strong> ({selectedProductTag.sellingPrice.toLocaleString()} Ks • {selectedProductTag.stock} in stock)</span>
                </div>
                <button onClick={() => setSelectedProductTag(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Product Selector Dropdown Popover */}
            {showProductSelector && (
              <div className="mb-2 p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-600" /> Attach Device for Stock Inquiry
                  </span>
                  <button onClick={() => setShowProductSelector(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Search model name or brand (e.g. iPhone 15, Redmi, Samsung)..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 bg-white mb-2"
                />
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProductTag(p);
                        setShowProductSelector(false);
                      }}
                      className="w-full text-left p-2 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 hover:border-blue-200 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        <div className="text-[11px] text-slate-500">Stock: {p.stock} units • {p.brand}</div>
                      </div>
                      <div className="font-bold text-blue-600">{p.sellingPrice.toLocaleString()} Ks</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {/* Urgent Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsUrgent(!isUrgent)}
                  title={isUrgent ? 'Urgent flag active' : 'Mark as Urgent message'}
                  className={`p-2 rounded-lg text-xs font-semibold transition-all ${
                    isUrgent 
                      ? 'bg-rose-600 text-white shadow-xs animate-pulse' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4" />
                </button>

                {/* Attach Product Button */}
                <button
                  type="button"
                  onClick={() => setShowProductSelector(!showProductSelector)}
                  title="Attach Device / Inventory Inquiry"
                  className={`p-2 rounded-lg text-xs transition-all ${
                    selectedProductTag || showProductSelector 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Package className="w-4 h-4" />
                </button>
              </div>

              {/* Text Input */}
              <input
                type="text"
                placeholder={
                  isDirectMessage 
                    ? `Private message to ${dmRecipientStaff?.name || activeChannel.name}...` 
                    : isUrgent 
                      ? 'Type urgent POS/discount message...' 
                      : `Message #${activeChannel?.name}...`
                }
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              />

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!inputText.trim() && !selectedProductTag}
                className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white shadow-xs transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Modal: Start Direct Message (Private Chat with Dedicated User) */}
      {showNewDmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-600 text-white">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Start Direct Message</h3>
                  <p className="text-xs text-slate-500">Private 1-on-1 chat with a dedicated staff member</p>
                </div>
              </div>
              <button onClick={() => setShowNewDmModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-3 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff by name or role..."
                value={dmSearchQuery}
                onChange={e => setDmSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
              {filteredDmStaff.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No staff members match your search
                </div>
              ) : (
                filteredDmStaff.map(staff => (
                  <button
                    key={staff.id}
                    onClick={() => openDirectMessageWithUser(staff)}
                    className="w-full text-left p-3 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-200 flex items-center justify-between gap-3 transition-colors pt-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs ${
                        staff.role === 'Owner' ? 'bg-purple-600' :
                        staff.role === 'Manager' ? 'bg-blue-600' :
                        staff.role === 'Cashier' ? 'bg-emerald-600' : 'bg-amber-600'
                      }`}>
                        {staff.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{staff.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span>{staff.role}</span>
                          {staff.email && <span>• {staff.email}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-blue-600 hover:bg-blue-600 hover:text-white transition-colors shadow-2xs">
                      Chat Privately →
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Channel */}
      {showNewChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-600 text-white">
                  <Hash className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900">Create Staff Channel</h3>
              </div>
              <button onClick={() => setShowNewChannelModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Channel Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. counter-2-cashiers or repair-bench"
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Channel Purpose / Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Real-time updates between technicians and counter staff"
                  value={newChannelDesc}
                  onChange={e => setNewChannelDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900">Restricted Access</div>
                  <div className="text-[11px] text-slate-500">Only Store Owners & Managers can view this channel</div>
                </div>
                <input
                  type="checkbox"
                  checked={newChannelRestricted}
                  onChange={e => setNewChannelRestricted(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewChannelModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
                >
                  Create Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
