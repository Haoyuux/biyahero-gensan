import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AdminMoreStackParamList } from './adminTypes';
import AdminModulesScreen from '../screens/admin/AdminModulesScreen';
import DriverManagementScreen from '../screens/admin/DriverManagementScreen';
import TeamManagementScreen from '../screens/admin/TeamManagementScreen';
import AdminNewsScreen from '../screens/admin/AdminNewsScreen';
import BookingAnalyticsScreen from '../screens/admin/BookingAnalyticsScreen';
import RevenueDashboardScreen from '../screens/admin/RevenueDashboardScreen';
import RideReviewsScreen from '../screens/admin/RideReviewsScreen';
import PricingConfigScreen from '../screens/admin/PricingConfigScreen';
import VouchersScreen from '../screens/admin/VouchersScreen';
import AppSettingsScreen from '../screens/admin/AppSettingsScreen';
import MaintenanceModeScreen from '../screens/admin/MaintenanceModeScreen';
import UserManagementScreen from '../screens/admin/UserManagementScreen';
import RolesPermissionsScreen from '../screens/admin/RolesPermissionsScreen';

const Stack = createNativeStackNavigator<AdminMoreStackParamList>();

export default function AdminMoreNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminModules" component={AdminModulesScreen} />
      <Stack.Screen name="DriverManagement" component={DriverManagementScreen} />
      <Stack.Screen name="TeamManagement" component={TeamManagementScreen} />
      <Stack.Screen name="AdminNews" component={AdminNewsScreen} />
      <Stack.Screen name="BookingAnalytics" component={BookingAnalyticsScreen} />
      <Stack.Screen name="RevenueDashboard" component={RevenueDashboardScreen} />
      <Stack.Screen name="RideReviews" component={RideReviewsScreen} />
      <Stack.Screen name="PricingConfig" component={PricingConfigScreen} />
      <Stack.Screen name="Vouchers" component={VouchersScreen} />
      <Stack.Screen name="AppSettings" component={AppSettingsScreen} />
      <Stack.Screen name="MaintenanceMode" component={MaintenanceModeScreen} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} />
      <Stack.Screen name="RolesPermissions" component={RolesPermissionsScreen} />
    </Stack.Navigator>
  );
}
