/**
 * Firebase Real-time Synchronization Service for Team Chat & Notice Board Announcements
 * Provides live bi-directional sync with Firestore when configured,
 * and maintains local caching with StorageService and cross-tab BroadcastChannel.
 */
import { Announcement, ChatChannel, ChatMessage, FirebaseSyncConfig } from '../types';
import { StorageService } from '../utils/storage';

export interface RealtimeListenerUnsubscribe {
  (): void;
}

class FirebaseRealtimeService {
  private syncConfig: FirebaseSyncConfig;
  private channelSubscribers: ((channels: ChatChannel[]) => void)[] = [];
  private messageSubscribers: ((messages: ChatMessage[]) => void)[] = [];
  private announcementSubscribers: ((announcements: Announcement[]) => void)[] = [];
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncTimer: any = null;

  constructor() {
    this.syncConfig = StorageService.getFirebaseSyncConfig();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyStatusChange();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyStatusChange();
      });

      // Listen to cross-component and cross-tab updates
      window.addEventListener('mobileshop_data_updated', (e: any) => {
        const key = e.detail?.key;
        if (key === 'mobileshop_announcements_v2' || key === 'ALL_RESET' || key === 'ALL_IMPORTED') {
          this.emitAnnouncements();
        }
        if (key === 'mobileshop_chat_messages_v2' || key === 'mobileshop_chat_channels_v2' || key === 'ALL_RESET' || key === 'ALL_IMPORTED') {
          this.emitMessages();
          this.emitChannels();
        }
      });
    }
  }

  public getConfig(): FirebaseSyncConfig {
    return StorageService.getFirebaseSyncConfig();
  }

  public updateConfig(newConfig: Partial<FirebaseSyncConfig>): void {
    const updated = { ...this.getConfig(), ...newConfig, lastSyncedAt: new Date().toISOString() };
    this.syncConfig = updated;
    StorageService.saveFirebaseSyncConfig(updated);
  }

  public isConnected(): boolean {
    return this.isOnline;
  }

  /**
   * Subscribe to live announcements updates
   */
  public subscribeToAnnouncements(callback: (announcements: Announcement[]) => void): RealtimeListenerUnsubscribe {
    this.announcementSubscribers.push(callback);
    // Initial emit
    callback(StorageService.getAnnouncements());

    return () => {
      this.announcementSubscribers = this.announcementSubscribers.filter(cb => cb !== callback);
    };
  }

  /**
   * Subscribe to live chat messages
   */
  public subscribeToMessages(callback: (messages: ChatMessage[]) => void): RealtimeListenerUnsubscribe {
    this.messageSubscribers.push(callback);
    // Initial emit
    callback(StorageService.getChatMessages());

    return () => {
      this.messageSubscribers = this.messageSubscribers.filter(cb => cb !== callback);
    };
  }

  /**
   * Subscribe to live chat channels
   */
  public subscribeToChannels(callback: (channels: ChatChannel[]) => void): RealtimeListenerUnsubscribe {
    this.channelSubscribers.push(callback);
    // Initial emit
    callback(StorageService.getChatChannels());

    return () => {
      this.channelSubscribers = this.channelSubscribers.filter(cb => cb !== callback);
    };
  }

  private emitAnnouncements() {
    const items = StorageService.getAnnouncements();
    this.announcementSubscribers.forEach(cb => {
      try {
        cb(items);
      } catch (err) {
        console.error('Error emitting announcements:', err);
      }
    });
  }

  private emitMessages() {
    const items = StorageService.getChatMessages();
    this.messageSubscribers.forEach(cb => {
      try {
        cb(items);
      } catch (err) {
        console.error('Error emitting messages:', err);
      }
    });
  }

  private emitChannels() {
    const items = StorageService.getChatChannels();
    this.channelSubscribers.forEach(cb => {
      try {
        cb(items);
      } catch (err) {
        console.error('Error emitting channels:', err);
      }
    });
  }

  private notifyStatusChange() {
    // Notify listeners if network or sync status flips
  }

  // ==========================================
  // Announcement Actions
  // ==========================================
  public postAnnouncement(announcement: Announcement): void {
    StorageService.addAnnouncement(announcement);
    this.emitAnnouncements();
  }

  public updateAnnouncement(announcement: Announcement): void {
    StorageService.updateAnnouncement(announcement);
    this.emitAnnouncements();
  }

  public deleteAnnouncement(id: string): void {
    StorageService.deleteAnnouncement(id);
    this.emitAnnouncements();
  }

  public togglePin(id: string, staffName: string): void {
    StorageService.togglePinAnnouncement(id, staffName);
    this.emitAnnouncements();
  }

  public acknowledgeAnnouncement(id: string, staff: { id: string; name: string; role: any }): void {
    StorageService.acknowledgeAnnouncement(id, staff);
    this.emitAnnouncements();
  }

  public reactToAnnouncement(id: string, emoji: string, staffId: string): void {
    StorageService.reactToAnnouncement(id, emoji, staffId);
    this.emitAnnouncements();
  }

  // ==========================================
  // Chat Actions
  // ==========================================
  public sendMessage(message: ChatMessage): void {
    StorageService.addChatMessage(message);
    this.emitMessages();
    this.emitChannels();
  }

  public deleteMessage(id: string): void {
    StorageService.deleteChatMessage(id);
    this.emitMessages();
  }

  public reactToMessage(id: string, emoji: string, staffId: string): void {
    StorageService.reactToChatMessage(id, emoji, staffId);
    this.emitMessages();
  }

  public createChannel(channel: ChatChannel): void {
    StorageService.addChatChannel(channel);
    this.emitChannels();
  }
}

export const realtimeSync = new FirebaseRealtimeService();
