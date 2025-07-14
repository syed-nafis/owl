import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/Colors';
import { useColorScheme } from '../hooks/useColorScheme';
import { SERVER_URL, API_ENDPOINTS } from '../constants/Config';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  room?: string;
  timestamp: string;
  actions?: string[];
  status: string;
  userResponse?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  alert?: boolean;
  success?: boolean;
}

// Fetch timeout helper
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export default function NotificationsContent() {
  const colorScheme = useColorScheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchNotifications = async () => {
    try {
      setError(null);
      console.log('Fetching notifications from:', `${SERVER_URL}${API_ENDPOINTS.notifications}`);
      
      const response = await fetchWithTimeout(
        `${SERVER_URL}${API_ENDPOINTS.notifications}`,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        },
        5000 // 5 second timeout
      );

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Notifications response:', data);

      if (data.success) {
        setNotifications(data.notifications);
        setLastUpdate(new Date());
      } else {
        throw new Error(data.error || 'Failed to fetch notifications');
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      let errorMessage = 'Failed to fetch notifications';
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please check your connection.';
        } else if (error.message.includes('Network request failed')) {
          errorMessage = 'Network error. Please check if the server is running and accessible.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      
      // Show error alert with more details
      Alert.alert(
        'Connection Error',
        `Unable to fetch notifications:\n${errorMessage}\n\nServer: ${SERVER_URL}\nLast update: ${lastUpdate?.toLocaleString() || 'Never'}`,
        [
          { 
            text: 'Retry',
            onPress: () => fetchNotifications()
          },
          { text: 'OK' }
        ]
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleAction = async (notificationId: string, action: string) => {
    try {
      setError(null);
      console.log('Sending notification action:', { notificationId, action });
      
      const response = await fetchWithTimeout(
        `${SERVER_URL}${API_ENDPOINTS.notificationResponse(notificationId)}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action }),
        },
        5000 // 5 second timeout
      );
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Action response:', data);
      
      // Update the local notification status immediately
      setNotifications(prevNotifications => 
        prevNotifications.map(notif => 
          notif.id === notificationId
            ? { ...notif, status: 'responded', userResponse: action }
            : notif
        )
      );
      
      // Then refresh all notifications
      fetchNotifications();
    } catch (error) {
      console.error('Error handling notification action:', error);
      Alert.alert(
        'Action Failed',
        'Failed to process action. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    }
  };

  // Set up auto-refresh
  useEffect(() => {
    fetchNotifications();
    
    // Refresh notifications every 30 seconds
    const refreshInterval = setInterval(() => {
      if (!refreshing && !loading) {
        console.log('Auto-refreshing notifications...');
        fetchNotifications();
      }
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <Text style={[styles.loadingText, { color: Colors[colorScheme].text }]}>
          Loading notifications...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Ionicons name="alert-circle" size={48} color={Colors[colorScheme].danger} />
        <Text style={[styles.emptyText, { color: Colors[colorScheme].text }]}>
          Connection Error
        </Text>
        <Text style={[styles.emptySubtext, { color: Colors[colorScheme].gray }]}>
          Pull down to try again
        </Text>
      </ScrollView>
    );
  }

  if (notifications.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Ionicons name="notifications-off" size={48} color={Colors[colorScheme].text} />
        <Text style={[styles.emptyText, { color: Colors[colorScheme].text }]}>
          No notifications
        </Text>
        <Text style={[styles.emptySubtext, { color: Colors[colorScheme].gray }]}>
          You'll see notifications here when there's activity in your home
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.listContainer}>
        {notifications.map((notification) => (
          <View
            key={notification.id}
            style={[
              styles.notificationCard,
              {
                backgroundColor: Colors[colorScheme].cardBackground,
                borderColor: Colors[colorScheme].cardBorder,
                borderLeftColor: notification.type === 'smart_lighting' 
                  ? '#4CAF50' 
                  : Colors[colorScheme].tint,
              },
            ]}
          >
            <View style={styles.notificationHeader}>
              <Ionicons
                name={notification.type === 'smart_lighting' ? 'bulb' : 'notifications'}
                size={24}
                color={notification.type === 'smart_lighting' ? '#4CAF50' : Colors[colorScheme].tint}
              />
              <View style={styles.notificationInfo}>
                <Text style={[styles.notificationTitle, { color: Colors[colorScheme].text }]}>
                  {notification.title}
                </Text>
                <Text style={[styles.notificationTime, { color: Colors[colorScheme].gray }]}>
                  {new Date(notification.timestamp).toLocaleString()}
                </Text>
              </View>
              {notification.status !== 'pending' && (
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: notification.status === 'responded' ? '#4CAF50' : '#FF9800' }
                ]}>
                  <Text style={styles.statusText}>
                    {notification.status === 'responded' ? 'Responded' : 'Timeout'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.notificationMessage, { color: Colors[colorScheme].text }]}>
              {notification.message}
            </Text>

            {notification.room && (
              <View style={styles.roomInfo}>
                <Ionicons name="home" size={16} color={Colors[colorScheme].gray} />
                <Text style={[styles.roomText, { color: Colors[colorScheme].gray }]}>
                  {notification.room}
                </Text>
              </View>
            )}

            {notification.status === 'pending' && notification.actions && (
              <View style={styles.actionButtons}>
                {notification.actions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.actionButton,
                      {
                        backgroundColor: action.toLowerCase().includes('off')
                          ? '#4CAF50'
                          : Colors[colorScheme].secondary,
                      },
                    ]}
                    onPress={() => handleAction(notification.id, action)}
                  >
                    <Text style={styles.actionButtonText}>{action}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {notification.status !== 'pending' && notification.userResponse && (
              <View style={styles.responseInfo}>
                <Text style={[styles.responseText, { color: Colors[colorScheme].gray }]}>
                  Response: {notification.userResponse}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  notificationCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  notificationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  notificationTime: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  notificationMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  roomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  roomText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  responseInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
  },
  responseText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
}); 