// Enhanced Notification System
// Manages all notifications across the entire application

export type NotificationType = 
  | 'message' // New message received
  | 'success' // Operation succeeded
  | 'error'   // Error occurred  
  | 'warning' // Warning message
  | 'info'    // Information
  | 'broadcast' // Broadcast sent/received
  | 'system'; // System notifications

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationSound {
  id: string;
  name: string;
  url: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message?: string;
  timestamp: number;
  duration?: number; // Auto-dismiss after ms (0 = persistent)
  sound?: NotificationSound;
  actions?: NotificationAction[];
  data?: Record<string, any>; // Additional data
  read?: boolean;
  dismissed?: boolean;
}

export interface NotificationAction {
  id: string;
  label: string;
  style: 'primary' | 'secondary' | 'destructive';
  handler: (notification: Notification) => void;
}

export interface NotificationSettings {
  enabled: boolean;
  sounds: boolean;
  desktop: boolean;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxVisible: number;
  defaultDuration: number;
  soundsByType: Partial<Record<NotificationType, NotificationSound | null>>;
}

// Notification Sounds
export const NOTIFICATION_SOUNDS: Record<string, NotificationSound> = {
  MESSAGE_RECEIVED: {
    id: 'message_received',
    name: 'Message Received',
    url: '/sounds/message-received.mp3'
  },
  SUCCESS: {
    id: 'success',
    name: 'Success',
    url: '/sounds/success.mp3'
  },
  ERROR: {
    id: 'error',
    name: 'Error',
    url: '/sounds/error.mp3'
  },
  WARNING: {
    id: 'warning',
    name: 'Warning',
    url: '/sounds/warning.mp3'
  },
  SUBTLE: {
    id: 'subtle',
    name: 'Subtle Notification',
    url: '/sounds/subtle.mp3'
  }
};

// Default Settings
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  sounds: false, // Disabled by default
  desktop: false, // Browser permission required
  position: 'top-right',
  maxVisible: 5,
  defaultDuration: 5000, // 5 seconds
  soundsByType: {
    message: null, // No sounds
    success: null,
    error: null,
    warning: null,
    info: null,
    broadcast: null,
    system: null,
  }
};

// Global notification state management
class NotificationManager {
  private notifications: Map<string, Notification> = new Map();
  private listeners: Set<(notifications: Notification[]) => void> = new Set();
  private settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
  private audioContext: AudioContext | null = null;
  private loadedSounds: Map<string, AudioBuffer> = new Map();

  constructor() {
    this.loadSettings();
    // Audio disabled by default
    // this.initializeAudio();
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem('pill_connect_notification_settings');
      if (saved) {
        this.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.warn('Failed to load notification settings:', error);
    }
  }

  private saveSettings() {
    try {
      localStorage.setItem('pill_connect_notification_settings', JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Failed to save notification settings:', error);
    }
  }

  private async initializeAudio() {
    if (!this.settings.sounds) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Preload common sounds
      const soundsToPreload = [
        NOTIFICATION_SOUNDS.MESSAGE_RECEIVED,
        NOTIFICATION_SOUNDS.SUCCESS,
        NOTIFICATION_SOUNDS.ERROR
      ];

      for (const sound of soundsToPreload) {
        try {
          const response = await fetch(sound.url);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          this.loadedSounds.set(sound.id, audioBuffer);
        } catch (error) {
          console.warn(`Failed to preload sound ${sound.id}:`, error);
        }
      }
    } catch (error) {
      console.warn('Audio initialization failed:', error);
      this.audioContext = null;
    }
  }

  private async playSound(sound: NotificationSound) {
    if (!this.settings.sounds || !this.audioContext) return;

    try {
      let audioBuffer = this.loadedSounds.get(sound.id);
      
      if (!audioBuffer) {
        // Load sound on-demand
        const response = await fetch(sound.url);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.loadedSounds.set(sound.id, audioBuffer);
      }

      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();
      
      source.buffer = audioBuffer;
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Set volume (0.0 to 1.0)
      gainNode.gain.value = 0.3;
      
      source.start(0);
    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }

  private notifyListeners() {
    const visibleNotifications = this.getVisibleNotifications();
      
    console.log('🔔 NotificationManager notifyListeners:', {
      totalNotifications: this.notifications.size,
      visibleNotifications: visibleNotifications.length,
      listeners: this.listeners.size,
      visibleIds: visibleNotifications.map(n => n.id)
    });
      
    this.listeners.forEach(listener => {
      try {
        listener(visibleNotifications);
      } catch (error) {
        console.error('Notification listener error:', error);
      }
    });
  }

  private async requestDesktopPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    
    if (Notification.permission === 'granted') return true;
    
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    
    return false;
  }

