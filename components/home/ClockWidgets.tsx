import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { useSettings } from '@/contexts/SettingsContext';

const { width: SW } = Dimensions.get('window');

// ─── Flip Clock ───────────────────────────────────────────────────────────────
function FlipCard({ value, color, bg, border }: { value: string; color: string; bg: string; border: string }) {
  const [displayed, setDisplayed] = useState(value);
  const [incoming,  setIncoming]  = useState(value);
  const topFlip = useRef(new Animated.Value(0)).current;
  const busy    = useRef(false);
  useEffect(() => {
    if (value === displayed || busy.current) return;
    busy.current = true; setIncoming(value); topFlip.setValue(0);
    Animated.timing(topFlip, { toValue: 1, duration: 90, useNativeDriver: true }).start(() => {
      setDisplayed(value); topFlip.setValue(0); busy.current = false;
    });
  }, [value]); // eslint-disable-line
  const topR = topFlip.interpolate({ inputRange: [0,1], outputRange: ['0deg','-90deg'] });
  const incR = topFlip.interpolate({ inputRange: [0,1], outputRange: ['90deg','0deg']  });
  const W = 88, H = 104, HALF = H / 2;
  return (
    <View style={{ width: W, height: H }}>
      <View style={[FC.card, { width: W, height: H, backgroundColor: bg, borderColor: border, borderRadius: 10 }]}>
        <View style={[FC.half, FC.bottomHalf, { borderTopColor: border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[FC.digit, { color, lineHeight: H, marginTop: -HALF }]}>{displayed}</Text>
        </View>
        <View style={[FC.half, FC.topHalf]}>
          <Text style={[FC.digit, { color, lineHeight: H }]}>{incoming}</Text>
        </View>
      </View>
      <Animated.View style={[FC.flipPanel, { width: W, height: HALF, backgroundColor: bg, borderColor: border, borderRadius: 10, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, transform: [{ perspective: 400 }, { rotateX: topR }], transformOrigin: 'bottom' }]}>
        <View style={{ overflow: 'hidden', height: HALF }}><Text style={[FC.digit, { color, lineHeight: H }]}>{displayed}</Text></View>
      </Animated.View>
      <Animated.View style={[FC.flipPanel, { width: W, height: HALF, top: HALF, backgroundColor: bg, borderColor: border, borderRadius: 10, borderTopLeftRadius: 0, borderTopRightRadius: 0, transform: [{ perspective: 400 }, { rotateX: incR }], transformOrigin: 'top' }]}>
        <View style={{ overflow: 'hidden', height: HALF, marginTop: -HALF }}><Text style={[FC.digit, { color, lineHeight: H }]}>{incoming}</Text></View>
      </Animated.View>
      <View style={[FC.foldLine, { top: HALF - 1, width: W, backgroundColor: border }]} />
    </View>
  );
}
const FC = StyleSheet.create({
  card:      { position: 'absolute', top: 0, left: 0, overflow: 'hidden', borderWidth: 1 },
  half:      { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  topHalf:   { top: 0, height: 44 },
  bottomHalf:{ bottom: 0, height: 44 },
  flipPanel: { position: 'absolute', left: 0, overflow: 'hidden', borderWidth: 1 },
  digit:     { fontSize: 92, fontWeight: '100' as const, textAlign: 'center', letterSpacing: -2, includeFontPadding: false },
  foldLine:  { position: 'absolute', height: 1.5, left: 0 },
});

export function BracketClock({ accent, text, muted, bg }: { accent: string; text: string; muted: string; bg: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const H = now.getHours().toString().padStart(2,'0'), M = now.getMinutes().toString().padStart(2,'0');
  // Use themed colours: card bg = slightly lighter than bg, border = subtle
  const cardBg = bg;
  const cardBorder = accent + '30';
  return (
    <View style={BCC.wrap}>
      <Text style={[BCC.dateStrip, { color: muted }]}>{now.toLocaleDateString('en-NZ', { weekday:'short', month:'short', day:'numeric' }).toUpperCase()}</Text>
      <View style={BCC.cardRow}>
        <FlipCard value={H[0]} color={text} bg={cardBg} border={cardBorder} /><FlipCard value={H[1]} color={text} bg={cardBg} border={cardBorder} />
        <View style={BCC.colonWrap}><View style={[BCC.dot, { backgroundColor: accent }]} /><View style={[BCC.dot, { backgroundColor: accent }]} /></View>
        <FlipCard value={M[0]} color={text} bg={cardBg} border={cardBorder} /><FlipCard value={M[1]} color={text} bg={cardBg} border={cardBorder} />
      </View>
      <View style={[BCC.secBar, { backgroundColor: accent + '20' }]}><View style={[BCC.secFill, { backgroundColor: accent, width: `${Math.round((now.getSeconds()/59)*100)}%` as any }]} /></View>
    </View>
  );
}
const BCC = StyleSheet.create({
  wrap:      { alignItems: 'center', paddingHorizontal: 10, gap: 12 },
  dateStrip: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 3 },
  cardRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colonWrap: { gap: 14, alignItems: 'center', marginHorizontal: 4, marginBottom: 4 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  secBar:    { height: 3, width: '80%', borderRadius: 2, overflow: 'hidden' },
  secFill:   { height: '100%', borderRadius: 2 },
});

// ─── Analog Clock ─────────────────────────────────────────────────────────────
const CLOCK_SIZE = Math.min(SW * 0.64, 260), CLOCK_R = CLOCK_SIZE / 2;

const ANALOG_TICKS = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0, rad = ((i * 6 - 90) * Math.PI) / 180, r = CLOCK_R - (major ? 10 : 6);
  return { major, x: CLOCK_R + r * Math.cos(rad) - (major ? 1.5 : 0.75), y: CLOCK_R + r * Math.sin(rad) - (major ? 6 : 4), angle: i * 6 };
});

const Hand = React.memo(function Hand({ angle, length, width: w, color }: { angle: number; length: number; width: number; color: string }) {
  return (
    <View style={{ position: 'absolute', width: w, height: length * 2, top: CLOCK_R - length, left: CLOCK_R - w / 2, transform: [{ rotate: `${angle}deg` }], alignItems: 'center' }}>
      <View style={{ width: w, height: length, backgroundColor: color, borderRadius: w / 2 }} />
    </View>
  );
});

export function AnalogClock({ accent, text, muted, bg }: { accent: string; text: string; muted: string; bg: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
  return (
    <View style={{ width: CLOCK_SIZE, height: CLOCK_SIZE, alignSelf: 'center' }}>
      <View style={[AC.face, { width: CLOCK_SIZE, height: CLOCK_SIZE, borderRadius: CLOCK_R, borderColor: accent, backgroundColor: bg }]} />
      {ANALOG_TICKS.map((t,i) => <View key={i} style={[AC.tick, { position:'absolute', width: t.major?3:1.5, height: t.major?12:7, left: t.x, top: t.y, backgroundColor: t.major?muted:muted+'60', transform:[{rotate:`${t.angle}deg`}] }]} />)}
      {[{n:'XII',i:0},{n:'III',i:3},{n:'VI',i:6},{n:'IX',i:9}].map(({n,i}) => {
        const rad=((i*30-90)*Math.PI)/180, r=CLOCK_R-28;
        return <Text key={n} style={[AC.numeral,{color:muted,position:'absolute',left:CLOCK_R+r*Math.cos(rad)-14,top:CLOCK_R+r*Math.sin(rad)-9}]}>{n}</Text>;
      })}
      <Hand angle={h*30+m*0.5} length={CLOCK_R*0.50} width={4}   color={text} />
      <Hand angle={m*6+s*0.1}  length={CLOCK_R*0.70} width={2.5} color={text} />
      <Hand angle={s*6}         length={CLOCK_R*0.78} width={1.5} color={accent} />
      <View style={[AC.centre, { left: CLOCK_R-5, top: CLOCK_R-5, backgroundColor: accent }]} />
    </View>
  );
}
const AC = StyleSheet.create({
  face:    { position:'absolute', borderWidth:1.5 },
  tick:    { borderRadius:1 },
  numeral: { fontSize:11, fontWeight:'500' as const, letterSpacing:0.5, textAlign:'center' },
  centre:  { position:'absolute', width:10, height:10, borderRadius:5 },
});

// ─── Geometric Clock ──────────────────────────────────────────────────────────
export function GeometricClock({ accent, text, muted }: { accent: string; text: string; muted: string }) {
  const [now, setNow] = useState(() => new Date());
  const spin  = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue:1, duration:12000, useNativeDriver:true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue:1.18, duration:320, useNativeDriver:true }),
      Animated.timing(pulse, { toValue:1, duration:320, useNativeDriver:true }),
    ])).start();
  }, []); // eslint-disable-line
  const H = now.getHours().toString().padStart(2,'0'), M = now.getMinutes().toString().padStart(2,'0');
  const sec = now.getSeconds(), SEGS = 20, filled = Math.round((sec/59)*SEGS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spinDeg = useMemo(() => spin.interpolate({ inputRange:[0,1], outputRange:['0deg','360deg'] }), []);
  return (
    <View style={GC.wrap}>
      <Animated.View style={[GC.bgDiamond, { borderColor: accent+'18', transform:[{rotate:spinDeg},{scale:pulse}] }]} />
      <View style={[GC.chevTL,{borderColor:accent}]} /><View style={[GC.chevBR,{borderColor:accent}]} />
      <View style={GC.timeRow}>
        <Text style={[GC.digits,{color:text}]}>{H}</Text>
        <Animated.View style={[GC.diamond,{backgroundColor:accent,transform:[{rotate:'45deg'},{scale:pulse}]}]} />
        <Text style={[GC.digits,{color:text}]}>{M}</Text>
      </View>
      <View style={GC.segsRow}>
        {Array.from({length:SEGS},(_,i)=><View key={i} style={[GC.seg,{backgroundColor:i<filled?accent:accent+'22',transform:[{scaleY:i<filled?1:0.5}]}]} />)}
      </View>
      <Text style={[GC.secLabel,{color:muted}]}>{sec.toString().padStart(2,'0')}s</Text>
    </View>
  );
}
const GC = StyleSheet.create({
  wrap:      { width:'100%', alignItems:'center', paddingHorizontal:16, paddingVertical:8 },
  bgDiamond: { position:'absolute', width:220, height:220, borderWidth:1, transform:[{rotate:'45deg'}] },
  chevTL:    { position:'absolute', top:8, left:24, width:22, height:22, borderTopWidth:2, borderLeftWidth:2 },
  chevBR:    { position:'absolute', bottom:28, right:24, width:22, height:22, borderBottomWidth:2, borderRightWidth:2 },
  timeRow:   { flexDirection:'row', alignItems:'center', gap:16, paddingVertical:12 },
  digits:    { fontSize:84, fontWeight:'100' as const, letterSpacing:-2, includeFontPadding:false, lineHeight:90 },
  diamond:   { width:12, height:12, borderRadius:2 },
  segsRow:   { flexDirection:'row', gap:3, alignItems:'flex-end', height:18, marginTop:4 },
  seg:       { width:10, height:14, borderRadius:2 },
  secLabel:  { fontSize:11, letterSpacing:1.5, marginTop:4 },
});

