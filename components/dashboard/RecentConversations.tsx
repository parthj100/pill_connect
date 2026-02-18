"use client";

import React from "react";
import { Avatar } from "@/ui/components/Avatar";
import { Badge } from "@/ui/components/Badge";
import { useNavigate } from "react-router-dom";
import { ConversationWithParticipants } from "@/lib/messagesApi";

interface RecentConversationsProps {
  conversations: ConversationWithParticipants[];
  isLoading?: boolean;
  className?: string;
}

export function RecentConversations({ conversations, isLoading, className }: RecentConversationsProps) {
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
      <div className={`flex w-full flex-col items-start gap-4 ${className || ''}`}>
        <div className="flex w-full items-center justify-between">
          <span className="text-heading-2 font-heading-2 text-default-font">Recent Conversations</span>
        </div>
        <div className="flex w-full items-start gap-4 pb-4 overflow-x-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-4 py-4 shadow-sm min-w-[240px] animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neutral-200 rounded-full"></div>
                <div className="flex flex-col items-start gap-1">
                  <div className="w-24 h-4 bg-neutral-200 rounded"></div>
                  <div className="w-16 h-3 bg-neutral-200 rounded"></div>
                </div>
              </div>
              <div className="w-12 h-6 bg-neutral-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full flex-col items-start gap-4 ${className || ''}`} role="region" aria-label="Recent conversations">
      <div className="flex w-full items-center justify-between">
        <h2 className="text-heading-2 font-heading-2 text-default-font">Recent Conversations</h2>
      </div>
      <div className="flex w-full items-start gap-4 pb-4 overflow-x-auto">
        {conversations.map((conversation) => {
          const name = conversation.patient?.name || conversation.participants?.[0]?.name || 'Conversation';
          const when = new Date(conversation.created_at).toLocaleString();
          const hasUnread = (conversation.unread_count ?? 0) > 0;

          return (
            <div
              key={conversation.id}
              className="flex flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background px-4 py-4 shadow-sm min-w-[240px] cursor-pointer hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              onClick={() => handleConversationClick(conversation.id)}
              onKeyDown={(e) => handleKeyDown(e, conversation.id)}
              tabIndex={0}
              role="button"
              aria-label={`Open conversation with ${name}, last activity ${when}${hasUnread ? ', has unread messages' : ''}`}
            >
              <div className="flex items-center gap-3">
                <Avatar aria-hidden="true">
                  {name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                </Avatar>
                <div className="flex flex-col items-start">
                  <span className="text-body-bold font-body-bold text-default-font">{name}</span>
                  <span className="text-caption font-caption text-subtext-color">{when}</span>
                </div>
              </div>
              {hasUnread ? (
                <Badge variant="warning" aria-label="Has unread messages">Unread</Badge>
              ) : (
                <Badge variant="neutral" aria-label="New conversation">New</Badge>
              )}
            </div>
          );
        })}
        {conversations.length === 0 && (
          <div className="text-subtext-color" role="status" aria-live="polite">
            No conversations yet.
          </div>
        )}
      </div>
    </div>
  );
}