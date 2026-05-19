import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AdminLiveScreen from '../screens/admin/AdminLiveScreen';
import RiderVerificationScreen from '../screens/admin/RiderVerificationScreen';
import AdminRemittancesScreen from '../screens/admin/AdminRemittancesScreen';
import UserBlockingScreen from '../screens/admin/UserBlockingScreen';
import AdminProfileScreen from '../screens/admin/AdminProfileScreen';
import AdminMoreNavigator from './AdminMoreNavigator';
import { useUpdate } from '../contexts/UpdateContext';

const Tab = createBottomTabNavigator();
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TabIcon = ({ icon, label, focused }: { icon: IoniconsName; label: string; focused: boolean }) => (
  <View style={t.iconWrap}>
    <Ionicons name={icon} size={22} color={focused ? '#030712' : '#9ca3af'} />
    <Text style={[t.label, focused && t.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
  </View>
);

function MoreTabIcon({ focused }: { focused: boolean }) {
  const { updateAvailable, updateReady } = useUpdate();
  return (
    <View style={t.iconWrap}>
      <View>
        <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={focused ? '#030712' : '#9ca3af'} />
        {(updateAvailable || updateReady) && <View style={t.dot} />}
      </View>
      <Text style={[t.label, focused && t.labelActive]} numberOfLines={1} adjustsFontSizeToFit>More</Text>
    </View>
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: t.bar, tabBarShowLabel: false }}>
      <Tab.Screen
        name="AdminLive"
        component={AdminLiveScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'radio' : 'radio-outline'} label="Live" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminVerify"
        component={RiderVerificationScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} label="Verify" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminRemit"
        component={AdminRemittancesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'cash' : 'cash-outline'} label="Remit" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminBlocking"
        component={UserBlockingScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'ban' : 'ban-outline'} label="Blocking" focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminMore"
        component={AdminMoreNavigator}
        options={{ tabBarIcon: ({ focused }) => <MoreTabIcon focused={focused} /> }}
      />
      <Tab.Screen
        name="AdminProfile"
        component={AdminProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon={focused ? 'person' : 'person-outline'} label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

export default function AdminNavigator() {
  return <AdminTabs />;
}

const t = StyleSheet.create({
  bar: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6',
    height: 72, paddingBottom: 8, paddingTop: 8, elevation: 0, shadowOpacity: 0,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center', gap: 2, width: 60 },
  label: { fontSize: 9, fontWeight: '600', color: '#9ca3af', textAlign: 'center' },
  labelActive: { color: '#030712' },
  dot: {
    position: 'absolute', top: -2, right: -4,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444',
  },
});
