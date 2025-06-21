import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

// Mock data for timeline events
const MOCK_EVENTS = [
  {
    id: '1',
    type: 'motion',
    camera: 'Front Door',
    timestamp: '2023-06-10T14:30:00',
    description: 'Motion detected',
    thumbnail: 'https://via.placeholder.com/100x100/333/fff?text=Motion',
    priority: 'medium',
  },
  {
    id: '2',
    type: 'person',
    camera: 'Front Door',
    timestamp: '2023-06-10T14:32:00',
    description: 'Person detected',
    thumbnail: 'https://via.placeholder.com/100x100/333/fff?text=Person',
    priority: 'high',
    personName: null,
  },
  {
    id: '3',
    type: 'person',
    camera: 'Kitchen',
    timestamp: '2023-06-10T12:15:00',
    description: 'Known person detected',
    thumbnail: 'https://via.placeholder.com/100x100/333/fff?text=Adam',
    priority: 'medium',
    personName: 'Adam',
  },
  {
    id: '4',
    type: 'motion',
    camera: 'Backyard',
    timestamp: '2023-06-09T20:45:00',
    description: 'Motion detected',
    thumbnail: 'https://via.placeholder.com/100x100/333/fff?text=Motion',
    priority: 'low',
  },
  {
    id: '5',
    type: 'person',
    camera: 'Front Door',
    timestamp: '2023-06-09T18:20:00',
    description: 'Unknown person detected',
    thumbnail: 'https://via.placeholder.com/100x100/333/fff?text=Unknown',
    priority: 'high',
    personName: null,
  },
  {
    id: '6',
    type: 'system',
    timestamp: '2023-06-09T17:30:00',
    description: 'Camera offline',
    camera: 'Living Room',
    priority: 'high',
  },
  {
    id: '7',
    type: 'person',
    camera: 'Kitchen',
    timestamp: '2023-06-09T15:40:00',
    description: 'Known person detected',
    thumbnail: 'https://via.placeholder.com/100x100/333/fff?text=Sarah',
    priority: 'medium',
    personName: 'Sarah',
  },
  {
    id: '8',
    type: 'system',
    timestamp: '2023-06-08T09:15:00',
    description: 'System update completed',
    priority: 'low',
  },
];

// Group events by date
const groupEventsByDate = (events) => {
  const grouped = {};
  
  events.forEach(event => {
    const date = new Date(event.timestamp);
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
  const [groupedEvents, setGroupedEvents] = useState(groupEventsByDate(MOCK_EVENTS));
  const colorScheme = useColorScheme();
  
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };
  
  const getEventIcon = (type, priority) => {
    switch(type) {
      case 'motion':
        return <Ionicons name="move" size={24} color={priorityColors[priority]} />;
      case 'person':
        return <Ionicons name="person" size={24} color={priorityColors[priority]} />;
      case 'system':
        return <Ionicons name="cog" size={24} color={priorityColors[priority]} />;
      default:
        return <Ionicons name="alert-circle" size={24} color={priorityColors[priority]} />;
    }
  };
  
  const renderTimelineEvent = ({ item }) => (
    <TouchableOpacity 
      style={[
        styles.eventCard, 
        { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }
      ]}
      onPress={() => console.log('View event details', item.id)}
    >
      <View style={styles.eventTime}>
        <Text style={[styles.timeText, { color: Colors[colorScheme].gray }]}>
          {formatTime(item.timestamp)}
        </Text>
      </View>
      
      <View style={[styles.eventLine, { backgroundColor: priorityColors[item.priority] }]} />
      
      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          {getEventIcon(item.type, item.priority)}
          <View style={styles.headerTextContainer}>
            <Text style={[styles.eventTitle, { color: Colors[colorScheme].text }]}>
              {item.description}
            </Text>
            {item.camera && (
              <Text style={[styles.eventSubtitle, { color: Colors[colorScheme].gray }]}>
                {item.camera}
              </Text>
            )}
          </View>
        </View>
        
        {item.thumbnail && (
          <View style={styles.thumbnailContainer}>
            <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
            {item.personName && (
              <View style={styles.nameTag}>
                <Text style={styles.nameText}>{item.personName}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
  
  const renderDateSection = ({ item }) => (
    <View style={styles.dateSection}>
      <View style={styles.dateSectionHeader}>
        <Text style={[styles.dateText, { color: Colors[colorScheme].text }]}>{item.date}</Text>
        <View style={[styles.dateLine, { backgroundColor: Colors[colorScheme].lightGray }]} />
      </View>
      <FlatList
        data={item.data}
        renderItem={renderTimelineEvent}
        keyExtractor={(event) => event.id}
        scrollEnabled={false}
      />
    </View>
  );
  
  return (
    <View style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, { backgroundColor: Colors[colorScheme].primary }]}
        >
          <Text style={styles.filterButtonText}>All Events</Text>
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={groupedEvents}
        renderItem={renderDateSection}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.listContainer}
      />
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
    marginBottom: 16,
  },
  dateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
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
  eventTime: {
    width: 60,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  timeText: {
    fontSize: 14,
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
    marginLeft: 10,
    flex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  eventSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  thumbnailContainer: {
    marginTop: 10,
    position: 'relative',
  },
  thumbnail: {
    height: 150,
    width: '100%',
    borderRadius: 6,
  },
  nameTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  nameText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
}); 