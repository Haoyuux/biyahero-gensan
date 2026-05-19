import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppSettings } from '../lib/settingsService';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import RiderHomeScreen from '../screens/rider/RiderHomeScreen';
import HistoryScreen from '../screens/rider/HistoryScreen';
import RiderProfileScreen from '../screens/rider/RiderProfileScreen';
import RiderMessagesScreen from '../screens/rider/RiderMessagesScreen';
import RemitScreen from '../screens/rider/RemitScreen';
import TeamScreen from '../screens/rider/TeamScreen';
import NewsScreen from '../screens/rider/NewsScreen';
import { useProfile } from '../contexts/AuthContext';
import * as Notifications from 'expo-notifications';
import { useUpdate } from '../contexts/UpdateContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const Tab = createBottomTabNavigator();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
const TabIcon = ({ icon, label, focused }: { icon: IoniconsName; label: string; focused: boolean }) => (
  <View style={tabStyles.iconWrap}>
    <Ionicons name={icon} size={22} color={focused ? '#030712' : '#9ca3af'} />
    <Text style={[tabStyles.label, focused && tabStyles.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
  </View>
);

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { updateAvailable, updateReady } = useUpdate();
  return (
    <View style={tabStyles.iconWrap}>
      <View>
        <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={focused ? '#030712' : '#9ca3af'} />
        {(updateAvailable || updateReady) && <View style={tabStyles.dot} />}
      </View>
      <Text style={[tabStyles.label, focused && tabStyles.labelActive]} numberOfLines={1} adjustsFontSizeToFit>Profile</Text>
    </View>
  );
}

interface Props { appSettings: AppSettings | null; }

export default function RiderNavigator({ appSettings }: Props) {
  const { profile, signOut } = useProfile();
  const isLeader = profile.role === 'team_leader';

  return (
    <View style={{ flex: 1 }}>
      {appSettings?.maintenance_mode === 'half' && (
        <View style={tabStyles.maintenanceBanner}>
          <Text style={tabStyles.maintenanceText}>
            ⚠ {appSettings.maintenance_message ?? 'Limited service. Some features are temporarily unavailable.'}
          </Text>
        </View>
      )}
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: tabStyles.bar,
          tabBarShowLabel: false,
        }}
      >
        <Tab.Screen
          name="RiderHome"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'home' : 'home-outline'} label="Home" focused={focused} /> }}
        >
          {() => <RiderHomeScreen profile={profile} onSignOut={signOut} />}
        </Tab.Screen>

        <Tab.Screen
          name="History"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'time' : 'time-outline'} label="History" focused={focused} /> }}
          component={HistoryScreen}
        />

        {(appSettings?.remittance_enabled !== false) && (
          <Tab.Screen
            name="Remit"
            options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'cash' : 'cash-outline'} label="Remit" focused={focused} /> }}
            component={RemitScreen}
          />
        )}

        {isLeader && (
          <Tab.Screen
            name="Team"
            options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'people' : 'people-outline'} label="Team" focused={focused} /> }}
            component={TeamScreen}
          />
        )}

        <Tab.Screen
          name="News"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'newspaper' : 'newspaper-outline'} label="News" focused={focused} /> }}
          component={NewsScreen}
        />

        <Tab.Screen
          name="Messages"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'chatbubbles' : 'chatbubbles-outline'} label="Messages" focused={focused} /> }}
          component={RiderMessagesScreen}
        />

        <Tab.Screen
          name="Profile"
          options={{ tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} /> }}
          component={RiderProfileScreen}
        />
      </Tab.Navigator>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    height: 72,
    paddingBottom: 8,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center', gap: 2, width: 60 },
  icon: { fontSize: 22, opacity: 0.35 },
  iconActive: { opacity: 1 },
  label: { fontSize: 9, fontWeight: '600', color: '#9ca3af', textAlign: 'center' },
  labelActive: { color: '#030712' },
  maintenanceBanner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  maintenanceText: { fontSize: 12, color: '#92400e', fontWeight: '500', textAlign: 'center' },
  dot: { position: 'absolute', top: -2, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
});
