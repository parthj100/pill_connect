"use client";

import React from "react";
import { Badge } from "@/ui/components/Badge";
import { useNavigate } from "react-router-dom";
import { ConversationWithParticipants } from "@/lib/messagesApi";

interface UnreadConversationsProps {
  conversations: ConversationWithParticipants[];
  unreadCount: number;
  isLoading?: boolean;
  className?: string;
}

export function UnreadConversations({ conversations, unreadCount, isLoading, className }: UnreadConversationsProps) {
  const navigate = useNavigate();

  const handleConversationClick = (conversationId: string) => {
    try { 
      localStorage.setItem('pc_last_selected_conversation', conversationId); 
    } catch (error) {
      console.error('Failed to save conversation to localStorage:', error);
    }
    navigate('/messages');
  };

  const handleKeyDown = (event: React.KeyboardEvent, conversationId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleConversationClick(conversationId);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex w-full flex-col items-start gap-6 rounded-md border border-solid border-neutral-border bg-default-background px-8 py-8 shadow-sm ${className || ''}`}>
        <div className="flex w-full items-center justify-between">
          <span className="text-heading-2 font-heading-2 text-default-font">Unread Conversations</span>
          <div className="w-8 h-6 bg-neutral-200 rounded animate-pulse"></div>
        </div>
        <div className="flex w-full items-start gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-md border border-solid border-neutral-border bg-default-background px-4 py-4 shadow-sm min-w-[240px] animate-pulse">
              <div className="w-24 h-4 bg-neutral-200 rounded mb-2"></div>
              <div className="w-16 h-3 bg-neutral-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`flex w-full flex-col items-start gap-6 rounded-md border border-solid border-neutral-border bg-default-background px-8 py-8 shadow-sm ${className || ''}`}
      role="region"
      aria-label="Unread conversations"
    >
      <div className="flex w-full items-center justify-between">
        <h2 className="text-heading-2 font-heading-2 text-default-font">Unread Conversations</h2>
        <Badge 
          variant={unreadCount > 0 ? 'warning' : 'neutral'}
          aria-label={`${unreadCount} unread ${unreadCount === 1 ? 'conversation' : 'conversations'}`}
        >
          {unreadCount}
        </Badge>
      </div>
      <div className="flex w-full items-start gap-4">
        {conversations.map((conversation) => {
          const name = conversation.patient?.name || conversation.participants?.[0]?.name || 'Conversation';
          const unreadText = conversation.unread_count === 1 ? '1 unread message' : `${conversation.unread_count} unread messages`;

          return (
            <div
              key={conversation.id}
              className="rounded-md border border-solid border-neutral-border bg-default-background px-4 py-4 shadow-sm min-w-[240px] cursor-pointer hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              onClick={() => handleConversationClick(conversation.id)}
              onKeyDown={(e) => handleKeyDown(e, conversation.id)}
              tabIndex={0}
              role="button"
              aria-label={`Open conversation with ${name}, ${unreadText}`}
            >
              <div className="text-body-bold font-body-bold text-default-font">{name}</div>
              <div className="text-caption text-subtext-color">
                {conversation.unread_count === 1 ? 'Unread' : `${conversation.unread_count} Unread`}
              </div>
            </div>
          );
        })}
        {conversations.length === 0 && (
          <div className="text-subtext-color" role="status" aria-live="polite">
            No unread conversations.
          </div>
        )}
      </div>
    </div>
  );
}