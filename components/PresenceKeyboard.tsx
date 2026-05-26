/**
 * PresenceKeyboard — custom in-app keyboard
 * Features:
 *  - QWERTY with punctuation row (. , ? ! / ' - :)
 *  - Key-press popup bubble (like a physical keyboard)
 *  - onPressIn for instant response (no input lag)
 *  - Word predictions + contact suggestions
 *  - Animated show/hide with slide-up/down
 *  - Auto-caps, shift, numbers/symbols mode
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Animated, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Delete } from 'lucide-react-native';
import { useSettings } from '@/contexts/SettingsContext';

const COMMON_WORDS = [
  'the', 'and', 'for', 'that', 'this', 'with', 'have', 'from', 'they',
  'will', 'been', 'said', 'what', 'when', 'your', 'then', 'there',
  'would', 'about', 'which', 'their', 'could', 'other', 'into',
  'just', 'like', 'over', 'know', 'come', 'time', 'also', 'back',
  'after', 'well', 'only', 'those', 'tell', 'much', 'even', 'been',
  'good', 'great', 'okay', 'yeah', 'sure', 'thanks', 'please', 'sorry',
  'hello', 'hey', 'how', 'are', 'you', 'yes', 'not', 'can', 'get',
  'done', 'see', 'think', 'going', 'need', 'today', 'tomorrow', 'now',
  'later', 'meeting', 'call', 'message', 'text', 'send', 'here',
];

const ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['z','x','c','v','b','n','m'],
];
const PUNCT_ROW = ['.', ',', '?', '!', '/', "'", '-', ':'];
const NUM_ROW  = ['1','2','3','4','5','6','7','8','9','0'];
const SYM_ROW  = ['!','@','#','$','%','^','&','*','(',')','-','=','+','/'];

interface PopupInfo { char: string; x: number; y: number; rowY: number }

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSend?: () => void;
  onDismiss?: () => void;
  contacts?: Array<{ name: string; number: string }>;
  visible?: boolean;
}

function PresenceKeyboardImpl({
  value, onChange, onSend, onDismiss, contacts = [], visible = true,
}: Props) {
  const { activeTheme: t, settings } = useSettings();
  const kbDisabled = (settings as any)?.presenceKeyboardEnabled === false;
  const [caps,     setCaps]     = useState(true);
  const [shift,    setShift]    = useState(false);
  const [numMode,  setNumMode]  = useState(false);
  const [symMode,  setSymMode]  = useState(false);
  const [predictions,  setPredictions]  = useState<string[]>([]);
  const [contactSugs,  setContactSugs]  = useState<Array<{ name: string; number: string }>>([]);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<any>(null);
  const containerTopRef = useRef(0);

  // Slide animation
  const slideY = useRef(new Animated.Value(visible ? 0 : 300)).current;
  useEffect(() => {
    Animated.spring(slideY, {
      toValue: visible ? 0 : 300,
      useNativeDriver: true,
      tension: 220,
      friction: 26,
    }).start();
  }, [visible, slideY]);

  const tap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  useEffect(() => {
    const words = value.trim().split(/\s+/);
    const cur = words[words.length - 1]?.toLowerCase() ?? '';
    if (cur.length < 1) { setPredictions([]); setContactSugs([]); return; }
    if (/^[a-z]{2,}$/i.test(cur) && contacts.length > 0) {
      setContactSugs(contacts.filter(c => c.name.toLowerCase().startsWith(cur)).slice(0, 3));
    } else {
      setContactSugs([]);
    }
    setPredictions(COMMON_WORDS.filter(w => w.startsWith(cur) && w !== cur).slice(0, 5));
  }, [value, contacts]);

  const showPopup = useCallback((char: string, px: number, py: number) => {
    if (popupTimer.current) clearTimeout(popupTimer.current);
    // Convert screen-absolute pageY to keyboard-relative Y
    const relY = py - containerTopRef.current;
    setPopup({ char, x: px, y: relY, rowY: relY });
    popupTimer.current = setTimeout(() => setPopup(null), 380);
  }, []);

  const insertText = useCallback((char: string, px = 0, py = 0) => {
    tap();
    let c = char;
    if ((caps || shift) && /^[a-z]$/.test(char)) c = char.toUpperCase();
    const displayChar = c;
    showPopup(displayChar, px, py);
    const next = value + c;
    onChange(next);
    if (caps && /[a-zA-Z]/.test(char)) setCaps(false);
    if (shift) setShift(false);
    if (/[.!?] $/.test(next)) setCaps(true);
  }, [value, caps, shift, onChange, tap, showPopup]);

  const insertWord = useCallback((word: string) => {
    tap();
    const words = value.split(/(\s+)/);
    words.pop();
    onChange(words.join('') + word + ' ');
    setPredictions([]); setCaps(false);
  }, [value, onChange, tap]);

  const insertContact = useCallback((c: { name: string; number: string }) => {
    tap();
    const words = value.split(/(\s+)/);
    words.pop();
    onChange(words.join('') + c.name + ' ');
    setContactSugs([]);
  }, [value, onChange, tap]);

  const onBackspace = useCallback((px = 0, py = 0) => {
    tap();
    showPopup('⌫', px, py);
    onChange(value.slice(0, -1));
    if (value.length <= 1) setCaps(true);
  }, [value, onChange, tap, showPopup]);

  const onSpace = useCallback(() => {
    tap();
    onChange(value + ' ');
    setCaps(/[.!?] *$/.test(value));
    setShift(false);
  }, [value, onChange, tap]);

  const onReturn = useCallback(() => {
    tap();
    onChange(value + '\n');
  }, [value, onChange, tap]);

  const rows = numMode ? [NUM_ROW] : symMode ? [SYM_ROW] : ROWS;

  const bg   = (active = false) => active ? t.accent    : t.surface;
  const fg   = (active = false) => active ? t.bg        : t.text;
  // Slightly darker bottom border gives keys physical depth without LinearGradient.
  const keyDepth = (active = false) => active ? t.accent + 'AA' : t.border + 'CC';

  // Blinking cursor animation
  const cursorAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    blink.start();
    return () => blink.stop();
  }, [cursorAnim]);

  // Scroll ref for auto-scroll to end
  const textScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    textScrollRef.current?.scrollToEnd({ animated: false });
  }, [value]);

  // Render nothing when the user has chosen the system keyboard. Placed AFTER
  // all hooks so toggling presenceKeyboardEnabled never violates the Rules of
  // Hooks (which was the source of the on/off crashes).
  if (kbDisabled) return null;

  return (
    <Animated.View
      ref={containerRef}
      onLayout={() => {
        containerRef.current?.measureInWindow((_x, y) => { containerTopRef.current = y; });
      }}
      style={[styles.container, { backgroundColor: t.bg, borderTopColor: t.border, transform: [{ translateY: slideY }] }]}
    >
      {/* ── Text display bar with blinking cursor ── */}
      <View style={[styles.textDisplay, { backgroundColor: t.surface, borderColor: t.border }]}>
        <ScrollView
          ref={textScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: 'center' }}
          style={{ flex: 1 }}
          scrollEnabled={false}
        >
          <Text style={[styles.textDisplayText, { color: value ? t.text : t.textMuted }]}>
            {value || 'Type something…'}
          </Text>
        </ScrollView>
        <Animated.View style={[styles.cursor, { backgroundColor: t.accent, opacity: cursorAnim }]} />
      </View>

      {/* Key popup bubble — positioned relative to keyboard container */}
      {popup && (
        <View
          pointerEvents="none"
          style={[styles.popup, {
            left: popup.x - 24,
            top: popup.rowY - 64,
            backgroundColor: t.surface,
            borderColor: t.accent + '60',
          }]}
        >
          <Text style={[styles.popupText, { color: t.text }]}>{popup.char}</Text>
        </View>
      )}

      {/* Suggestion bar */}
      {(predictions.length > 0 || contactSugs.length > 0) && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={[styles.sugBar, { borderBottomColor: t.border }]}
          contentContainerStyle={styles.sugBarContent}
        >
          {contactSugs.map(c => (
            <Pressable key={c.number}
              style={[styles.sugChip, { backgroundColor: t.accentDim, borderColor: t.accent + '50' }]}
              onPress={() => insertContact(c)}>
              <Text style={[styles.sugChipText, { color: t.accent }]}>👤 {c.name}</Text>
            </Pressable>
          ))}
          {predictions.map(word => (
            <Pressable key={word}
              style={[styles.sugChip, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => insertWord(word)}>
              <Text style={[styles.sugChipText, { color: t.text }]}>{word}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.keysArea}>
        {/* Letter / number rows */}
        {rows.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {!numMode && !symMode && ri === 2 && (
              <Pressable
                style={[styles.shiftKey, { backgroundColor: bg(shift || caps), borderColor: t.border, borderBottomColor: keyDepth(shift || caps) }]}
                onPressIn={() => { tap(); setShift(s => !s); setCaps(false); }}
              >
                <Text style={[styles.keyText, { color: fg(shift || caps), fontSize: 16 }]}>
                  {caps ? '⇧' : '↑'}
                </Text>
              </Pressable>
            )}
            {row.map(key => {
              const display = (!numMode && !symMode && (caps || shift) && /^[a-z]$/.test(key))
                ? key.toUpperCase() : key;
              return (
                <Pressable
                  key={key}
                  style={({ pressed }) => [
                    styles.key,
                    {
                      backgroundColor: pressed ? t.accent + 'DD' : t.surface,
                      borderColor: pressed ? t.accent + '80' : t.border,
                      borderBottomColor: pressed ? t.accent : keyDepth(),
                    },
                  ]}
                  onPressIn={(e) => insertText(key, e.nativeEvent.pageX, e.nativeEvent.pageY)}
                >
                  <Text style={[styles.keyText, { color: t.text }]}>{display}</Text>
                </Pressable>
              );
            })}
            {!numMode && !symMode && ri === 2 && (
              <Pressable
                style={[styles.shiftKey, { backgroundColor: t.surface, borderColor: t.border, borderBottomColor: keyDepth() }]}
                onPressIn={(e) => onBackspace(e.nativeEvent.pageX, e.nativeEvent.pageY)}
                onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onChange(''); }}
              >
                <Delete size={18} color={t.text} />
              </Pressable>
            )}
          </View>
        ))}

        {/* Punctuation row (letter mode only) */}
        {!numMode && !symMode && (
          <View style={styles.keyRow}>
            {PUNCT_ROW.map(char => (
              <Pressable
                key={char}
                style={({ pressed }) => [
                  styles.punctKey,
                  {
                    backgroundColor: pressed ? t.accent + 'DD' : t.surface + 'CC',
                    borderColor: pressed ? t.accent + '80' : t.border,
                    borderBottomColor: pressed ? t.accent : keyDepth(),
                  },
                ]}
                onPressIn={(e) => insertText(char, e.nativeEvent.pageX, e.nativeEvent.pageY)}
              >
                <Text style={[styles.keyText, { color: t.textMuted, fontSize: 14 }]}>{char}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Number mode: show delete key + sym toggle */}
        {(numMode || symMode) && (
          <View style={[styles.keyRow, { justifyContent: 'flex-end', paddingRight: 6 }]}>
            <Pressable
              style={[styles.modeKey, { backgroundColor: t.surface, borderColor: t.border, borderBottomColor: keyDepth() }]}
              onPressIn={() => { tap(); setSymMode(s => !s); }}
            >
              <Text style={[styles.keyText, { color: t.text, fontSize: 11 }]}>{symMode ? 'NUM' : '#+='}  </Text>
            </Pressable>
            <Pressable
              style={[styles.shiftKey, { backgroundColor: t.surface, borderColor: t.border, borderBottomColor: keyDepth() }]}
              onPressIn={(e) => onBackspace(e.nativeEvent.pageX, e.nativeEvent.pageY)}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onChange(''); }}
            >
              <Delete size={18} color={t.text} />
            </Pressable>
          </View>
        )}

        {/* Bottom row */}
        <View style={styles.keyRow}>
          <Pressable
            style={[styles.modeKey, { backgroundColor: t.surface, borderColor: t.border, borderBottomColor: keyDepth() }]}
            onPressIn={() => { tap(); setNumMode(n => !n); if (!numMode) setSymMode(false); }}
          >
            <Text style={[styles.keyText, { color: t.text, fontSize: 11 }]}>
              {numMode || symMode ? 'ABC' : '123'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.spaceKey, { backgroundColor: t.surface, borderColor: t.border, borderBottomColor: keyDepth() }]}
            onPressIn={onSpace}
          >
            <Text style={[styles.keyText, { color: t.textMuted, fontSize: 13 }]}>space</Text>
          </Pressable>

          {onSend ? (
            <Pressable
              style={[styles.sendKey, {
                backgroundColor: value.trim() ? t.accent : t.surface,
                borderColor: value.trim() ? t.accent + '80' : t.border,
                borderBottomColor: value.trim() ? t.accent + 'AA' : keyDepth(),
              }]}
              onPressIn={() => { if (value.trim()) { tap(); onSend(); } }}
              disabled={!value.trim()}
            >
              <Text style={[styles.keyText, { color: value.trim() ? t.bg : t.textMuted, fontSize: 13, fontWeight: '700' as const }]}>
                Send
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.modeKey, { backgroundColor: t.surface, borderColor: t.border, borderBottomColor: keyDepth() }]}
              onPressIn={onReturn}
            >
              <Text style={[styles.keyText, { color: t.text, fontSize: 14 }]}>↵</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    overflow: 'visible',
  },
  textDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 46,
  },
  textDisplayText: {
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 0,
  },
  cursor: {
    width: 2,
    height: 20,
    borderRadius: 1,
    marginLeft: 2,
  },
  popup: {
    position: 'absolute',
    zIndex: 999,
    width: 52,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
  },
  popupText: {
    fontSize: 28,
    fontWeight: '400' as const,
    includeFontPadding: false,
  },
  sugBar: {
    maxHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sugBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 7,
  },
  sugChip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sugChipText: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  keysArea: {
    gap: 5,
    paddingTop: 6,
    paddingHorizontal: 5,
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    alignItems: 'center',
  },
  // 3-D key depth: a slightly darker borderBottomColor gives each key the appearance
  // of a physical keycap sitting above the keyboard surface.
  key: {
    flex: 1,
    maxWidth: 44,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  punctKey: {
    flex: 1,
    maxWidth: 44,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderBottomWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  shiftKey: {
    width: 52,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  modeKey: {
    width: 60,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  spaceKey: {
    flex: 1,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    elevation: 2,
  },
  sendKey: {
    width: 72,
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  keyText: {
    fontSize: 17,
    fontWeight: '400' as const,
    includeFontPadding: false,
  },
});

export default React.memo(PresenceKeyboardImpl);
