import React from 'react';
import { View, StyleSheet } from 'react-native';
import ChatHistoryScreen from '../user/ChatHistoryScreen';
import { useProfile } from '../../contexts/AuthContext';

export default function RiderMessagesScreen() {
  const { profile } = useProfile();
  return (
    <View style={styles.container}>
      <ChatHistoryScreen
        visible
        userId={profile.id}
        role="rider"
        asTab
        onClose={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
