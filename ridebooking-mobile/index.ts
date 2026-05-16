import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import App from './App';

// Create the notification channel at startup so FCM background notifications
// can use it even when the app is killed and a screen hasn't mounted yet.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('ride-requests', {
    name: 'Ride Requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    sound: 'doorbell.wav',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

registerRootComponent(App);
