import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import * as FileSystem from 'expo-file-system';

export interface Contact {
  id: string;
  username: string;
  publicKey?: string;
  profilePicture?: string;
  connectedAt: string;
  lastSeen?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactPicture?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  expiresAt: string;
  agreedDuration: string;
  isActive: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: string;
  type: 'text' | 'image' | 'video';
  status: 'sent' | 'delivered' | 'read';
  mediaUri?: string;
}

const CONTACTS_KEY = 'presence_contacts';
const CONVERSATIONS_KEY = 'presence_conversations';
const MESSAGES_KEY = 'presence_messages';

export const [ContactsProvider, useContacts] = createContextHook(() => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const contactsQuery = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(CONTACTS_KEY);
      return stored ? (JSON.parse(stored) as Contact[]) : [];
    },
  });

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(CONVERSATIONS_KEY);
      return stored ? (JSON.parse(stored) as Conversation[]) : [];
    },
  });

  const messagesQuery = useQuery({
    queryKey: ['messages'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(MESSAGES_KEY);
      return stored ? (JSON.parse(stored) as Message[]) : [];
    },
  });

  const saveContactsMutation = useMutation({
    mutationFn: async (data: Contact[]) => {
      await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(data));
      return data;
    },
  });

  const saveConversationsMutation = useMutation({
    mutationFn: async (data: Conversation[]) => {
      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(data));
      return data;
    },
  });

  const saveMessagesMutation = useMutation({
    mutationFn: async (data: Message[]) => {
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(data));
      return data;
    },
  });

  useEffect(() => {
    if (contactsQuery.data) setContacts(contactsQuery.data);
  }, [contactsQuery.data]);

  useEffect(() => {
    if (conversationsQuery.data) setConversations(conversationsQuery.data);
  }, [conversationsQuery.data]);

  useEffect(() => {
    if (messagesQuery.data) setMessages(messagesQuery.data);
  }, [messagesQuery.data]);

  const addContact = useCallback((contact: Contact, agreedDuration = '7 days', expiresAt?: string) => {
    if (contacts.find(c => c.id === contact.id)) return;
    const updated = [...contacts, contact];
    setContacts(updated);
    saveContactsMutation.mutate(updated);
    console.log('[Contacts] Added contact:', contact.username);

    const conv: Conversation = {
      id: `conv_${Date.now()}`,
      contactId: contact.id,
      contactName: contact.username,
      contactPicture: contact.profilePicture,
      lastMessage: 'Connected via NFC',
      lastMessageTime: new Date().toISOString(),
      unreadCount: 0,
      expiresAt: expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      agreedDuration: agreedDuration,
      isActive: true,
    };
    const updatedConvs = [...conversations, conv];
    setConversations(updatedConvs);
    saveConversationsMutation.mutate(updatedConvs);

    return conv;
  }, [contacts, conversations, saveContactsMutation, saveConversationsMutation]);

  const removeContact = useCallback((contactId: string) => {
    const updatedContacts = contacts.filter((c) => c.id !== contactId);
    setContacts(updatedContacts);
    saveContactsMutation.mutate(updatedContacts);

    const updatedConvs = conversations.filter((c) => c.contactId !== contactId);
    setConversations(updatedConvs);
    saveConversationsMutation.mutate(updatedConvs);

    const convIds = conversations.filter((c) => c.contactId === contactId).map((c) => c.id);
    const updatedMsgs = messages.filter((m) => !convIds.includes(m.conversationId));
    setMessages(updatedMsgs);
    saveMessagesMutation.mutate(updatedMsgs);

    console.log('[Contacts] Removed contact:', contactId);
  }, [contacts, conversations, messages, saveContactsMutation, saveConversationsMutation, saveMessagesMutation]);

  const sendMessage = useCallback((conversationId: string, text: string, senderId: string, type: 'text'|'image'|'video' = 'text', mediaUri?: string) => {
    const msg: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId,
      senderId,
      text,
      timestamp: new Date().toISOString(),
      type,
      mediaUri,
      status: 'sent',
    };

    const updatedMsgs = [...messages, msg];
    setMessages(updatedMsgs);
    saveMessagesMutation.mutate(updatedMsgs);

    const updatedConvs = conversations.map((c) =>
      c.id === conversationId
        ? { ...c, lastMessage: text, lastMessageTime: msg.timestamp }
        : c
    );
    setConversations(updatedConvs);
    saveConversationsMutation.mutate(updatedConvs);

    console.log('[Messages] Sent message in:', conversationId);
    return msg;
  }, [messages, conversations, saveMessagesMutation, saveConversationsMutation]);

  const getConversationMessages = useCallback((conversationId: string) => {
    return messages.filter((m) => m.conversationId === conversationId);
  }, [messages]);

  const getConversation = useCallback((conversationId: string) => {
    return conversations.find((c) => c.id === conversationId);
  }, [conversations]);

  const markAsRead = useCallback((conversationId: string) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || conv.unreadCount === 0) return;
    const updatedConvs = conversations.map((c) =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c
    );
    setConversations(updatedConvs);
    saveConversationsMutation.mutate(updatedConvs);
  }, [conversations, saveConversationsMutation]);

  const receiveMessage = useCallback(async (fromUserId: string, text: string) => {
    const contact = contacts.find(c => c.id === fromUserId);
    if (!contact) return;
    const conv = conversations.find(c => c.contactId === contact.id && c.isActive);
    if (!conv) return;

    // Detect incoming image payload sent by the chat screen
    const isImage = text.startsWith('__img__:');
    let displayText = text;
    let mediaUri: string | undefined;
    let msgType: 'text' | 'image' = 'text';

    if (isImage) {
      try {
        const base64Data = text.slice('__img__:'.length);
        // Write to a persistent cache file so the Image component can load it
        const dir = `${FileSystem.cacheDirectory}presence_imgs/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        const filePath = `${dir}${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(filePath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        mediaUri = filePath;
        displayText = '[Image]';
        msgType = 'image';
      } catch (e) {
        console.warn('[ContactsContext] Failed to decode received image:', e);
        displayText = '[Image — could not decode]';
      }
    }

    const msg: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId: conv.id,
      senderId: fromUserId,
      text: displayText,
      timestamp: new Date().toISOString(),
      type: msgType,
      mediaUri,
      status: 'delivered',
    };
    const updatedMsgs = [...messages, msg];
    setMessages(updatedMsgs);
    saveMessagesMutation.mutate(updatedMsgs);
    const updatedConvs = conversations.map(c =>
      c.id === conv.id
        ? { ...c, lastMessage: displayText, lastMessageTime: msg.timestamp, unreadCount: c.unreadCount + 1 }
        : c
    );
    setConversations(updatedConvs);
    saveConversationsMutation.mutate(updatedConvs);
  }, [contacts, conversations, messages, saveMessagesMutation, saveConversationsMutation]);

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // missedCalls — persisted separately via AsyncStorage
  const [missedCalls, setMissedCalls] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('presence_missed_calls')
      .then(v => { if (v) setMissedCalls(parseInt(v, 10) || 0); })
      .catch(() => {});
  }, []);

  const incrementMissedCalls = useCallback(() => {
    setMissedCalls(prev => {
      const next = prev + 1;
      AsyncStorage.setItem('presence_missed_calls', String(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearMissedCalls = useCallback(() => {
    setMissedCalls(0);
    AsyncStorage.setItem('presence_missed_calls', '0').catch(() => {});
  }, []);

  return {
    contacts,
    conversations,
    messages,
    addContact,
    removeContact,
    sendMessage,
    getConversationMessages,
    getConversation,
    markAsRead,
    unreadTotal,
    receiveMessage,
    expiringConversations: conversations.filter(c => { if (!c.isActive || !c.expiresAt || c.expiresAt === 'unlimited') return false; const ms = new Date(c.expiresAt).getTime() - Date.now(); return ms > 0 && ms < 24*3600000; }),
    missedCalls,
    incrementMissedCalls,
    clearMissedCalls,
    isLoading: contactsQuery.isLoading || conversationsQuery.isLoading || messagesQuery.isLoading,
  };
});

