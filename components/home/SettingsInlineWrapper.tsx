import React from 'react';
import { View } from 'react-native';
import SettingsScreen from '@/app/settings';

export default function SettingsInlineWrapper({ onBack }: { onBack?: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <SettingsScreen onBack={onBack} />
    </View>
  );
}
