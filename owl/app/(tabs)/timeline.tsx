import React, { useState, useEffect, useCallback } from 'react';
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
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Video, ResizeMode } from 'expo-av';
import { SERVER_CONFIG, loadServerUrl } from '../../constants/Config';

// Server configuration - using the central config
let SERVER_URL = SERVER_CONFIG.serverUrl;

// Define interface for timeline events
interface DoorAccessInfo {
  isDoorAccess: boolean;
  eventType: string;
  personNames: string[];
  doorOpened: boolean;
  accessDenied: boolean;
  detectionSource: string;
  sessionId: string | null;
  buttonPress: boolean;
  timestamp: string;
  cameraRole: string;
  message: string;
}

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
  display_name?: string;
  doorAccessInfo?: DoorAccessInfo;
}

// Define pagination interface
interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [timePeriodFilter, setTimePeriodFilter] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [isVideoModalVisible, setIsVideoModalVisible] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoadingClip, setIsLoadingClip] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEvents, setFilteredEvents] = useState<TimelineEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 0, pageSize: 50, totalPages: 0 });
  const colorScheme = useColorScheme() ?? 'light';
  
  // Load server URL on mount
  useEffect(() => {
    const initializeAndFetch = async () => {
      await loadServerUrl();
      // Update SERVER_URL with the latest server URL
      SERVER_URL = SERVER_CONFIG.serverUrl;
      console.log('Timeline screen using server URL:', SERVER_URL);
      
      // Then fetch events
      await fetchTimelineEvents(0);
    };
    
    initializeAndFetch();
  }, []);
  
  // Effect to reset and refetch when filters change
  useEffect(() => {
    const resetAndRefetch = async () => {
      setEvents([]);
      setFilteredEvents([]);
      setGroupedEvents([]);
      setPagination({ total: 0, page: 0, pageSize: 50, totalPages: 0 });
      await fetchTimelineEvents(0);
    };
    
    resetAndRefetch();
  }, [filterType, timePeriodFilter]);
  
  // Effect to handle search
  useEffect(() => {
    // Debounce search to avoid too many requests while typing
    const debounceTimeout = setTimeout(() => {
      // Reset pagination when searching
      setPagination({ total: 0, page: 0, pageSize: 50, totalPages: 0 });
      setEvents([]);
      setFilteredEvents([]);
      setGroupedEvents([]);
      
      // Fetch new results with search applied
      fetchTimelineEvents(0); 
    }, 300); // 300ms debounce delay
    
    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]);
  
  // Fetch timeline events from server
  const fetchTimelineEvents = async (page: number) => {
    try {
      if (page === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      console.log('Fetching timeline events from:', SERVER_URL);
      
      // Ensure we have a valid server URL
      if (!SERVER_URL || SERVER_URL === 'http://localhost:9000') {
        await loadServerUrl();
        SERVER_URL = SERVER_CONFIG.serverUrl;
        console.log('Updated server URL before fetch:', SERVER_URL);
      }
      
      // Build query parameters
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', '50');
      
      if (filterType) {
        params.append('type', filterType);
      }
      
      if (timePeriodFilter) {
        params.append('timePeriod', timePeriodFilter);
      }
      
      // Add search parameter if there's a search query
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const url = `${SERVER_URL}/timeline?${params.toString()}`;
      console.log('Fetching timeline from: ', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.timeline) {
        if (page === 0) {
          // First page, replace existing data
          setEvents(data.timeline);
          setFilteredEvents(data.timeline);
          setGroupedEvents(groupEventsByDate(data.timeline));
        } else {
          // Subsequent page, append data
          const updatedEvents = [...events, ...data.timeline];
          setEvents(updatedEvents);
          setFilteredEvents(updatedEvents);
          setGroupedEvents(groupEventsByDate(updatedEvents));
        }
        
        // Update pagination info
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } else {
        if (page === 0) {
          setEvents([]);
          setFilteredEvents([]);
          setGroupedEvents([]);
        }
      }
    } catch (error) {
      console.error('Error fetching timeline events:', error);
      Alert.alert('Error', 'Failed to load timeline events. Pull down to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };
  
  // Handle refresh (pull down to refresh)
  const handleRefresh = () => {
    setRefreshing(true);
    setPagination({ ...pagination, page: 0 });
    fetchTimelineEvents(0);
  };
  
  // Handle load more when scrolling to end
  const handleLoadMore = () => {
    if (loadingMore) return; // Prevent multiple load more calls
    if (pagination.page >= pagination.totalPages - 1) return; // No more pages to load
    
    const nextPage = pagination.page + 1;
    fetchTimelineEvents(nextPage);
  };
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
      if (event.display_name) {
        // Remove any "segment" text from display name
        return event.display_name.replace(/segment/i, '').trim();
      } 
      // If display_name is not set, we follow the default logic for unknown person
      return 'Unknown person';
    }
    
    // Remove any "segment" text from object class
    return `${event.object_class}`.replace(/segment/i, '').trim() || event.detection_type;
  };
  
  const getThumbnailUrl = (event: TimelineEvent) => {
    // In a real implementation, you would generate thumbnails from video frames
    // For now, we'll use placeholder images based on detection type
    const baseUrl = 'https://via.placeholder.com/100x100/333/fff?text=';
    
    if (event.detection_type === 'person') {
      if (event.person_name && event.person_name !== 'Unknown person') {
        return `${baseUrl}${encodeURIComponent(event.person_name)}`;
      }
      return `${baseUrl}Person`;
    }
    
    return `${baseUrl}${encodeURIComponent(event.object_class)}`;
  };
  
  const renderTimelineEvent = ({ item }: { item: TimelineEvent }) => {
    const isUnknownPerson = item.detection_type === 'person' && 
      (!item.person_name || item.person_name === 'Unknown person');
    
    // Clean up camera role by removing the word "segment" if present
    const displayCameraRole = item.camera_role 
      ? item.camera_role.replace(/segment/gi, '').trim() || 'Camera'
      : 'Camera';
    
    return (
      <TouchableOpacity 
        style={[
          styles.eventCard, 
          { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }
        ]}
        onPress={() => handleEventPress(item)}
      >
        <View style={styles.eventLine} />
        
        <TouchableOpacity 
          style={styles.playButton}
          onPress={() => handleEventPress(item)}
        >
          <Ionicons name="play-circle" size={32} color={Colors[colorScheme].primary} />
        </TouchableOpacity>
        
        <View style={styles.eventContent}>
          <View style={styles.eventHeader}>
            {getEventIcon(item.detection_type, item.object_class)}
            <View style={styles.headerTextContainer}>
              <Text 
                style={[
                  styles.eventTitle, 
                  { 
                    color: isUnknownPerson ? '#ef4444' : Colors[colorScheme].text,
                    fontWeight: isUnknownPerson ? '700' : '600'
                  }
                ]}
              >
                {getEventDescription(item)}
              </Text>
              <Text style={[styles.timeText, { color: Colors[colorScheme].gray, marginTop: 4 }]}>
                {formatDateTime(item.detection_time)}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.eventLocation}>
          <View style={[styles.cameraRoleTag, { backgroundColor: Colors[colorScheme].primary }]}>
            <Text style={styles.cameraRoleText}>{displayCameraRole}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  
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
      
      // Handle door access events specially
      if (data.isDoorAccess) {
        setVideoUrl(null); // No video for door access events
        setSelectedEvent({
          ...event,
          doorAccessInfo: data // Store the door access information
        });
      } else if (data.url) {
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
  
  // Show time period filter options
  const showTimePeriodOptions = () => {
    Alert.alert(
      "Filter by Time Period",
      "Select time period to display",
      [
        {
          text: "All Time",
          onPress: () => setTimePeriodFilter(null),
        },
        {
          text: "Today",
          onPress: () => setTimePeriodFilter('today'),
        },
        {
          text: "Yesterday",
          onPress: () => setTimePeriodFilter('yesterday'),
        },
        {
          text: "This Week",
          onPress: () => setTimePeriodFilter('week'),
        },
        {
          text: "This Month",
          onPress: () => setTimePeriodFilter('month'),
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };
  
  // Get time period button text
  const getTimePeriodButtonText = () => {
    switch(timePeriodFilter) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      default:
        return 'All Time';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      {/* Filter search bar */}
      <View style={styles.topBarContainer}>
        <View style={[
          styles.searchContainer,
          { backgroundColor: colorScheme === 'dark' ? '#333' : '#f5f5f5' }
        ]}>
          <Ionicons 
            name="search" 
            size={20} 
            color={colorScheme === 'dark' ? '#888' : '#666'} 
            style={styles.searchIcon} 
          />
          <TextInput
            style={[
              styles.searchInput,
              { 
                color: Colors[colorScheme].text,
                backgroundColor: 'transparent' 
              }
            ]}
            placeholder="Search events..."
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity 
              style={styles.clearButton} 
              onPress={() => setSearchQuery('')}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      
      {/* Filter buttons */}
      <View style={styles.filterButtonContainer}>
        <View style={styles.filterButtonSpacer} />
        <TouchableOpacity 
          style={[styles.filterButton, { backgroundColor: Colors[colorScheme].primary }]}
          onPress={showFilterOptions}
        >
          <Text style={styles.filterButtonText}>{getFilterButtonText()}</Text>
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.filterButton, { backgroundColor: Colors[colorScheme].secondary }]}
          onPress={showTimePeriodOptions}
        >
          <Text style={styles.filterButtonText}>{getTimePeriodButtonText()}</Text>
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {/* Timeline content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].primary} />
          <Text style={[styles.loadingText, { color: Colors[colorScheme].text }]}>
            Loading timeline...
          </Text>
        </View>
      ) : groupedEvents.length > 0 ? (
        <>
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
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.loadMoreContainer}>
                  <ActivityIndicator size="small" color={Colors[colorScheme].primary} />
                  <Text style={[styles.loadMoreText, { color: Colors[colorScheme].text }]}>
                    Loading more events...
                  </Text>
                </View>
              ) : pagination.page < pagination.totalPages - 1 ? (
                <TouchableOpacity 
                  style={[styles.loadMoreButton, { backgroundColor: Colors[colorScheme].card }]}
                  onPress={() => handleLoadMore()}
                >
                  <Text style={[styles.loadMoreButtonText, { color: Colors[colorScheme].primary }]}>
                    Load more
                  </Text>
                </TouchableOpacity>
              ) : events.length > 0 ? (
                <Text style={[styles.endOfListText, { color: Colors[colorScheme].gray }]}>
                  End of timeline
                </Text>
              ) : null
            }
          />
          
          {/* Show count indicator */}
          <View style={[styles.countIndicator, { backgroundColor: Colors[colorScheme].primary + '99' }]}>
            <Text style={styles.countText}>
              Showing {events.length} of {pagination.total} events
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color={Colors[colorScheme].gray} />
          <Text style={[styles.emptyText, { color: Colors[colorScheme].text }]}>
            No events found
          </Text>
          <Text style={[styles.emptySubtext, { color: Colors[colorScheme].gray }]}>
            {searchQuery ? 'No events match your search' : timePeriodFilter ? `No events in the selected time period` : 'Events will appear here when detected'}
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
                {selectedEvent?.detection_type === 'person' && selectedEvent?.person_name && selectedEvent.person_name !== 'Unknown person'
                  ? `${selectedEvent.person_name}`
                  : selectedEvent?.detection_type === 'person' 
                    ? 'Unknown person'
                    : `${selectedEvent?.object_class || 'Object'}`}
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
              ) : selectedEvent?.doorAccessInfo ? (
                <View style={styles.doorAccessContainer}>
                  <Ionicons 
                    name={selectedEvent.doorAccessInfo.doorOpened ? "checkmark-circle" : "close-circle"} 
                    size={64} 
                    color={selectedEvent.doorAccessInfo.doorOpened ? Colors[colorScheme].success : Colors[colorScheme].danger} 
                  />
                  <Text style={[styles.doorAccessTitle, { color: Colors[colorScheme].text }]}>
                    Door Access Event
                  </Text>
                  <Text style={[styles.doorAccessMessage, { color: Colors[colorScheme].text }]}>
                    {selectedEvent.doorAccessInfo.message}
                  </Text>
                  
                  {selectedEvent.doorAccessInfo.personNames && selectedEvent.doorAccessInfo.personNames.length > 0 && (
                    <View style={styles.personInfo}>
                      <Text style={[styles.personLabel, { color: Colors[colorScheme].text }]}>
                        Person(s):
                      </Text>
                      <Text style={[styles.personNames, { color: Colors[colorScheme].primary }]}>
                        {selectedEvent.doorAccessInfo.personNames.join(', ')}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.accessStatus}>
                    <Text style={[styles.statusLabel, { color: Colors[colorScheme].text }]}>
                      Status:
                    </Text>
                    <Text style={[
                      styles.statusText, 
                      { color: selectedEvent.doorAccessInfo.doorOpened ? Colors[colorScheme].success : Colors[colorScheme].danger }
                    ]}>
                      {selectedEvent.doorAccessInfo.doorOpened ? 'Access Granted' : 'Access Denied'}
                    </Text>
                  </View>
                </View>
              ) : videoUrl ? (
                <Video
                  style={styles.video}
                  source={{ uri: videoUrl }}
                  useNativeControls
                  shouldPlay
                  resizeMode={ResizeMode.CONTAIN}
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
                  Camera: {selectedEvent.camera_role 
                    ? selectedEvent.camera_role.replace(/segment/gi, '').trim() || 'Camera' 
                    : 'Camera'}
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

// Define priority colors with proper typing
const priorityColors: Record<string, string> = {
  'high': '#ef4444',    // Red
  'medium': '#f59e0b',  // Amber
  'low': '#10b981',     // Green
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBarContainer: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButtonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 16,
    paddingTop: 6,
    justifyContent: 'flex-end',
  },
  filterButtonSpacer: {
    flex: 1,
  },
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadMoreText: {
    marginLeft: 8,
    fontSize: 14,
  },
  loadMoreButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    margin: 16,
  },
  loadMoreButtonText: {
    fontWeight: '600',
  },
  endOfListText: {
    textAlign: 'center',
    padding: 16,
    fontSize: 14,
  },
  countIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  countText: {
    color: '#fff',
    fontWeight: '600',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    marginRight: 8,
    overflow: 'hidden',
  },
  searchIcon: {
    paddingLeft: 12,
    backgroundColor: 'transparent',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 8,
    fontSize: 16,
    height: 40,
  },
  clearButton: {
    padding: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginHorizontal: 5,
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
  },
  eventLine: {
    width: 4,
    backgroundColor: '#ef4444',
  },
  eventContent: {
    flex: 1,
    padding: 12,
  },
  eventLocation: {
    padding: 12,
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cameraRoleTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  cameraRoleText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
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
    fontSize: 16,
  },
  playButton: {
    padding: 4,
    marginLeft: 8,
    justifyContent: 'center',
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
  doorAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  doorAccessTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  doorAccessMessage: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 20,
  },
  personInfo: {
    marginBottom: 16,
    alignItems: 'center',
  },
  personLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  personNames: {
    fontSize: 16,
    fontWeight: '600',
  },
  accessStatus: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
}); 