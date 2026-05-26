export interface AppDefinition {
  id: string;
  name: string;
  icon: string;
  route: string;
  color: string;
  description?: string;
}

export const presenceApps: AppDefinition[] = [
  { id: 'messages', name: 'Messages', icon: 'MessageCircle', route: '/messages', color: '#3ABFAD' },
  { id: 'phone', name: 'Phone', icon: 'Phone', route: '/phone', color: '#4ADE80' },
  { id: 'contacts', name: 'Contacts', icon: 'Nfc', route: '/contacts', color: '#E8A838' },
  { id: 'directory', name: 'Directory', icon: 'BadgeCheck', route: '/directory', color: '#22C55E' },
  { id: 'camera', name: 'Camera', icon: 'Camera', route: '/camera', color: '#64748B' },
  { id: 'music', name: 'Music', icon: 'Music', route: '/music', color: '#E85490' },
  { id: 'browser', name: 'Browse', icon: 'Globe', route: '/browser', color: '#5B8DEF' },
  { id: 'navigation', name: 'Navigate', icon: 'Navigation', route: '/navigation-screen', color: '#8B5CF6' },
  { id: 'guardian', name: 'Guardian', icon: 'ShieldCheck', route: '/guardian', color: '#F472B6' },
  { id: 'tools', name: 'Tools', icon: 'Wrench', route: '/tools', color: '#F97316' },
  { id: 'settings', name: 'Settings', icon: 'Settings', route: '/settings', color: '#6B7280' },
];