// ─── Simple Clock ─────────────────────────────────────────────────────────────
export function SimpleClock({ accent, text, muted }: { accent: string; text: string; muted: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const H    = now.getHours().toString().padStart(2,'0');
  const M    = now.getMinutes().toString().padStart(2,'0');
  const date = now.toLocaleDateString('en-NZ', { weekday:'long', month:'long', day:'numeric' });
  return (
    <View style={SP.wrap}>
      <Text style={[SP.digits, { color: text }]}>{H}:{M}</Text>
      <Text style={[SP.date,   { color: muted }]}>{date}</Text>
    </View>
  );
}
const SP = StyleSheet.create({
  wrap:   { alignItems: 'center', paddingTop: 28, paddingBottom: 14, gap: 10 },
  digits: { fontSize: 88, fontWeight: '200' as const, letterSpacing: -2, includeFontPadding: false },
  date:   { fontSize: 13, letterSpacing: 1 },
});

// ─── Old School Clock ─────────────────────────────────────────────────────────
export function OldSchoolClock({ accent, text, muted, bg }: { accent: string; text: string; muted: string; bg: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const s = now.getSeconds();
  const m = now.getMinutes() + s/60;
  const h = (now.getHours() % 12) + m/60;
  const R = Math.min(SW * 0.55, 240) / 2;
  const face = '#F2ECD8', rim = '#8B6E3F', ink = '#2A1E0E';
  return (
    <View style={OSC.wrap}>
      <View style={[OSC.face, { width: R*2, height: R*2, borderRadius: R, backgroundColor: face, borderColor: rim }]}>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 - 60) * Math.PI / 180;
          return (
            <Text key={i} style={[OSC.numeral, { left: R + (R - 26) * Math.cos(a) - 10, top: R + (R - 26) * Math.sin(a) - 12, color: ink }]}>
              {i === 0 ? 12 : i + 1}
            </Text>
          );
        })}
        <View style={[OSC.hand, { left: R-3, top: R-R*0.5, width:6, height:R*0.52, backgroundColor:ink, borderRadius:3, transform:[{translateY:R*0.26},{rotate:`${h*30}deg`},{translateY:-R*0.26}] }]} />
        <View style={[OSC.hand, { left: R-2, top: R-R*0.72, width:4, height:R*0.74, backgroundColor:ink, borderRadius:2, transform:[{translateY:R*0.37},{rotate:`${m*6}deg`},{translateY:-R*0.37}] }]} />
        <View style={[OSC.hand, { left: R-0.75, top: R-R*0.78, width:1.5, height:R*0.82, backgroundColor:'#B22', borderRadius:1, transform:[{translateY:R*0.41},{rotate:`${s*6}deg`},{translateY:-R*0.41}] }]} />
        <View style={[OSC.pivot, { left: R-7, top: R-7, backgroundColor: rim, borderColor: ink }]} />
      </View>
    </View>
  );
}
const OSC = StyleSheet.create({
  wrap:    { alignItems: 'center', paddingTop: 20, paddingBottom: 14 },
  face:    { borderWidth: 6, alignItems: 'center', justifyContent: 'center', shadowColor:'#000', shadowOpacity:0.4, shadowRadius:8, shadowOffset:{width:0,height:4}, elevation:8 },
  numeral: { position:'absolute', width:20, textAlign:'center' as const, fontSize:16, fontWeight:'700' as const },
  hand:    { position:'absolute' },
  pivot:   { position:'absolute', width:14, height:14, borderRadius:7, borderWidth:2 },
});

