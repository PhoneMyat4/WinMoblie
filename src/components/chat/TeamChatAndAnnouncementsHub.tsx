import React, { useState, useEffect } from 'react';
import { 
  Megaphone, 
  MessageSquare, 
  Radio, 
  Pin, 
  Users, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  Activity, 
  RefreshCw,
  Clock,
  Layers
} from 'lucide-react';
import { Announcement, ChatChannel, ChatMessage, FirebaseSyncConfig, Product, StaffUser } from '../../types';
import { NoticeBoardView } from './NoticeBoardView';
import { TeamChatView } from './TeamChatView';
import { realtimeSync } from '../../services/firebaseRealtimeService';
import { StorageService } from '../../utils/storage';

interface TeamChatAndAnnouncementsHubProps {
  currentUser: StaffUser | null;
  canManageAnnouncements: boolean;
  products: Product[];
  staffUsers?: StaffUser[];
}

export const TeamChatAndAnnouncementsHub: React.FC<TeamChatAndAnnouncementsHubProps> = ({
  currentUser,
  canManageAnnouncements,
  products,
  staffUsers = []
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'notice_board' | 'team_chat'>('notice_board');
  const [announcements, setAnnouncements] = useState<Announcement[]>(StorageService.getAnnouncements());
  const [channels, setChannels] = useState<ChatChannel[]>(StorageService.getChatChannels());
  const [messages, setMessages] = useState<ChatMessage[]>(StorageService.getChatMessages());
  const [syncConfig, setSyncConfig] = useState<FirebaseSyncConfig>(StorageService.getFirebaseSyncConfig());
  const [isLiveSyncing, setIsLiveSyncing] = useState(false);

  // Subscribe to real-time events via FirebaseRealtimeService
  useEffect(() => {
    const unsubAnnouncements = realtimeSync.subscribeToAnnouncements((newAnn) => {
      setAnnouncements(newAnn);
    });

    const unsubChannels = realtimeSync.subscribeToChannels((newChannels) => {
      setChannels(newChannels);
    });

    const unsubMessages = realtimeSync.subscribeToMessages((newMsgs) => {
      setMessages(newMsgs);
    });

    return () => {
      unsubAnnouncements();
      unsubChannels();
      unsubMessages();
    };
  }, []);

  const handleManualSyncPulse = () => {
    setIsLiveSyncing(true);
    setTimeout(() => {
      setAnnouncements(StorageService.getAnnouncements());
      setChannels(StorageService.getChatChannels());
      setMessages(StorageService.getChatMessages());
      setIsLiveSyncing(false);
    }, 400);
  };

  const pinnedCount = announcements.filter(a => a.isPinned).length;
  const urgentCount = announcements.filter(a => a.priority === 'urgent' || a.priority === 'high').length;

  return (
    <div id="team-chat-and-announcements-module" className="space-y-6">
      {/* Top Header Card with POS Aesthetic */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-white shadow-xs">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                Team Chat & Announcement
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Firebase Live
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Real-time shift coordination, urgent manager approvals, and pinned store notices
            </p>
          </div>
        </div>

        {/* Sync Status Badge & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Real-time State pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <Activity className={`w-3.5 h-3.5 text-emerald-500 ${isLiveSyncing ? 'animate-spin' : ''}`} />
            <span>Firestore Synced</span>
            <button
              onClick={handleManualSyncPulse}
              title="Force sync pulse"
              className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* Tab Navigation Pill Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80 w-full sm:w-auto">
            <button
              id="tab-btn-notice-board"
              onClick={() => setActiveSubTab('notice_board')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeSubTab === 'notice_board'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Megaphone className="w-4 h-4 text-amber-500" />
              <span>Notice Board</span>
              {pinnedCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                  {pinnedCount}
                </span>
              )}
            </button>

            <button
              id="tab-btn-team-chat"
              onClick={() => setActiveSubTab('team_chat')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeSubTab === 'team_chat'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <span>Team Chat</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                {messages.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Module Content */}
      {activeSubTab === 'notice_board' ? (
        <NoticeBoardView
          currentUser={currentUser}
          canManageAnnouncements={canManageAnnouncements}
          announcements={announcements}
        />
      ) : (
        <TeamChatView
          currentUser={currentUser}
          channels={channels}
          messages={messages}
          products={products}
          staffUsers={staffUsers}
        />
      )}
    </div>
  );
};
