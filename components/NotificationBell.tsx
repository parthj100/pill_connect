"use client";

import React, { useState, useEffect } from 'react';
import { IconButton } from '@/ui/components/IconButton';
import { Badge } from '@/ui/components/Badge';
import { Button } from '@/ui/components/Button';
import { useNotifications } from '@/hooks/useNotifications';
import { Notification } from '@/lib/notificationSystem';
import { 
  FeatherBell, 
  FeatherBellOff, 
  FeatherMessageSquare,
  FeatherCheck,
  FeatherAlertTriangle,
  FeatherInfo,
  FeatherRadio,
  FeatherSettings,
  FeatherX,
  FeatherCheckCheck
} from '@subframe/core';

interface NotificationBellProps {
  className?: string;
  showText?: boolean;
}

export function NotificationBell({ className, showText = false }: NotificationBellProps) {
  const { 
    notifications, 
    settings, 
    dismiss, 
    markAsRead, 
    clearAll,
    enableDesktopNotifications 
  } = useNotifications();
  
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;
  const totalCount = notifications.length;

  // Animate bell when new notifications arrive
  useEffect(() => {
    if (unreadCount > 0) {
      setHasNewNotifications(true);
      const timer = setTimeout(() => setHasNewNotifications(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isOpen && !target.closest('[data-notification-bell]')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  const handleBellClick = () => {
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    // Handle navigation based on notification type
    if (notification.type === 'message' && notification.data?.conversationId) {
      window.dispatchEvent(new CustomEvent('notification-navigate', {
        detail: { 
          type: 'conversation',
          id: notification.data.conversationId 
        }
      }));
    }
    
    setIsOpen(false);
  };

  const handleMarkAllRead = () => {
    notifications.forEach(n => {
      if (!n.read) markAsRead(n.id);
    });
  };

  const handleClearAll = () => {
    clearAll();
    setIsOpen(false);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'message': return <FeatherMessageSquare className="w-4 h-4" />;
      case 'success': return <FeatherCheck className="w-4 h-4" />;
      case 'error': case 'warning': return <FeatherAlertTriangle className="w-4 h-4" />;
      case 'broadcast': return <FeatherRadio className="w-4 h-4" />;
      case 'system': return <FeatherSettings className="w-4 h-4" />;
      default: return <FeatherInfo className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'message': return 'text-brand-600';
      case 'success': return 'text-success-600';
      case 'error': return 'text-error-600';
      case 'warning': return 'text-warning-600';
      case 'broadcast': return 'text-purple-600';
      case 'system': return 'text-neutral-600';
      default: return 'text-neutral-600';
    }
  };

  return (
    <div className={`relative inline-block ${className || ''}`} data-notification-bell>
      {/* Bell Button */}
      <div className="relative">
        <IconButton
          size={showText ? "medium" : "small"}
          variant="neutral-tertiary"
          icon={settings.enabled ? <FeatherBell /> : <FeatherBellOff />}
          onClick={handleBellClick}
          className={`
            transition-all duration-200
            ${hasNewNotifications ? 'animate-pulse' : ''}
            ${isOpen ? 'bg-brand-100 text-brand-700' : ''}
            ${unreadCount > 0 ? 'text-brand-600' : ''}
          `}
          aria-label={`Notifications (${unreadCount} unread)`}
        />
        
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-error-600 text-white text-xs font-medium flex items-center justify-center animate-in zoom-in-75">
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}

        {/* New notification indicator */}
        {hasNewNotifications && (
          <div className="absolute top-0 right-0 w-2 h-2 bg-brand-500 rounded-full animate-ping" />
        )}
      </div>

      {/* Text Label (optional) */}
      {showText && (
        <span className="ml-2 text-body text-default-font">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-1 text-brand-600 font-medium">({unreadCount})</span>
          )}
        </span>
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div 
          className="fixed w-80 bg-default-background border border-neutral-200 rounded-lg shadow-lg z-[100] animate-in slide-in-from-bottom-2 duration-200"
          style={{
            right: '16px',
            bottom: '72px'
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="font-medium text-default-font">
              Notifications
              {totalCount > 0 && (
                <span className="ml-1 text-neutral-500 text-sm">({totalCount})</span>
              )}
            </h3>
            
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  size="small"
                  variant="neutral-tertiary"
                  onClick={handleMarkAllRead}
                  className="text-xs"
                >
                  Mark all read
                </Button>
              )}
              
              {totalCount > 0 && (
                <IconButton
                  size="small"
                  variant="neutral-tertiary"
                  icon={<FeatherX />}
                  onClick={handleClearAll}
                  aria-label="Clear all notifications"
                />
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-neutral-500">
                <FeatherCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>All caught up!</p>
                <p className="text-sm">No new notifications</p>
              </div>
            ) : (
              <div className="py-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`
                      px-4 py-3 border-b border-neutral-100 last:border-b-0 cursor-pointer transition-colors
                      ${notification.read ? 'opacity-60' : 'bg-brand-25'}
                      hover:bg-neutral-50
                    `}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Type Icon */}
                      <div className={`mt-0.5 ${getNotificationColor(notification.type)}`}>
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-grow min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium ${notification.read ? 'text-neutral-600' : 'text-default-font'}`}>
                            {notification.title}
                          </p>
                          
                          <div className="flex items-center gap-2">
                            {!notification.read && (
                              <div className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0" />
                            )}
                            
                            <IconButton
                              size="small"
                              variant="neutral-tertiary"
                              icon={<FeatherX />}
                              onClick={(e) => {
                                e.stopPropagation();
                                dismiss(notification.id);
                              }}
                              aria-label="Dismiss notification"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        </div>

                        {notification.message && (
                          <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                            {notification.message}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-neutral-500">
                            {new Date(notification.timestamp).toLocaleTimeString()}
                          </span>
                          
                          {notification.priority === 'urgent' && (
                            <Badge variant="error" className="text-xs">Urgent</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-25">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {!settings.desktop && (
                  <Button
                    size="small"
                    variant="brand-tertiary"
                    onClick={enableDesktopNotifications}
                    className="text-xs"
                  >
                    Enable Desktop
                  </Button>
                )}
              </div>
              
              <span className="text-neutral-500 text-xs">
                {settings.enabled ? 'Notifications enabled' : 'Notifications disabled'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}