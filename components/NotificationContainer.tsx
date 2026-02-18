"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/ui/components/Button';
import { IconButton } from '@/ui/components/IconButton';
import { useNotifications } from '@/hooks/useNotifications';
import { Notification, NotificationType } from '@/lib/notificationSystem';
import { 
  FeatherX, 
  FeatherCheck, 
  FeatherAlertTriangle, 
  FeatherInfo, 
  FeatherMessageSquare,
  FeatherRadio,
  FeatherSettings,
  FeatherBell
} from '@subframe/core';

// Icon mapping for notification types
const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  message: <FeatherMessageSquare />,
  success: <FeatherCheck />,
  error: <FeatherAlertTriangle />,
  warning: <FeatherAlertTriangle />,
  info: <FeatherInfo />,
  broadcast: <FeatherRadio />,
  system: <FeatherSettings />
};

// Color classes for notification types
const TYPE_STYLES: Record<NotificationType, {
  container: string;
  icon: string;
  title: string;
  progress: string;
}> = {
  message: {
    container: 'bg-brand-50 border-brand-200 shadow-brand-100/50',
    icon: 'text-brand-600',
    title: 'text-brand-800',
    progress: 'bg-brand-500'
  },
  success: {
    container: 'bg-success-50 border-success-200 shadow-success-100/50',
    icon: 'text-success-600',
    title: 'text-success-800',
    progress: 'bg-success-500'
  },
  error: {
    container: 'bg-error-50 border-error-200 shadow-error-100/50',
    icon: 'text-error-600',
    title: 'text-error-800',
    progress: 'bg-error-500'
  },
  warning: {
    container: 'bg-warning-50 border-warning-200 shadow-warning-100/50',
    icon: 'text-warning-600',
    title: 'text-warning-800',
    progress: 'bg-warning-500'
  },
  info: {
    container: 'bg-neutral-50 border-neutral-200 shadow-neutral-100/50',
    icon: 'text-neutral-600',
    title: 'text-neutral-800',
    progress: 'bg-neutral-500'
  },
  broadcast: {
    container: 'bg-purple-50 border-purple-200 shadow-purple-100/50',
    icon: 'text-purple-600',
    title: 'text-purple-800',
    progress: 'bg-purple-500'
  },
  system: {
    container: 'bg-neutral-50 border-neutral-200 shadow-neutral-100/50',
    icon: 'text-neutral-600',
    title: 'text-neutral-800',
    progress: 'bg-neutral-500'
  }
};

interface NotificationItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
}

function NotificationItem({ notification, onDismiss, onMarkRead }: NotificationItemProps) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  const styles = TYPE_STYLES[notification.type];

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!notification.duration || notification.duration <= 0) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, notification.duration! - elapsed);
      const progressPercent = (remaining / notification.duration!) * 100;
      
      setProgress(progressPercent);
      
      if (remaining <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [notification.duration]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 200); // Allow animation to complete
  };

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
    
    // Handle notification-specific actions
    if (notification.type === 'message' && notification.data?.conversationId) {
      // Could navigate to conversation
      window.dispatchEvent(new CustomEvent('notification-navigate', {
        detail: { 
          type: 'conversation',
          id: notification.data.conversationId 
        }
      }));
    }
  };

  const handleActionClick = (action: any) => {
    action.handler(notification);
  };

  return (
    <div
      className={`
        notification-item
        relative overflow-hidden rounded-lg border shadow-lg transition-all duration-300 ease-out cursor-pointer
        ${styles.container}
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${isExiting ? 'translate-x-full opacity-0 scale-95' : ''}
        ${notification.read ? 'opacity-75' : ''}
        hover:scale-[1.02] hover:shadow-xl
        w-96 max-w-[95vw]
      `}
      onClick={handleClick}
      role="alert"
      aria-live={notification.priority === 'urgent' ? 'assertive' : 'polite'}
      aria-labelledby={`notification-${notification.id}-title`}
      aria-describedby={notification.message ? `notification-${notification.id}-message` : undefined}
    >
      {/* Progress bar for auto-dismiss */}
      {notification.duration && notification.duration > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-black/10 rounded-t-lg overflow-hidden">
          <div 
            className={`h-full transition-all duration-75 ease-linear ${styles.progress}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Priority indicator */}
      {notification.priority === 'urgent' && (
        <div className="absolute top-3 right-3 w-2 h-2 bg-error-500 rounded-full animate-pulse" />
      )}

      <div className="p-5 pt-6">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 ${styles.icon} mt-0.5`}>
            {TYPE_ICONS[notification.type]}
          </div>

          {/* Content */}
          <div className="flex-grow min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 
                id={`notification-${notification.id}-title`}
                className={`font-medium text-sm leading-tight ${styles.title} ${notification.read ? 'opacity-75' : ''} break-words`}
              >
                {notification.title}
              </h4>
              
              <IconButton
                size="small"
                variant="neutral-tertiary"
                icon={<FeatherX />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismiss();
                }}
                aria-label="Dismiss notification"
                className="opacity-70 hover:opacity-100 -mt-1 -mr-1"
              />
            </div>

            {notification.message && (
              <p 
                id={`notification-${notification.id}-message`}
                className="text-sm text-neutral-700 mt-1 leading-relaxed break-words"
              >
                {notification.message}
              </p>
            )}

            {/* Actions */}
            {notification.actions && notification.actions.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                {notification.actions.map((action) => (
                  <Button
                    key={action.id}
                    size="small"
                    variant={
                      action.style === 'primary' ? 'brand-tertiary' :
                      action.style === 'destructive' ? 'destructive-tertiary' :
                      'neutral-tertiary'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActionClick(action);
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-neutral-500 mt-2 text-right">
          {new Date(notification.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

interface NotificationContainerProps {
  className?: string;
}

export function NotificationContainer({ className }: NotificationContainerProps) {
  const { notifications, settings, dismiss, markAsRead } = useNotifications();

  // Debug logging
  console.log('🎭 NotificationContainer render:', {
    notificationCount: notifications.length,
    notifications: notifications.map(n => ({ id: n.id, title: n.title, dismissed: n.dismissed })),
    settings
  });

  // Position classes based on settings
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2'
  };

  const containerClasses = positionClasses[settings.position];

  if (notifications.length === 0) return null;

  return (
    <div 
      className={`
        fixed z-[9999] pointer-events-none
        ${containerClasses}
        ${className || ''}
      `}
      aria-live="polite"
      aria-label="Notifications"
    >
      <div className="flex flex-col gap-4 pointer-events-auto">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onDismiss={dismiss}
            onMarkRead={markAsRead}
          />
        ))}
      </div>
    </div>
  );
}