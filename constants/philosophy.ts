export interface PhilosophyTip {
  id: string;
  screen: string;
  title: string;
  message: string;
  icon: string;
}

export const philosophyTips: PhilosophyTip[] = [
  {
    id: 'home_welcome',
    screen: 'home',
    title: 'Your Space, Your Rules',
    message: 'presenceOS isn\'t just software — it\'s a philosophy. No algorithms deciding what you see. No ads harvesting your attention. You\'re in control here.',
    icon: 'Sparkles',
  },
  {
    id: 'browser_intro',
    screen: 'browser',
    title: 'Browse Intentionally',
    message: 'The internet is powerful — but it\'s designed to trap your attention. We block social media logins because you deserve better than being a product. If you try, we\'ll show you something actually interesting instead.',
    icon: 'Globe',
  },
  {
    id: 'messages_privacy',
    screen: 'messages',
    title: 'Conversations Have a Lifespan',
    message: 'Every conversation on presenceOS has an agreed expiry. Because real conversations happen in the moment — not archived forever for data brokers.',
    icon: 'Timer',
  },
  {
    id: 'music_offline',
    screen: 'music',
    title: 'Music Without the Machine',
    message: 'Streaming services track every beat to build your profile. Here, you can play local files freely or use Spotify/Deezer through our interface — no recommendation rabbit holes.',
    icon: 'Music',
  },
  {
    id: 'phone_real',
    screen: 'phone',
    title: 'Voice Over Void',
    message: 'A phone call is intimate — two people, one moment. No read receipts, no typing indicators, no performance. Just connection.',
    icon: 'Phone',
  },
  {
    id: 'navigation_freedom',
    screen: 'navigation',
    title: 'Go Somewhere Real',
    message: 'Navigation should get you places, not track where you\'ve been. Your routes aren\'t stored, sold, or profiled. Just turn-by-turn, then gone.',
    icon: 'Navigation',
  },
  {
    id: 'contacts_nfc',
    screen: 'contacts',
    title: 'Real Connections Only',
    message: 'You can only add people by physically tapping devices together. No follower counts. No friend requests from strangers. If you haven\'t met in person, you haven\'t really met.',
    icon: 'Nfc',
  },
  {
    id: 'tools_utility',
    screen: 'tools',
    title: 'Your Device, More Uses',
    message: 'A phone can be a monitor, a speaker, a keyboard. These tools exist so your device serves you — not the other way around.',
    icon: 'Wrench',
  },
  {
    id: 'settings_control',
    screen: 'settings',
    title: 'Transparency by Default',
    message: 'Every toggle here does exactly what it says. No buried settings, no dark patterns, no "are you sure you want to protect your privacy?" guilt trips.',
    icon: 'Shield',
  },
  {
    id: 'profile_identity',
    screen: 'profile',
    title: 'Identity Without Exhibition',
    message: 'Your profile exists for you, not for an audience. No public discovery, no search results, no performance metrics. Just your space.',
    icon: 'User',
  },
  {
    id: 'guardian_safety',
    screen: 'guardian',
    title: 'Safety Without Surveillance',
    message: 'Guardian Relay is a dignified safety net. No always-on tracking, no behavioral profiling. Only event-based notifications when you need help — because safety shouldn\'t cost your privacy.',
    icon: 'Shield',
  },
  {
    id: 'directory_trust',
    screen: 'directory',
    title: 'Trust, Not Tricks',
    message: 'Every number here is human-verified. No sponsored results, no paid placements, no fake listings. Scams often start with "search this number" — we remove that vector entirely.',
    icon: 'Shield',
  },
];

export const WIKIPEDIA_REDIRECTS = [
  { title: 'How the Internet Actually Works', url: 'https://en.wikipedia.org/wiki/Internet_protocol_suite' },
  { title: 'The History of Encryption', url: 'https://en.wikipedia.org/wiki/History_of_cryptography' },
  { title: 'How Transistors Changed the World', url: 'https://en.wikipedia.org/wiki/Transistor' },
  { title: 'The Story of Linux', url: 'https://en.wikipedia.org/wiki/Linux' },
  { title: 'What is Open Source?', url: 'https://en.wikipedia.org/wiki/Open-source_software' },
  { title: 'How GPS Actually Works', url: 'https://en.wikipedia.org/wiki/Global_Positioning_System' },
  { title: 'The Invention of WiFi', url: 'https://en.wikipedia.org/wiki/Wi-Fi' },
  { title: 'Quantum Computing Explained', url: 'https://en.wikipedia.org/wiki/Quantum_computing' },
  { title: 'The Mathematics of Cryptography', url: 'https://en.wikipedia.org/wiki/RSA_(cryptosystem)' },
  { title: 'How Fiber Optics Work', url: 'https://en.wikipedia.org/wiki/Fiber-optic_communication' },
  { title: 'The Story of Tim Berners-Lee', url: 'https://en.wikipedia.org/wiki/Tim_Berners-Lee' },
  { title: 'Machine Learning Basics', url: 'https://en.wikipedia.org/wiki/Machine_learning' },
  { title: 'How Satellites Orbit Earth', url: 'https://en.wikipedia.org/wiki/Satellite' },
  { title: 'The Physics of Semiconductors', url: 'https://en.wikipedia.org/wiki/Semiconductor' },
  { title: 'Digital Privacy & Surveillance', url: 'https://en.wikipedia.org/wiki/Mass_surveillance' },
  { title: 'The Attention Economy', url: 'https://en.wikipedia.org/wiki/Attention_economy' },
  { title: 'How Dopamine Hijacking Works', url: 'https://en.wikipedia.org/wiki/Behavioral_addiction' },
  { title: 'Surveillance Capitalism', url: 'https://en.wikipedia.org/wiki/Surveillance_capitalism' },
];

