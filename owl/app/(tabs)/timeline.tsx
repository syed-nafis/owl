import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Video } from 'expo-av';

// Server configuration - using the same values as in other screens
const HOME_SERVER_IP = '192.168.0.102'; // Your home server IP
const HOME_SERVER_PORT = 9000; // Your home server port
const SERVER_URL = `http://${HOME_SERVER_IP}:${HOME_SERVER_PORT}`;

// Define interface for timeline events
interface TimelineEvent {
  detection_id: string;
  detection_type: string;
  object_class: string;
  camera_role: string;
  detection_time: string;
  confidence: number;
  video_id: string;
  filename: string;
  path: string;
  bounding_box: string;
  person_name?: string;
}

// Group events by date
const groupEventsByDate = (events: TimelineEvent[]) => {
  const grouped: Record<string, TimelineEvent[]> = {};
  
  events.forEach(event => {
    const date = new Date(event.detection_time);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    
    if (!grouped[dateStr]) {
      grouped[dateStr] = [];
    }
    
    grouped[dateStr].push(event);
  });
  
  // Convert to array format for FlatList
  return Object.keys(grouped).map(date => ({
    date,
    data: grouped[date],
  }));
};

export default function TimelineScreen() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [isVideoModalVisible, setIsVideoModalVisible] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoadingClip, setIsLoadingClip] = useState(false);
  const colorScheme = useColorScheme();
  
  // Fetch timeline events from server
  const fetchTimelineEvents = async () => {
    try {
      setLoading(true);
      
      // Build query parameters
      let url = `${SERVER_URL}/timeline`;
      if (filterType) {
        url += `?type=${filterType}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.timeline) {
        setEvents(data.timeline);
        setGroupedEvents(groupEventsByDate(data.timeline));
      } else {
        setEvents([]);
        setGroupedEvents([]);
      }
    } catch (error) {
      console.error('Error fetching timeline events:', error);
      Alert.alert('Error', 'Failed to load timeline events. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // Initial load
  useEffect(() => {
    fetchTimelineEvents();
  }, [filterType]);
  
  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchTimelineEvents();
  };
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  
  const getEventIcon = (type: string, objectClass: string) => {
    // Determine priority based on detection type
    let priority = 'medium';
    
    if (type === 'person' && objectClass === 'person') {
      priority = 'high';
    } else if (type === 'animal') {
      priority = 'medium';
    }
    
    // Choose icon based on detection type and object class
    switch(type) {
      case 'person':
        return <Ionicons name="person" size={24} color={priorityColors[priority]} />;
      case 'animal':
        return <Ionicons name="paw" size={24} color={priorityColors[priority]} />;
      case 'object':
        return <Ionicons name="cube" size={24} color={priorityColors[priority]} />;
      default:
        return <Ionicons name="alert-circle" size={24} color={priorityColors[priority]} />;
    }
  };
  
  const getEventDescription = (event: TimelineEvent) => {
    if (event.detection_type === 'person') {
      if (event.person_name && event.person_name !== 'Unknown') {
        return `${event.person_name} detected`;
      }
      return 'Person detected';
    }
    
    return `${event.object_class} detected`;
  };
  
  const getThumbnailUrl = (event: TimelineEvent) => {
    // In a real implementation, you would generate thumbnails from video frames
    // For now, we'll use placeholder images based on detection type
    const baseUrl = 'https://via.placeholder.com/100x100/333/fff?text=';
    
    if (event.detection_type === 'person') {
      if (event.person_name && event.person_name !== 'Unknown') {
        return `${baseUrl}${encodeURIComponent(event.person_name)}`;
      }
      return `${baseUrl}Person`;
    }
    
    return `${baseUrl}${encodeURIComponent(event.object_class)}`;
  };
  
  const renderTimelineEvent = ({ item }: { item: TimelineEvent }) => (
    <TouchableOpacity 
      style={[
        styles.eventCard, 
        { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }
      ]}
      onPress={() => handleEventPress(item)}
    >
      <View style={styles.eventTime}>
        <Text style={[styles.timeText, { color: Colors[colorScheme].gray }]}>
          {formatTime(item.detection_time)}
        </Text>
        <View style={[styles.cameraRoleTag, { backgroundColor: Colors[colorScheme].primary }]}>
          <Text style={styles.cameraRoleText}>{item.camera_role}</Text>
        </View>
      </View>
      
      <View style={[styles.eventLine, { backgroundColor: priorityColors[item.detection_type === 'person' ? 'high' : 'medium'] }]} />
      
      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          {getEventIcon(item.detection_type, item.object_class)}
          <View style={styles.headerTextContainer}>
            <Text style={[styles.eventTitle, { color: Colors[colorScheme].text }]}>
              {getEventDescription(item)}
            </Text>
          </View>
        </View>
        
        <View style={styles.thumbnailContainer}>
          <Image source={{ uri: getThumbnailUrl(item) }} style={styles.thumbnail} />
          {item.person_name && item.person_name !== 'Unknown' && (
            <View style={styles.nameTag}>
              <Text style={styles.nameText}>{item.person_name}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
  
  const renderDateSection = ({ item }: { item: any }) => (
    <View style={styles.dateSection}>
      <View style={styles.dateSectionHeader}>
        <Text style={[styles.dateText, { color: Colors[colorScheme].text }]}>{item.date}</Text>
        <View style={[styles.dateLine, { backgroundColor: Colors[colorScheme].lightGray }]} />
      </View>
      <FlatList
        data={item.data}
        renderItem={renderTimelineEvent}
        keyExtractor={(event) => event.detection_id.toString()}
        scrollEnabled={false}
      />
    </View>
  );
  
  // Show filter options
  const showFilterOptions = () => {
    Alert.alert(
      "Filter Timeline",
      "Select event type to display",
      [
        {
          text: "All Events",
          onPress: () => setFilterType(null),
        },
        {
          text: "People",
          onPress: () => setFilterType('person'),
        },
        {
          text: "Animals",
          onPress: () => setFilterType('animal'),
        },
        {
          text: "Objects",
          onPress: () => setFilterType('object'),
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };
  
  // Get filter button text
  const getFilterButtonText = () => {
    switch(filterType) {
      case 'person':
        return 'People';
      case 'animal':
        return 'Animals';
      case 'object':
        return 'Objects';
      default:
        return 'All Events';
    }
  };
  
  const handleEventPress = async (event: TimelineEvent) => {
    try {
      setIsLoadingClip(true);
      setSelectedEvent(event);
      setIsVideoModalVisible(true);

      // Request the clip from the server
      const response = await fetch(`${SERVER_URL}/api/clips/${event.detection_id}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch video clip');
      }

      const data = await response.json();
      if (data.url) {
        setVideoUrl(`${SERVER_URL}${data.url}`);
      } else {
        throw new Error('No video clip available');
      }
    } catch (error) {
      console.error('Error fetching video clip:', error);
      Alert.alert(
        'Error',
        'Failed to load video clip. Please try again later.',
        [{ text: 'OK', onPress: () => setIsVideoModalVisible(false) }]
      );
    } finally {
      setIsLoadingClip(false);
    }
  };

  const closeVideoModal = () => {
    setIsVideoModalVisible(false);
    setSelectedEvent(null);
    setVideoUrl(null);
  };
  
  return (
    <View style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, { backgroundColor: Colors[colorScheme].primary }]}
          onPress={showFilterOptions}
        >
          <Text style={styles.filterButtonText}>{getFilterButtonText()}</Text>
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].primary} />
          <Text style={[styles.loadingText, { color: Colors[colorScheme].text }]}>
            Loading timeline...
          </Text>
        </View>
      ) : groupedEvents.length > 0 ? (
        <FlatList
          data={groupedEvents}
          renderItem={renderDateSection}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[Colors[colorScheme].primary]}
              tintColor={Colors[colorScheme].primary}
            />
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color={Colors[colorScheme].gray} />
          <Text style={[styles.emptyText, { color: Colors[colorScheme].text }]}>
            No events found
          </Text>
          <Text style={[styles.emptySubtext, { color: Colors[colorScheme].gray }]}>
            Events will appear here when detected
          </Text>
          <TouchableOpacity 
            style={[styles.refreshButton, { backgroundColor: Colors[colorScheme].primary }]}
            onPress={handleRefresh}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isVideoModalVisible}
        onRequestClose={closeVideoModal}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme].card }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeVideoModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors[colorScheme].text }]}>
                {selectedEvent?.detection_type === 'person' && selectedEvent?.person_name
                  ? `${selectedEvent.person_name} Detected`
                  : `${selectedEvent?.object_class || 'Object'} Detected`}
              </Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.videoContainer}>
              {isLoadingClip ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors[colorScheme].primary} />
                  <Text style={[styles.loadingText, { color: Colors[colorScheme].text }]}>
                    Loading clip...
                  </Text>
                </View>
              ) : videoUrl ? (
                <Video
                  style={styles.video}
                  source={{ uri: videoUrl }}
                  useNativeControls
                  shouldPlay
                  resizeMode="contain"
                  isLooping={false}
                />
              ) : (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={48} color={Colors[colorScheme].danger} />
                  <Text style={[styles.errorText, { color: Colors[colorScheme].text }]}>
                    Failed to load video clip
                  </Text>
                </View>
              )}
            </View>

            {selectedEvent && (
              <View style={styles.eventDetails}>
                <Text style={[styles.detailText, { color: Colors[colorScheme].text }]}>
                  Time: {new Date(selectedEvent.detection_time).toLocaleString()}
                </Text>
                <Text style={[styles.detailText, { color: Colors[colorScheme].text }]}>
                  Camera: {selectedEvent.camera_role}
                </Text>
                <Text style={[styles.detailText, { color: Colors[colorScheme].text }]}>
                  Confidence: {Math.round(selectedEvent.confidence * 100)}%
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Define priority colors
const priorityColors = {
  'high': '#ef4444',    // Red
  'medium': '#f59e0b',  // Amber
  'low': '#10b981',     // Green
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  filterButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginRight: 6,
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  dateSection: {
    marginBottom: 24,
  },
  dateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontWeight: 'bold',
    fontSize: 16,
    marginRight: 12,
  },
  dateLine: {
    flex: 1,
    height: 1,
  },
  eventCard: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 80,
  },
  eventTime: {
    width: 80,
    paddingVertical: 12,
    paddingLeft: 12,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  cameraRoleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
  },
  cameraRoleText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  eventLine: {
    width: 3,
  },
  eventContent: {
    flex: 1,
    padding: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 8,
  },
  eventTitle: {
    fontWeight: '600',
    fontSize: 14,
  },
  thumbnailContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 120,
    borderRadius: 8,
  },
  nameTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  nameText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 12,
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
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  refreshButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  closeButton: {
    padding: 4,
  },
  headerSpacer: {
    width: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
  },
  eventDetails: {
    padding: 16,
  },
  detailText: {
    fontSize: 14,
    marginBottom: 8,
  },
}); 