import { useEffect, useState, useCallback } from 'react';
import { notificationManager, Notification, NotificationSettings } from '@/lib/notificationSystem';

// Custom hook for using the notification system
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(notificationManager.getSettings());

  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = notificationManager.subscribe((newNotifications) => {
      console.log('🎣 useNotifications hook received:', newNotifications.length, 'notifications');
      setNotifications(newNotifications);
    });

    return unsubscribe;
  }, []);

  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    notificationManager.updateSettings(newSettings);
    setSettings(notificationManager.getSettings());
  }, []);

  const show = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    return notificationManager.show(notification);
  }, []);

  const dismiss = useCallback((id: string) => {
    notificationManager.dismiss(id);
  }, []);

  const markAsRead = useCallback((id: string) => {
    notificationManager.markAsRead(id);
  }, []);

  const clearAll = useCallback(() => {
    notificationManager.clearAll();
  }, []);

  // Convenience methods
  const showMessage = useCallback((title: string, message?: string, data?: Record<string, any>) => {
    return notificationManager.showMessage(title, message, data);
  }, []);

  const showSuccess = useCallback((title: string, message?: string) => {
    return notificationManager.showSuccess(title, message);
  }, []);

  const showError = useCallback((title: string, message?: string) => {
    return notificationManager.showError(title, message);
  }, []);

  const showWarning = useCallback((title: string, message?: string) => {
    return notificationManager.showWarning(title, message);
  }, []);

  const enableDesktopNotifications = useCallback(async () => {
    return await notificationManager.enableDesktopNotifications();
  }, []);

  return {
    notifications,
    settings,
    updateSettings,
    show,
    dismiss,
    markAsRead,
    clearAll,
    showMessage,
    showSuccess,
    showError,
    showWarning,
    enableDesktopNotifications
  };
}