import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';

// Server configuration - using the same values as in index.tsx
const HOME_SERVER_IP = '192.168.0.102'; // Your home server IP
const HOME_SERVER_PORT = 9000; // Your home server port
const SERVER_URL = `http://${HOME_SERVER_IP}:${HOME_SERVER_PORT}`;

// Define the interface for video records
interface VideoRecord {
  id: string;
  name: string;
  path: string;
  size: number;
  created: string;
  duration?: string | null;
  cameraIp?: string | null;
  timestamp?: string;
}

// Define interface for ScrollableFilter props
interface ScrollableFilterProps {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
  colorScheme: string;
}

// Video player component
function VideoPlayerView({ videoUri, onClose, title }: { videoUri: string, onClose: () => void, title: string }) {
  const player = useVideoPlayer(videoUri, player => {
    player.play();
  });
  
  return (
    <View style={styles.videoPlayerOverlay}>
      <View style={styles.videoPlayerContainer}>
        <TouchableOpacity 
          style={styles.closeVideoButton}
          onPress={onClose}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        
        <VideoView
          player={player}
          style={styles.videoPlayer}
          nativeControls={true}
          contentFit="contain"
        />
        
        <Text style={styles.videoTitle}>{title}</Text>
      </View>
    </View>
  );
}

export default function RecordingsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [recordings, setRecordings] = useState<VideoRecord[]>([]);
  const [filteredRecordings, setFilteredRecordings] = useState<VideoRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoRecord | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const colorScheme = useColorScheme();
  // Use a safe color scheme that handles null/undefined
  const theme = colorScheme ?? 'light';
  
  // Fetch videos on component mount
  useEffect(() => {
    fetchVideos();
    
    // Set up a refresh interval (every 60 seconds)
    const interval = setInterval(() => {
      fetchVideos();
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchVideos = async () => {
    try {
      // Fetch videos from server
      const response = await fetch(`${SERVER_URL}/videos-list`);
      
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.videos) {
        // Format the video records
        const videoRecords: VideoRecord[] = data.videos.map((video: any, index: number) => ({
          id: String(index),
          name: video.name,
          path: `${SERVER_URL}${video.path}`,
          size: video.size,
          created: video.created,
          duration: video.duration || formatDuration(estimateDuration(video.size)),
          cameraIp: video.cameraIp || 'Pi Camera',
          timestamp: video.timestamp || video.created
        }));
        
        setRecordings(videoRecords);
        filterRecordings('all', videoRecords);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      Alert.alert('Error', 'Failed to fetch videos from server');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };
  
  // Estimate video duration based on file size (rough approximation)
  const estimateDuration = (sizeInBytes: number): number => {
    // Very rough estimate: 1MB ≈ 10 seconds of 720p video at reasonable bitrate
    const durationInSeconds = sizeInBytes / (100 * 1024); // 100KB/second
    return Math.max(1, Math.round(durationInSeconds));
  };
  
  // Format seconds to MM:SS format
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const filterRecordings = (filter: string, videos = recordings) => {
    setActiveFilter(filter);
    
    if (filter === 'all') {
      setFilteredRecordings(
        videos.filter(recording => 
          recording.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    } else if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      setFilteredRecordings(
        videos.filter(recording => {
          const recordingDate = new Date(recording.created);
          return recordingDate >= today && 
                 recording.name.toLowerCase().includes(searchQuery.toLowerCase());
        })
      );
    } else if (filter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      setFilteredRecordings(
        videos.filter(recording => {
          const recordingDate = new Date(recording.created);
          return recordingDate >= weekAgo && 
                 recording.name.toLowerCase().includes(searchQuery.toLowerCase());
        })
      );
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    filterRecordings(activeFilter);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (e) {
      return 'Unknown date';
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  };
  
  const extractCameraInfo = (filename: string) => {
    // Extract camera info from filename
    // Example: "segment_20231115_123456.mp4" -> "Segment from Nov 15"
    // Example: "upload_2023-11-15-12-34-56_segment_20231115_123456.mp4" -> "Upload from Nov 15"
    
    try {
      if (filename.startsWith('segment_')) {
        // Extract date from format "segment_YYYYMMDD_HHMMSS.mp4"
        const dateMatch = filename.match(/segment_(\d{4})(\d{2})(\d{2})_/);
        if (dateMatch) {
          const [_, year, month, day] = dateMatch;
          const date = new Date(`${year}-${month}-${day}`);
          return `Segment from ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
      } else if (filename.startsWith('upload_')) {
        // Extract date from format "upload_YYYY-MM-DD-HH-mm-ss_..."
        const dateMatch = filename.match(/upload_(\d{4})-(\d{2})-(\d{2})-/);
        if (dateMatch) {
          const [_, year, month, day] = dateMatch;
          const date = new Date(`${year}-${month}-${day}`);
          return `Upload from ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
      }
      
      return filename; // Fallback to filename if parsing fails
    } catch (e) {
      return filename;
    }
  };

  const handlePlayVideo = (video: VideoRecord) => {
    setCurrentVideo(video);
    setIsPlaying(true);
  };
  
  const closeVideoPlayer = () => {
    setIsPlaying(false);
    setCurrentVideo(null);
  };
  
  const onRefresh = () => {
    setRefreshing(true);
    fetchVideos();
  };

  const renderRecordingItem = ({ item }: { item: VideoRecord }) => {
    // Generate a thumbnail placeholder if not available
    const thumbnailPlaceholder = `https://via.placeholder.com/400x225/333/fff?text=${encodeURIComponent(item.name.substring(0, 20))}`;
    
    return (
      <TouchableOpacity 
        style={[styles.recordingCard, { backgroundColor: Colors[theme].card, borderColor: Colors[theme].cardBorder }]}
        onPress={() => handlePlayVideo(item)}
      >
        <Image source={{ uri: thumbnailPlaceholder }} style={styles.thumbnail} />
        <View style={styles.cardOverlay}>
          <Text style={styles.duration}>{item.duration}</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: Colors[theme].text }]}>
            {extractCameraInfo(item.name)}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardSubtitle, { color: Colors[theme].gray }]}>
              {formatDate(item.timestamp || item.created)}
            </Text>
            <Text style={[styles.cardSubtitle, { color: Colors[theme].gray }]}>
              {formatFileSize(item.size)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors[theme].background }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      
      {isPlaying && currentVideo && (
        <VideoPlayerView 
          videoUri={currentVideo.path}
          onClose={closeVideoPlayer}
          title={extractCameraInfo(currentVideo.name)}
        />
      )}
      
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: Colors[theme].card, borderColor: Colors[theme].cardBorder }]}>
          <Ionicons name="search" size={20} color={Colors[theme].gray} />
          <TextInput
            style={[styles.searchInput, { color: Colors[theme].text }]}
            placeholder="Search recordings..."
            placeholderTextColor={Colors[theme].gray}
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={20} color={Colors[theme].gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
          <ScrollableFilter 
            label="All" 
            icon="albums-outline" 
            active={activeFilter === 'all'} 
            onPress={() => filterRecordings('all')}
            colorScheme={theme}
          />
          <ScrollableFilter 
            label="Today" 
            icon="today-outline" 
            active={activeFilter === 'today'} 
            onPress={() => filterRecordings('today')}
            colorScheme={theme}
          />
          <ScrollableFilter 
            label="This week" 
            icon="calendar-outline" 
            active={activeFilter === 'week'} 
            onPress={() => filterRecordings('week')}
            colorScheme={theme}
          />
        </ScrollView>
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[theme].primary} />
          <Text style={[styles.loadingText, { color: Colors[theme].text }]}>Loading recordings...</Text>
        </View>
      ) : filteredRecordings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-off-outline" size={64} color={Colors[theme].gray} />
          <Text style={[styles.emptyText, { color: Colors[theme].text }]}>No recordings found</Text>
          <Text style={[styles.emptySubtext, { color: Colors[theme].gray }]}>
            {activeFilter !== 'all' ? 'Try changing your filter' : 'Start recording to see videos here'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecordings}
          renderItem={renderRecordingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors[theme].primary]}
              tintColor={Colors[theme].primary}
            />
          }
        />
      )}
    </View>
  );
}

function ScrollableFilter({ label, icon, active, onPress, colorScheme }: ScrollableFilterProps) {
  return (
    <TouchableOpacity
      style={[
        styles.filterButton,
        active && { backgroundColor: Colors[colorScheme].primary }
      ]}
      onPress={onPress}
    >
      <Ionicons 
        name={icon} 
        size={16} 
        color={active ? '#fff' : Colors[colorScheme].gray} 
      />
      <Text 
        style={[
          styles.filterText,
          { color: active ? '#fff' : Colors[colorScheme].text }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    paddingVertical: 4,
  },
  filtersContainer: {
    marginBottom: 8,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: 'rgba(150,150,150,0.1)',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  recordingCard: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  thumbnail: {
    width: '100%',
    height: 180,
    backgroundColor: '#333',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 80,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  duration: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardContent: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSubtitle: {
    fontSize: 14,
  },
  tagsContainer: {
    flexDirection: 'row',
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
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
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  videoPlayerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  videoPlayerContainer: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoPlayer: {
    width: '100%',
    height: 300,
  },
  closeVideoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitle: {
    color: '#fff',
    padding: 16,
    fontSize: 16,
    fontWeight: '600',
  }
}); 