  private showDesktopNotification(notification: Notification) {
    if (!this.settings.desktop || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const desktopNotification = new Notification(notification.title, {
      body: notification.message,
      icon: '/icons/pill-connect-logo.png', // Add app icon
      badge: '/icons/pill-connect-badge.png',
      tag: notification.id, // Prevent duplicates
      requireInteraction: notification.priority === 'urgent',
      silent: !this.settings.sounds
    });

    desktopNotification.onclick = () => {
      window.focus();
      desktopNotification.close();
      
      // Handle notification click (e.g., navigate to messages)
      if (notification.type === 'message' && notification.data?.conversationId) {
        // Could dispatch a custom event here
        window.dispatchEvent(new CustomEvent('notification-click', { 
          detail: notification 
        }));
      }
    };

    // Auto-close desktop notification
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        desktopNotification.close();
      }, notification.duration);
    }
  }

  // Public API
  public show(notificationData: Omit<Notification, 'id' | 'timestamp'>): string {
    if (!this.settings.enabled) return '';

    const notification: Notification = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      duration: notificationData.duration ?? this.settings.defaultDuration,
      read: false,
      dismissed: false,
      ...notificationData
    };

    // Sound effects disabled
    // const sound = notification.sound || this.settings.soundsByType[notification.type];
    // if (sound && this.settings.sounds) {
    //   this.playSound(sound);
    // }

    // Show desktop notification
    this.showDesktopNotification(notification);

    // Add to internal store
    this.notifications.set(notification.id, notification);

    // Auto-dismiss if duration is set
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        this.dismiss(notification.id);
      }, notification.duration);
    }

    this.notifyListeners();
    return notification.id;
  }

  public dismiss(id: string) {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.dismissed = true;
      this.notifications.delete(id);
      this.notifyListeners();
    }
  }

  public markAsRead(id: string) {
    const notification = this.notifications.get(id);
    if (notification && !notification.read) {
      notification.read = true;
      this.notifyListeners();
    }
  }

  public getVisibleNotifications(): Notification[] {
    const allNotifications = Array.from(this.notifications.values());
    const visibleNotifications = allNotifications
      .filter(n => !n.dismissed)
      .sort((a, b) => {
        // Sort by priority first, then by timestamp
        const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.timestamp - a.timestamp;
      })
      .slice(0, this.settings.maxVisible);
      
    console.log('📋 getVisibleNotifications:', {
      totalNotifications: allNotifications.length,
      visibleNotifications: visibleNotifications.length,
      maxVisible: this.settings.maxVisible,
      allIds: allNotifications.map(n => n.id),
      visibleIds: visibleNotifications.map(n => n.id)
    });
    
    return visibleNotifications;
  }

  public clearAll() {
    this.notifications.clear();
    this.notifyListeners();
  }

  public subscribe(listener: (notifications: Notification[]) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current notifications
    listener(this.getVisibleNotifications());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  public updateSettings(newSettings: Partial<NotificationSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    
    if (newSettings.sounds !== undefined) {
      if (newSettings.sounds && !this.audioContext) {
        this.initializeAudio();
      }
    }
  }

  public getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  public async enableDesktopNotifications(): Promise<boolean> {
    const granted = await this.requestDesktopPermission();
    if (granted) {
      this.updateSettings({ desktop: true });
    }
    return granted;
  }

  // Convenience methods for common notification types
  public showMessage(title: string, message?: string, data?: Record<string, any>) {
    return this.show({
      type: 'message',
      priority: 'high',
      title,
      message,
      data,
      duration: 0 // Persistent for messages
    });
  }

  public showSuccess(title: string, message?: string) {
    return this.show({
      type: 'success',
      priority: 'normal',
      title,
      message,
      duration: 3000
    });
  }

  public showError(title: string, message?: string) {
    return this.show({
      type: 'error',
      priority: 'high',
      title,
      message,
      duration: 0 // Persistent for errors
    });
  }

  public showWarning(title: string, message?: string) {
    return this.show({
      type: 'warning',
      priority: 'normal',
      title,
      message,
      duration: 5000
    });
  }
}

// Export singleton instance
export const notificationManager = new NotificationManager();

// React hook for using notifications
export { notificationManager as notifications };