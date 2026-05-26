/**
 * Navigation redirect — launches PresenceTurnByTurn app.
 * This screen should never be visible; it immediately deep-links to the Turn app.
 */
import { useEffect } from 'react';
import { Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';

export default function NavigationScreen() {
  const router = useRouter();
  useEffect(() => {
    Linking.openURL('presencenav://')
      .catch(() => {
        Alert.alert(
          'PresenceTurnByTurn not installed',
          'Install the PresenceTurnByTurn app to use navigation.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      });
    // Always go back — this screen is a passthrough
    router.back();
  }, []);
  return null;
}
