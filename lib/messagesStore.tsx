import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { 
  SimpleConversation, 
  SimpleMessage, 
  loadConversations, 
  loadMessages, 
  sendMessage,
  markAsRead,
  deleteConversation,
  subscribeToNewMessages,
  subscribeToConversationChanges
} from './newMessagesApi';
import { supabase } from './supabaseClient';

// State types
interface MessagesState {
  conversations: SimpleConversation[];
  selectedConversationId: string | null;
  messages: SimpleMessage[];
  loading: {
    conversations: boolean;
    messages: boolean;
  };
  error: string | null;
}

// Action types
type MessagesAction = 
  | { type: 'SET_LOADING_CONVERSATIONS'; payload: boolean }
  | { type: 'SET_LOADING_MESSAGES'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONVERSATIONS'; payload: SimpleConversation[] }
  | { type: 'SET_MESSAGES'; payload: SimpleMessage[] }
  | { type: 'SET_SELECTED_CONVERSATION'; payload: string | null }
  | { type: 'ADD_CONVERSATION'; payload: SimpleConversation }
  | { type: 'UPDATE_CONVERSATION'; payload: SimpleConversation }
  | { type: 'REMOVE_CONVERSATION'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: SimpleMessage }
  | { type: 'UPDATE_CONVERSATION_UNREAD'; payload: { id: string; count: number } }
  | { type: 'RESET_STATE' };

// Initial state
const initialState: MessagesState = {
  conversations: [],
  selectedConversationId: null,
  messages: [],
  loading: {
    conversations: false,
    messages: false,
  },
  error: null,
};

// Reducer
function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case 'SET_LOADING_CONVERSATIONS':
      return { ...state, loading: { ...state.loading, conversations: action.payload } };
    
    case 'SET_LOADING_MESSAGES':
      return { ...state, loading: { ...state.loading, messages: action.payload } };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.payload, error: null };
    
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload, error: null };
    
    case 'SET_SELECTED_CONVERSATION':
      return { ...state, selectedConversationId: action.payload };
    
    case 'ADD_CONVERSATION':
      // Add new conversation and sort by last_message_at
      const newConversations = [action.payload, ...state.conversations];
      const sorted = newConversations.sort((a, b) => {
        const aTime = new Date(a.last_message_at || a.created_at).getTime();
        const bTime = new Date(b.last_message_at || b.created_at).getTime();
        return bTime - aTime;
      });
      return { ...state, conversations: sorted };
    
    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload.id ? action.payload : conv
        )
      };
    
    case 'REMOVE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.filter(conv => conv.id !== action.payload),
        selectedConversationId: state.selectedConversationId === action.payload ? null : state.selectedConversationId,
        messages: state.selectedConversationId === action.payload ? [] : state.messages
      };
    
    case 'ADD_MESSAGE':
      // Only add message if it's for the currently selected conversation
      if (action.payload.conversation_id === state.selectedConversationId) {
        // Check if message already exists (prevent duplicates)
        const exists = state.messages.some(msg => msg.id === action.payload.id);
        if (!exists) {
          const newMessages = [...state.messages, action.payload].sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          return { ...state, messages: newMessages };
        }
      }
      
      // Update conversation's last message
      return {
        ...state,
        conversations: state.conversations.map(conv => {
          if (conv.id === action.payload.conversation_id) {
            return {
              ...conv,
              last_message_text: action.payload.text,
              last_message_at: action.payload.created_at,
              unread_count: action.payload.sender === 'patient' ? conv.unread_count + 1 : conv.unread_count
            };
          }
          return conv;
        })
      };
    
    case 'UPDATE_CONVERSATION_UNREAD':
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload.id 
            ? { ...conv, unread_count: action.payload.count }
            : conv
        )
      };
    
    case 'RESET_STATE':
      return initialState;
    
    default:
      return state;
  }
}

// Context
interface MessagesContextType {
  state: MessagesState;
  actions: {
    loadAllConversations: () => Promise<void>;
    selectConversation: (id: string) => Promise<void>;
    sendMessageToConversation: (text: string) => Promise<void>;
    markConversationAsRead: (id: string) => Promise<void>;
    deleteConversationById: (id: string) => Promise<void>;
    refreshConversations: () => Promise<void>;
    refreshMessages: () => Promise<void>;
  };
}

const MessagesContext = createContext<MessagesContextType | null>(null);

