import React from 'react';
import { View, StyleSheet } from 'react-native';
import NotificationsContent from '../components/NotificationsContent';

export default function NotificationsModal() {
  return (
    <View style={styles.container}>
      <NotificationsContent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
}); 