// ─── Neon Clock ───────────────────────────────────────────────────────────────
export function NeonClock({ accent, text, muted }: { accent: string; text: string; muted: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const H = now.getHours().toString().padStart(2,'0');
  const M = now.getMinutes().toString().padStart(2,'0');
  const S = now.getSeconds().toString().padStart(2,'0');
  return (
    <View style={NE.wrap}>
      <View style={{ position: 'relative' }}>
        <Text style={[NE.glow, { color: accent, textShadowColor: accent }]}>{H}:{M}</Text>
        <Text style={[NE.main, { color: '#fff', textShadowColor: accent }]}>{H}:{M}</Text>
      </View>
      <Text style={[NE.seconds, { color: accent, textShadowColor: accent }]}>{S}</Text>
    </View>
  );
}
const NE = StyleSheet.create({
  wrap:    { alignItems: 'center', paddingTop: 24, paddingBottom: 14, gap: 6 },
  glow:    { position: 'absolute', left: 0, right: 0, textAlign: 'center' as const, opacity: 0.55,
             fontSize: 92, fontWeight: '300' as const, letterSpacing: 4, includeFontPadding: false, textShadowRadius: 18 },
  main:    { fontSize: 92, fontWeight: '300' as const, letterSpacing: 4, includeFontPadding: false, textShadowRadius: 8 },
  seconds: { fontSize: 22, fontWeight: '300' as const, letterSpacing: 6, marginTop: 8, textShadowRadius: 10 },
});

// ─── Weather Widget ───────────────────────────────────────────────────────────
export function WeatherWidget({ accent, text, muted }: { accent: string; text: string; muted: string }) {
  const { settings } = useSettings();
  const [weather, setWeather] = useState<{ temp: number; desc: string; icon: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const load = useCallback(async () => {
    const city = settings.weatherCity?.trim();
    if (!city) { setWeather(null); return; }
    // Debounce — don't refetch within 10 minutes
    if (Date.now() - lastFetchRef.current < 10 * 60 * 1000) return;
    lastFetchRef.current = Date.now();
    setLoading(true);
    try {
      const geo = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`,
        { headers: { 'User-Agent': 'presenceOS/1.0' } }
      );
      if (!geo.ok) { setLoading(false); return; }
      const gd = await geo.json();
      if (!Array.isArray(gd) || !gd.length) { setLoading(false); return; }
      const wx = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${gd[0].lat}&longitude=${gd[0].lon}&current=temperature_2m,weathercode&timezone=auto`
      );
      if (!wx.ok) { setLoading(false); return; }
      const wd = await wx.json();
      const cur = wd?.current;
      if (!cur || cur.temperature_2m == null) { setLoading(false); return; }
      const temp = Math.round(cur.temperature_2m);
      const code = cur.weathercode ?? 0;
      const desc = code<=1?'Clear':code<=3?'Partly Cloudy':code<=48?'Cloudy':code<=67?'Rain':code<=77?'Snow':'Storm';
      const icon = code<=1?'☀️':code<=3?'⛅':code<=48?'☁️':code<=67?'🌧️':code<=77?'❄️':'⛈️';
      setWeather({ temp, desc, icon });
    } catch {} finally { setLoading(false); }
  }, [settings.weatherCity]);

  // Load once on mount and when city changes
  useEffect(() => {
    lastFetchRef.current = 0; // reset so city change forces refetch
    load();
  }, [settings.weatherCity]); // eslint-disable-line

  // Refresh when app comes to foreground (e.g. after PIN entry) — NO interval timer
  useEffect(() => {
    const { AppState } = require('react-native');
    const sub = AppState.addEventListener('change', (state: string) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  if (!settings.weatherCity?.trim() || !settings.showWeather) return null;
  if (loading && !weather) return <Text style={{ color: muted, fontSize: 12 }}>···</Text>;
  if (!weather) return null;
  return (
    <View style={{ alignItems: 'center', marginTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 20 }}>{weather.icon}</Text>
        <Text style={{ color: text, fontSize: 28, fontWeight: '100' }}>{weather.temp}°</Text>
      </View>
      <Text style={{ color: muted, fontSize: 11, letterSpacing: 0.5 }}>{weather.desc}  ·  {settings.weatherCity.trim()}</Text>
    </View>
  );
}