// Provider component
export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(messagesReducer, initialState);
  const subscriptionsRef = useRef<(() => void)[]>([]);
  const isAuthenticatedRef = useRef(false);

  // Load conversations when authenticated
  const loadConversationsIfAuthenticated = async () => {
    if (isAuthenticatedRef.current) {
      dispatch({ type: 'SET_LOADING_CONVERSATIONS', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const conversations = await loadConversations();
        dispatch({ type: 'SET_CONVERSATIONS', payload: conversations });
        console.log(`✅ Loaded ${conversations.length} conversations`);
      } catch (error) {
        console.error('❌ Failed to load conversations:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load conversations' });
      } finally {
        dispatch({ type: 'SET_LOADING_CONVERSATIONS', payload: false });
      }
    }
  };

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        isAuthenticatedRef.current = true;
        setupSubscriptions();
        // Load initial conversations after authentication
        loadConversationsIfAuthenticated();
      } else {
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session) {
            isAuthenticatedRef.current = true;
            setupSubscriptions();
            // Load initial conversations after authentication
            loadConversationsIfAuthenticated();
            sub.subscription.unsubscribe();
          }
        });
      }
    };

    checkAuth();

    return () => {
      // Cleanup subscriptions
      subscriptionsRef.current.forEach(unsub => unsub());
    };
  }, []);

  // Setup realtime subscriptions
  const setupSubscriptions = () => {
    console.log('🔔 Setting up messaging subscriptions');

    // Subscribe to new messages
    const messageUnsub = subscribeToNewMessages((message) => {
      console.log('📨 STORE: Received new message:', {
        id: message.id,
        conversation_id: message.conversation_id?.slice(0, 8),
        sender: message.sender,
        text: message.text?.slice(0, 30),
        for_selected: message.conversation_id === state.selectedConversationId,
        current_messages_count: state.messages.length,
        current_selected: state.selectedConversationId?.slice(0, 8)
      });
      
      dispatch({ type: 'ADD_MESSAGE', payload: message });
      
      // If this message is for the selected conversation and we have no messages loaded yet,
      // load all messages for this conversation (handles race condition)
      if (message.conversation_id === state.selectedConversationId && state.messages.length === 0) {
        console.log('🔄 RACE CONDITION DETECTED: Loading messages for newly selected conversation after first message:', message.conversation_id.slice(0, 8));
        setTimeout(async () => {
          try {
            const messages = await loadMessages(message.conversation_id);
            dispatch({ type: 'SET_MESSAGES', payload: messages });
            console.log(`✅ RACE CONDITION FIX: Loaded ${messages.length} messages after race condition fix`);
          } catch (error) {
            console.error('❌ Failed to load messages after race condition:', error);
          }
        }, 500); // Small delay to ensure message is committed
      }
    });

    // Subscribe to conversation changes
    const conversationUnsub = subscribeToConversationChanges(
      (newConversation) => {
        console.log('💬 New conversation:', newConversation);
        dispatch({ type: 'ADD_CONVERSATION', payload: newConversation });
        // Auto-select if no conversation is selected, but don't load messages yet
        // Messages will be loaded via the message subscription when they arrive
        if (!state.selectedConversationId) {
          console.log('🎯 Auto-selecting new conversation (waiting for message):', newConversation.id.slice(0, 8));
          dispatch({ type: 'SET_SELECTED_CONVERSATION', payload: newConversation.id });
        }
      },
      (updatedConversation) => {
        console.log('📝 Conversation updated:', updatedConversation);
        dispatch({ type: 'UPDATE_CONVERSATION', payload: updatedConversation });
      }
    );

    subscriptionsRef.current = [messageUnsub, conversationUnsub];
  };

  // Actions
  const actions: MessagesContextType['actions'] = {
    async loadAllConversations() {
      if (!isAuthenticatedRef.current) return;
      
      dispatch({ type: 'SET_LOADING_CONVERSATIONS', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const conversations = await loadConversations();
        dispatch({ type: 'SET_CONVERSATIONS', payload: conversations });
        console.log(`✅ Loaded ${conversations.length} conversations`);
      } catch (error) {
        console.error('❌ Failed to load conversations:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load conversations' });
      } finally {
        dispatch({ type: 'SET_LOADING_CONVERSATIONS', payload: false });
      }
    },

    async selectConversation(id: string) {
      if (!isAuthenticatedRef.current) return;
      
      console.log(`📱 Selecting conversation: ${id.slice(0, 8)}`);
      dispatch({ type: 'SET_SELECTED_CONVERSATION', payload: id });
      dispatch({ type: 'SET_LOADING_MESSAGES', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const messages = await loadMessages(id);
        dispatch({ type: 'SET_MESSAGES', payload: messages });
        
        // Mark as read if conversation has unread messages
        const conversation = state.conversations.find(c => c.id === id);
        if (conversation && conversation.unread_count > 0) {
          await markAsRead(id);
          dispatch({ type: 'UPDATE_CONVERSATION_UNREAD', payload: { id, count: 0 } });
        }
        
        console.log(`✅ Loaded ${messages.length} messages for conversation`);
      } catch (error) {
        console.error('❌ Failed to load messages:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load messages' });
      } finally {
        dispatch({ type: 'SET_LOADING_MESSAGES', payload: false });
      }
    },

    async sendMessageToConversation(text: string) {
      if (!state.selectedConversationId || !isAuthenticatedRef.current) return;

      try {
        await sendMessage(state.selectedConversationId, text);
        // Message will be added via realtime subscription
        console.log('✅ Message sent successfully');
      } catch (error) {
        console.error('❌ Failed to send message:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to send message' });
        throw error;
      }
    },

    async markConversationAsRead(id: string) {
      if (!isAuthenticatedRef.current) return;
      
      try {
        await markAsRead(id);
        dispatch({ type: 'UPDATE_CONVERSATION_UNREAD', payload: { id, count: 0 } });
        console.log('✅ Conversation marked as read');
      } catch (error) {
        console.error('❌ Failed to mark as read:', error);
      }
    },

    async deleteConversationById(id: string) {
      if (!isAuthenticatedRef.current) return;
      
      try {
        await deleteConversation(id);
        dispatch({ type: 'REMOVE_CONVERSATION', payload: id });
        console.log('✅ Conversation deleted successfully');
      } catch (error) {
        console.error('❌ Failed to delete conversation:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to delete conversation' });
        throw error;
      }
    },

    async refreshConversations() {
      await actions.loadAllConversations();
    },

    async refreshMessages() {
      if (state.selectedConversationId) {
        await actions.selectConversation(state.selectedConversationId);
      }
    }
  };

  return (
    <MessagesContext.Provider value={{ state, actions }}>
      {children}
    </MessagesContext.Provider>
  );
}

// Hook to use messages context
export function useMessages() {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error('useMessages must be used within MessagesProvider');
  }
  return context;
}