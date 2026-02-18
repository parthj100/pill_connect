"use client";

import React from "react";
import { DefaultPageLayout } from "@/ui/layouts/DefaultPageLayout";
import { TextField } from "@/ui/components/TextField";
import { Avatar } from "@/ui/components/Avatar";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { IconButton } from "@/ui/components/IconButton";
import { TimelineDivider } from "@/ui/components/TimelineDivider";
import PharmacySidebar from "@/components/PharmacySidebar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { formatDateLabel, formatTime } from "@/models/messaging";
import { MessagesProvider, useMessages } from "@/lib/messagesStore";
import { SimpleConversation, SimpleMessage, sendSmsMessage } from "@/lib/newMessagesApi";

// Message component
function MessageBubble({ message }: { message: SimpleMessage }) {
  const isStaff = message.sender === "staff";
  const isSystem = message.sender === "system";
  const isAttachment = message.type === "attachment";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex mb-4 ${isStaff ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
        isStaff 
          ? "bg-blue-500 text-white" 
          : "bg-gray-200 text-gray-800"
      }`}>
        {isAttachment ? (
          message.text?.includes('http') ? (
            <img 
              src={message.text} 
              alt="Attachment" 
              className="max-w-full h-auto rounded cursor-pointer"
              onClick={() => window.open(message.text!, '_blank')}
            />
          ) : (
            <div className="text-sm">📎 {message.text}</div>
          )
        ) : (
          <div className="text-sm">{message.text}</div>
        )}
        <div className={`text-xs mt-1 ${isStaff ? "text-blue-100" : "text-gray-500"}`}>
          {formatTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}

// Conversation list item
function ConversationItem({ 
  conversation, 
  isSelected, 
  onClick 
}: { 
  conversation: SimpleConversation; 
  isSelected: boolean; 
  onClick: () => void; 
}) {
  const hasUnread = conversation.unread_count > 0;

  return (
    <div
      className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
        isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center space-x-3">
        <Avatar 
          image={conversation.patient.avatar_url || ""} 
        >
          {conversation.patient.name}
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className={`text-sm font-medium truncate ${
              hasUnread ? "font-bold text-gray-900" : "text-gray-700"
            }`}>
              {conversation.patient.name}
            </div>
            {hasUnread && (
              <Badge variant="warning">
                {conversation.unread_count}
              </Badge>
            )}
          </div>
          
          {conversation.last_message_text && (
            <div className={`text-xs mt-1 truncate ${
              hasUnread ? "text-gray-700 font-medium" : "text-gray-500"
            }`}>
              {conversation.last_message_text}
            </div>
          )}
          
          {conversation.last_message_at && (
            <div className="text-xs text-gray-400 mt-1">
              {formatDateLabel(conversation.last_message_at)}
            </div>
          )}

          {conversation.status && conversation.status !== 'new' && (
            <div className="mt-2">
              <Badge 
                variant={conversation.status === 'active' ? 'success' : 'warning'}
              >
                {conversation.status}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main messages content component
function MessagesContent() {
  const { state, actions } = useMessages();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Load conversations on mount
  useEffect(() => {
    actions.loadAllConversations();
  }, []);

  // Auto-select conversation from URL params or first conversation
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && state.conversations.some(c => c.id === conversationId)) {
      actions.selectConversation(conversationId);
    } else if (!state.selectedConversationId && state.conversations.length > 0) {
      actions.selectConversation(state.conversations[0].id);
    }
  }, [state.conversations, searchParams]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!query.trim()) return state.conversations;
    const searchTerm = query.toLowerCase();
    return state.conversations.filter(conv =>
      conv.patient.name.toLowerCase().includes(searchTerm) ||
      (conv.last_message_text && conv.last_message_text.toLowerCase().includes(searchTerm))
    );
  }, [state.conversations, query]);

  // Get selected conversation
  const selectedConversation = state.conversations.find(c => c.id === state.selectedConversationId);

  // Handle send message
  const handleSendMessage = async () => {
    if (!draft.trim() || sendingMessage || !state.selectedConversationId) return;

    setSendingMessage(true);
    try {
      await actions.sendMessageToConversation(draft.trim());
      setDraft("");
      
      // Also send via SMS
      try {
        await sendSmsMessage(state.selectedConversationId, draft.trim());
      } catch (smsError) {
        console.warn('SMS sending failed, but message was saved to database:', smsError);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  // Handle key press in message input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Group messages by date for display
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: SimpleMessage[] }[] = [];
    let currentDate = "";
    let currentGroup: SimpleMessage[] = [];

    for (const message of state.messages) {
      const messageDate = formatDateLabel(message.created_at);
      
      if (messageDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, messages: currentGroup });
        }
        currentDate = messageDate;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, messages: currentGroup });
    }

    return groups;
  }, [state.messages]);

  return (
    <DefaultPageLayout className="flex flex-col h-screen">
      <div className="flex flex-1 overflow-hidden">
        {/* Conversations List */}
        <div className="w-80 border-r bg-white flex flex-col">
          {/* Search Bar */}
          <div className="p-4 border-b">
            <TextField className="h-auto w-full" variant="filled" label="" helpText="">
              <TextField.Input
                placeholder="Search conversations..."
                value={query}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              />
            </TextField>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {state.loading.conversations ? (
              <div className="flex justify-center items-center py-8">
                <div>Loading conversations...</div>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex justify-center items-center py-8 text-gray-500">
                {query.trim() ? 'No conversations found' : 'No conversations yet'}
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={conversation.id === state.selectedConversationId}
                  onClick={() => actions.selectConversation(conversation.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b bg-white flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Avatar 
                    image={selectedConversation.patient.avatar_url || ""}
                  >
                    {selectedConversation.patient.name}
                  </Avatar>
                  <div>
                    <div className="font-medium text-gray-900">
                      {selectedConversation.patient.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {selectedConversation.patient.contact_type || 'Patient'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="neutral-secondary"
                    onClick={() => navigate(`/contacts/${selectedConversation.patient.slug}`)}
                  >
                    View Profile
                  </Button>
                  <Button
                    variant="destructive-primary"
                    onClick={async () => {
                      if (confirm('Are you sure you want to delete this conversation? This cannot be undone.')) {
                        try {
                          await actions.deleteConversationById(selectedConversation.id);
                        } catch (error) {
                          console.error('Failed to delete conversation:', error);
                        }
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                {state.loading.messages ? (
                  <div className="flex justify-center items-center h-full">
                    <div>Loading messages...</div>
                  </div>
                ) : state.messages.length === 0 ? (
                  <div className="flex justify-center items-center h-full text-gray-500">
                    No messages yet. Start a conversation!
                  </div>
                ) : (
                  <>
                    {groupedMessages.map((group, groupIndex) => (
                      <div key={groupIndex}>
                        {/* Date divider */}
                        <TimelineDivider>{group.date}</TimelineDivider>
                        
                        {/* Messages for this date */}
                        {group.messages.map((message) => (
                          <MessageBubble key={message.id} message={message} />
                        ))}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t bg-white">
                <div className="flex space-x-2">
                  <TextField className="flex-1" variant="filled" label="" helpText="">
                    <TextField.Input
                      placeholder="Type a message..."
                      value={draft}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
                      onKeyDown={handleKeyPress}
                    />
                  </TextField>
                  <Button 
                    onClick={handleSendMessage}
                    disabled={!draft.trim() || sendingMessage}
                  >
                    {sendingMessage ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* No conversation selected */
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>

      {/* Error Toast */}
      {state.error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <span>{state.error}</span>
            <button 
              onClick={() => {/* Clear error */}}
              className="ml-4 text-white hover:text-gray-200"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </DefaultPageLayout>
  );
}

// Main component with provider
export default function NewMessages() {
  return (
    <MessagesProvider>
      <MessagesContent />
    </MessagesProvider>
  );
}