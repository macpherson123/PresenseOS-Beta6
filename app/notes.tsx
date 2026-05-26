/**
 * presenceOS — Notes
 * Full note-taking app: create, edit, delete, search, pin notes.
 * Persisted via AsyncStorage. Fully themed.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Modal, Alert, Animated, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import OSStatusBar from '@/components/OSStatusBar';
import BottomBackBar from '@/components/BottomBackBar';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Plus, Search, X, Trash2, Pin, PinOff,
  BookOpen, Clock,
} from 'lucide-react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Note {
  id:        string;
  title:     string;
  body:      string;
  pinned:    boolean;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'pOS_notes_v1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function makeId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NotesScreen() {
  const router = useRouter();
  const { activeTheme: t, settings, uiTokens: s } = useSettings();
  const fadeIn = useRef(new Animated.Value(0)).current;

  const [notes,    setNotes]    = useState<Note[]>([]);
  const [search,   setSearch]   = useState('');
  const [editing,  setEditing]  = useState<Note | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  // Draft state while editing
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody,  setDraftBody]  = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) setNotes(JSON.parse(raw));
    });
    Animated.timing(fadeIn, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, []); // eslint-disable-line

  const persist = useCallback((next: Note[]) => {
    setNotes(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const openNew = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const blank: Note = { id: makeId(), title: '', body: '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
    setEditing(blank);
    setDraftTitle('');
    setDraftBody('');
    setShowEdit(true);
  }, []);

  const openEdit = useCallback((note: Note) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditing(note);
    setDraftTitle(note.title);
    setDraftBody(note.body);
    setShowEdit(true);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    const trimTitle = draftTitle.trim();
    const trimBody  = draftBody.trim();
    if (!trimTitle && !trimBody) {
      // empty — discard
      setShowEdit(false);
      setEditing(null);
      return;
    }
    const updated: Note = {
      ...editing,
      title:     trimTitle || trimBody.slice(0, 40),
      body:      trimBody,
      updatedAt: Date.now(),
    };
    const existing = notes.findIndex(n => n.id === editing.id);
    let next: Note[];
    if (existing >= 0) {
      next = [...notes];
      next[existing] = updated;
    } else {
      next = [updated, ...notes];
    }
    persist(next);
    setShowEdit(false);
    setEditing(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [editing, draftTitle, draftBody, notes, persist]);

  const deleteNote = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(notes.filter(n => n.id !== id)) },
    ]);
  }, [notes, persist]);

  const togglePin = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persist(notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  }, [notes, persist]);

  // ── Filter & sort ─────────────────────────────────────────────────────────
  const filtered = notes
    .filter(n => {
      if (!search) return true;
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

  const pinned   = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  // ── Render note card ──────────────────────────────────────────────────────
  const renderCard = (note: Note) => (
    <Pressable
      key={note.id}
      onPress={() => openEdit(note)}
      onLongPress={() => deleteNote(note.id)}
      style={({ pressed }) => [
        N.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radius, borderWidth: s.borderWidth },
        pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={N.cardTop}>
        <Text style={[N.cardTitle, { color: t.text }]} numberOfLines={1}>
          {note.title || 'Untitled'}
        </Text>
        <Pressable hitSlop={10} onPress={() => togglePin(note.id)}>
          {note.pinned
            ? <Pin  size={14} color={t.accent} />
            : <PinOff size={14} color={t.textMuted + '60'} />}
        </Pressable>
      </View>
      {note.body.trim() !== '' && (
        <Text style={[N.cardBody, { color: t.textMuted }]} numberOfLines={2}>
          {note.body}
        </Text>
      )}
      <View style={N.cardFooter}>
        <Clock size={10} color={t.textMuted + '80'} />
        <Text style={[N.cardDate, { color: t.textMuted + '80' }]}>{formatDate(note.updatedAt)}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[N.container, { backgroundColor: t.bg }]}>
      <OSStatusBar />
      <Animated.View style={[{ flex: 1 }, { opacity: fadeIn }]}>

        {/* Header */}
        <View style={N.header}>
          
          <View style={N.headerCenter}>
            <BookOpen size={18} color={t.accent} strokeWidth={1.6} />
            <Text style={[N.headerTitle, { color: t.text }]}>Notes</Text>
          </View>
          <Pressable style={[N.addBtn, { backgroundColor: t.accentDim, borderColor: t.accent + '50', borderRadius: s.radiusSm }]}
            onPress={openNew} hitSlop={6}>
            <Plus size={18} color={t.accent} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={[N.searchWrap, { backgroundColor: t.surface, borderColor: t.border, borderRadius: s.radiusSm, borderWidth: s.borderWidth }]}>
          <Search size={15} color={t.textMuted} strokeWidth={1.5} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search notes..."
            placeholderTextColor={t.textMuted}
            style={[N.searchInput, { color: t.text }]}
          />
          {search.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setSearch('')}>
              <X size={14} color={t.textMuted} />
            </Pressable>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={N.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 && (
            <View style={N.empty}>
              <BookOpen size={44} color={t.textMuted + '40'} strokeWidth={1} />
              <Text style={[N.emptyTitle, { color: t.textMuted }]}>
                {search ? 'No notes match your search' : 'No notes yet'}
              </Text>
              {!search && (
                <Text style={[N.emptyHint, { color: t.textMuted + '80' }]}>
                  Tap + to create your first note
                </Text>
              )}
            </View>
          )}

          {pinned.length > 0 && (
            <>
              <Text style={[N.groupLabel, { color: t.textMuted }]}>PINNED</Text>
              {pinned.map(renderCard)}
            </>
          )}

          {unpinned.length > 0 && (
            <>
              {pinned.length > 0 && <Text style={[N.groupLabel, { color: t.textMuted }]}>NOTES</Text>}
              {unpinned.map(renderCard)}
            </>
          )}
        </ScrollView>
      </Animated.View>

      {/* ── Edit modal ── */}
      <Modal
        visible={showEdit}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={saveEdit}
      >
        <KeyboardAvoidingView
          style={[N.editContainer, { backgroundColor: t.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Edit header */}
          <View style={[N.editHeader, { borderBottomColor: t.border }]}>
            <Pressable onPress={() => { setShowEdit(false); setEditing(null); }} style={N.editCancel} hitSlop={8}>
              <Text style={[N.editCancelTxt, { color: t.textMuted }]}>Cancel</Text>
            </Pressable>
            <Text style={[N.editHeading, { color: t.textMuted }]}>
              {editing && notes.find(n => n.id === editing?.id) ? 'Edit Note' : 'New Note'}
            </Text>
            <Pressable onPress={saveEdit} style={N.editSave} hitSlop={8}>
              <Text style={[N.editSaveTxt, { color: t.accent }]}>Done</Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={N.editContent}
          >
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Title"
              placeholderTextColor={t.textMuted + '60'}
              style={[N.editTitle, { color: t.text, borderBottomColor: t.border }]}
              returnKeyType="next"
              maxLength={120}
            />
            <TextInput
              value={draftBody}
              onChangeText={setDraftBody}
              placeholder="Start writing..."
              placeholderTextColor={t.textMuted + '60'}
              style={[N.editBody, { color: t.text }]}
              multiline
              textAlignVertical="top"
              autoFocus={!draftTitle && !draftBody}
            />
          </ScrollView>

          {/* Bottom toolbar */}
          <View style={[N.editToolbar, { borderTopColor: t.border, backgroundColor: t.surface }]}>
            {editing && notes.find(n => n.id === editing?.id) && (
              <Pressable onPress={() => { deleteNote(editing!.id); setShowEdit(false); setEditing(null); }}
                style={N.editToolbarBtn}>
                <Trash2 size={18} color={t.red} strokeWidth={1.6} />
                <Text style={[N.editToolbarLabel, { color: t.red }]}>Delete</Text>
              </Pressable>
            )}
            {editing && (
              <Pressable onPress={() => togglePin(editing.id)} style={N.editToolbarBtn}>
                {(notes.find(n => n.id === editing.id)?.pinned ?? editing.pinned)
                  ? <PinOff size={18} color={t.textMuted} strokeWidth={1.6} />
                  : <Pin size={18} color={t.accent} strokeWidth={1.6} />}
                <Text style={[N.editToolbarLabel, { color: t.textMuted }]}>
                  {(notes.find(n => n.id === editing.id)?.pinned ?? editing.pinned) ? 'Unpin' : 'Pin'}
                </Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Text style={[N.editCharCount, { color: t.textMuted + '70' }]}>
              {draftBody.length} chars
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    <BottomBackBar />
    </View>
  );
}

const N = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn:         { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:     { fontSize: 18, fontWeight: '600' as const, letterSpacing: 0.3 },
  addBtn:          { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  searchWrap:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 16,
                     borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:     { flex: 1, fontSize: 14 },

  listContent:     { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  groupLabel:      { fontSize: 10, fontWeight: '700' as const, letterSpacing: 2, marginTop: 4, marginBottom: -2 },

  card:            { padding: 16, borderWidth: 1, gap: 6 },
  cardTop:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle:       { flex: 1, fontSize: 15, fontWeight: '600' as const },
  cardBody:        { fontSize: 13, lineHeight: 19 },
  cardFooter:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardDate:        { fontSize: 10, letterSpacing: 0.3 },

  empty:           { alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyTitle:      { fontSize: 16, fontWeight: '500' as const },
  emptyHint:       { fontSize: 13 },

  // Edit modal
  editContainer:   { flex: 1 },
  editHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                     paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  editCancel:      { minWidth: 60 },
  editCancelTxt:   { fontSize: 15 },
  editHeading:     { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.5 },
  editSave:        { minWidth: 60, alignItems: 'flex-end' },
  editSaveTxt:     { fontSize: 15, fontWeight: '600' as const },
  editContent:     { padding: 20, gap: 4 },
  editTitle:       { fontSize: 22, fontWeight: '600' as const, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 10 },
  editBody:        { fontSize: 16, lineHeight: 26, minHeight: 300 },
  editToolbar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 20 },
  editToolbarBtn:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  editToolbarLabel:{ fontSize: 13 },
  editCharCount:   { fontSize: 11 },
});
