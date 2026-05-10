import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import RiderHomeScreen from '../screens/rider/RiderHomeScreen';
import HistoryScreen from '../screens/rider/HistoryScreen';
import RemitScreen from '../screens/rider/RemitScreen';
import TeamScreen from '../screens/rider/TeamScreen';
import NewsScreen from '../screens/rider/NewsScreen';
import { useProfile } from '../contexts/AuthContext';

const Tab = createBottomTabNavigator();

const TabIcon = ({ icon, label, focused }: { icon: string; label: string; focused: boolean }) => (
  <View style={tabStyles.iconWrap}>
    <Text style={[tabStyles.icon, focused && tabStyles.iconActive]}>{icon}</Text>
    <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>{label}</Text>
  </View>
);

export default function RiderNavigator() {
  const { profile, signOut } = useProfile();
  const isLeader = profile.role === 'team_leader';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: tabStyles.bar,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="RiderHome"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Home" focused={focused} /> }}
      >
        {() => <RiderHomeScreen profile={profile} onSignOut={signOut} />}
      </Tab.Screen>

      <Tab.Screen
        name="History"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🕐" label="History" focused={focused} /> }}
        component={HistoryScreen}
      />

      <Tab.Screen
        name="Remit"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="💵" label="Remit" focused={focused} /> }}
        component={RemitScreen}
      />

      {isLeader && (
        <Tab.Screen
          name="Team"
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👥" label="Team" focused={focused} /> }}
          component={TeamScreen}
        />
      )}

      <Tab.Screen
        name="News"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📰" label="News" focused={focused} /> }}
        component={NewsScreen}
      />
    </Tab.Navigator>
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
  iconWrap: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  icon: { fontSize: 22, opacity: 0.35 },
  iconActive: { opacity: 1 },
  label: { fontSize: 10, fontWeight: '600', color: '#9ca3af' },
  labelActive: { color: '#030712' },
});
