import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme].tabBackground,
          borderTopWidth: 0,
        },
        tabBarLabelStyle: {
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: Colors[colorScheme].background,
        },
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerTintColor: Colors[colorScheme].text,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Live View',
          tabBarIcon: ({ color }) => <Ionicons name="videocam" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="recordings"
        options={{
          title: 'Recordings',
          tabBarIcon: ({ color }) => <Ionicons name="film" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'Timeline',
          tabBarIcon: ({ color }) => <Ionicons name="time" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="faces"
        options={{
          title: 'Faces',
          tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
