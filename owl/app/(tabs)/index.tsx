import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  TouchableOpacity, 
  Text, 
  Alert, 
  Animated,
  ActivityIndicator
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import MjpegViewer from '../../components/MjpegViewer';
import { useColorScheme } from '../../hooks/useColorScheme';
import Colors from '../../constants/Colors';
import { 
  SERVER_CONFIG, 
  loadServerUrl, 
  PI_CONFIG, 
  loadPiConfig,
  connectToPi 
} from '../../constants/Config';

// Server and camera configuration
let PI_CAMERA_IP = PI_CONFIG.ip; // Your Pi IP address
let PI_SERVER_PORT = PI_CONFIG.port; // Your Pi server port
let PI_SERVER_URL = PI_CONFIG.url; // Full Pi server URL
let HOME_SERVER_URL = SERVER_CONFIG.serverUrl;

export default function LiveViewScreen() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState("Pi Camera");
  const [isLoading, setIsLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [cameraStatus, setCameraStatus] = useState({
    online: false,
    recording: false
  });
  const [serverStatus, setServerStatus] = useState({
    online: false,
    lastChecked: new Date()
  });
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);
  
  const colorScheme = useColorScheme();
  // Use a safe color scheme that handles null/undefined
  const theme = colorScheme ?? 'light';
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Check camera status on component mount and load server URL
  useEffect(() => {
    const loadConfig = async () => {
      // Load server configuration
      await loadServerUrl();
      HOME_SERVER_URL = SERVER_CONFIG.serverUrl;
      console.log('Live view screen using server URL:', HOME_SERVER_URL);
      
      // Load PI configuration
      await loadPiConfig();
      PI_CAMERA_IP = PI_CONFIG.ip;
      PI_SERVER_PORT = PI_CONFIG.port;
      PI_SERVER_URL = PI_CONFIG.url;
      console.log('Live view screen using PI URL:', PI_SERVER_URL);
      
      // Check server connectivity after loading URL
      checkServerStatus();
    };
    
    loadConfig();
    checkCameraStatus();
    
    // Poll for camera and server status every 5 seconds
    const interval = setInterval(() => {
      checkCameraStatus();
      checkServerStatus();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  const checkCameraStatus = async () => {
    try {
      // Use the robust connection function - we don't need to log errors here
      const response = await connectToPi('/status')
        .catch(error => {
          // Don't log the error here, it's already handled in connectToPi
          setCameraStatus({
            online: false,
            recording: false
          });
          throw error;
        }) as Response;
      
      const data = await response.json();
      
      // Store previous recording state to detect changes
      const wasRecording = cameraStatus.recording;
      
      // Update camera status
      setCameraStatus({
        online: data.status === 'online',
        recording: data.recording
      });
      
      // If recording state changed, update the UI state accordingly
      if (data.recording !== wasRecording) {
        console.log('Recording state changed:', data.recording);
        setIsRecording(data.recording);
      }
    } catch (error) {
      // Error handling is done in the catch block of connectToPi
    }
  };
  
  const checkServerStatus = async () => {
    try {
      const response = await fetch(`${HOME_SERVER_URL}/status`);
      if (response.ok) {
        const data = await response.json();
        setServerStatus({
          online: true,
          lastChecked: new Date()
        });
        console.log('Server is online:', data);
      } else {
        setServerStatus({
          online: false,
          lastChecked: new Date()
        });
      }
    } catch (error) {
      console.error('Failed to check server status:', error);
      setServerStatus({
        online: false,
        lastChecked: new Date()
      });
    }
  };
  
  const startStreaming = async () => {
    setIsLoading(true);
    
    try {
      // Send request to start streaming using the robust connection function
      const response = await connectToPi('/start-stream', {
        method: 'POST'
      }) as Response;
      
      if (response.ok) {
        // Set up the stream URL
        const streamUrl = `${PI_SERVER_URL}/stream`;
        setStreamUrl(streamUrl);
        setIsStreaming(true);
        fadeIn();
      } else {
        Alert.alert('Error', 'Failed to start streaming');
      }
    } catch (error) {
      console.error('Error starting stream:', error);
      Alert.alert('Connection Error', 'Could not connect to camera. Please check if it is online.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const stopStreaming = async () => {
    try {
      // Send request to stop streaming using the robust connection function
      await connectToPi('/stop-stream', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Error stopping stream:', error);
    }
    
    setIsStreaming(false);
  };
  
  const toggleRecording = async () => {
    if (isRecordingLoading) return; // Prevent multiple clicks
    
    setIsRecordingLoading(true);
    try {
      if (isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } finally {
      setIsRecordingLoading(false);
    }
  };
  
  const startRecording = async () => {
    try {
      console.log('Attempting to start recording...');
      
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      // Send request directly to Pi camera server
      const fetchPromise = connectToPi('/start-recording', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Race the promises and explicitly type the response
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (response.ok) {
        const data = await response.json() as { success: boolean; message?: string };
        if (data.success) {
          console.log('Start recording request successful');
          setIsRecording(true);
          
          // Update the camera status to ensure UI consistency
          setCameraStatus(prev => ({
            ...prev,
            recording: true
          }));
          
          Alert.alert('Recording Started', 'Video is now being recorded');
          
          // Force check camera status to confirm the change
          setTimeout(() => {
            checkCameraStatus();
          }, 1000);
        } else {
          throw new Error(data.message || 'Failed to start recording');
        }
      } else {
        const errorText = await response.text();
        console.error('Server returned error when starting recording:', errorText);
        Alert.alert('Error', `Failed to start recording: ${errorText}`);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Could not start recording. Check camera connection.');
    }
  };
  
  const stopRecording = async () => {
    try {
      console.log('Attempting to stop recording...');
      
      // Send request directly to Pi camera server
      const response = await connectToPi('/stop-recording', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }) as Response;
      
      if (response.ok) {
        const data = await response.json() as { success: boolean; message?: string };
        if (data.success) {
          console.log('Stop recording request successful');
          setIsRecording(false);
          
          // Update the camera status to ensure UI consistency
          setCameraStatus(prev => ({
            ...prev,
            recording: false
          }));
          
          Alert.alert('Recording Stopped', 'Video recording has been stopped');
          
          // Force check camera status to confirm the change
          setTimeout(() => {
            checkCameraStatus();
          }, 1000);
        } else {
          throw new Error(data.message || 'Failed to stop recording');
        }
      } else {
        const errorText = await response.text();
        console.error('Server returned error when stopping recording:', errorText);
        Alert.alert('Error', `Failed to stop recording: ${errorText}`);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Could not stop recording. Check camera connection.');
      
      // Reset recording state to ensure UI consistency
      setIsRecording(false);
      setCameraStatus(prev => ({
        ...prev,
        recording: false
      }));
    }
  };
  
  const takePicture = async () => {
    Alert.alert('Taking Picture', 'This feature is not implemented yet');
    // Would need to implement a screenshot API on the Pi Camera server
  };
  
  const fadeIn = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };
  
  return (
    <View style={styles.container}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      
      {!isStreaming ? (
        <View style={styles.startContainer}>
          <Text style={[styles.title, { color: Colors[theme].text }]}>
            {selectedCamera}
          </Text>
          <Text style={[styles.subtitle, { color: Colors[theme].gray }]}>
            {cameraStatus.online ? 'Camera is online and ready to stream' : 'Camera appears to be offline'}
          </Text>
          
          <View style={styles.statusBox}>
            <View style={styles.statusBadges}>
              <View style={[
                styles.statusBadge, 
                { backgroundColor: cameraStatus.online ? '#4ade80' : '#f87171' }
              ]}>
                <Ionicons name="videocam" size={12} color="#fff" />
                <Text style={styles.statusBadgeText}>
                  {cameraStatus.online ? 'Camera Online' : 'Camera Offline'}
                </Text>
              </View>
              
              <View style={[
                styles.statusBadge, 
                { backgroundColor: serverStatus.online ? '#4ade80' : '#f87171' }
              ]}>
                <Ionicons name="server" size={12} color="#fff" />
                <Text style={styles.statusBadgeText}>
                  {serverStatus.online ? 'Server Online' : 'Server Offline'}
                </Text>
              </View>
            </View>
            
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: Colors[theme].text }]}>Status:</Text>
              <View style={styles.statusValueContainer}>
                <View style={[styles.statusDot, { 
                  backgroundColor: cameraStatus.online ? Colors[theme].success : Colors[theme].danger 
                }]} />
                <Text style={[styles.statusValue, { color: Colors[theme].text }]}>
                  {cameraStatus.online ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: Colors[theme].text }]}>Recording:</Text>
              <View style={styles.statusValueContainer}>
                <View style={[styles.statusDot, { 
                  backgroundColor: cameraStatus.recording ? Colors[theme].danger : Colors[theme].gray 
                }]} />
                <Text style={[styles.statusValue, { color: Colors[theme].text }]}>
                  {cameraStatus.recording ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
          </View>
          
          <TouchableOpacity 
            style={[
              styles.startButton, 
              { backgroundColor: cameraStatus.online ? Colors[theme].primary : Colors[theme].gray },
            ]}
            onPress={startStreaming}
            disabled={isLoading || !cameraStatus.online}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="videocam" size={24} color="#fff" style={styles.buttonIcon} />
                <Text style={styles.buttonText}>Start Live View</Text>
              </>
            )}
          </TouchableOpacity>
          
          {cameraStatus.online && (
            <TouchableOpacity 
              style={[styles.recordButton, { backgroundColor: Colors[theme].danger }]}
              onPress={toggleRecording}
              disabled={isRecordingLoading}
            >
              {isRecordingLoading ? (
                <ActivityIndicator color="#fff" size="small" style={styles.buttonIcon} />
              ) : isRecording || cameraStatus.recording ? (
                <Ionicons name="stop" size={24} color="#fff" style={styles.buttonIcon} />
              ) : (
                <Ionicons name="radio-button-on" size={24} color="#fff" style={styles.buttonIcon} />
              )}
              <Text style={styles.buttonText}>
                {isRecording || cameraStatus.recording ? 'Stop Recording' : 'Start Recording'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.streamContainer}>
          <Animated.View style={[styles.videoContainer, { opacity: fadeAnim }]}>
            <MjpegViewer 
              streamUrl={streamUrl}
              style={styles.videoStream}
            />
            <View style={styles.statusBar}>
              <View style={styles.statusItem}>
                <View style={[styles.statusDot, { 
                  backgroundColor: isRecordingLoading 
                    ? Colors[theme].warning 
                    : (isRecording || cameraStatus.recording) 
                      ? Colors[theme].danger 
                      : Colors[theme].success 
                }]} />
                <Text style={[styles.statusText, { color: Colors[theme].text }]}>
                  {isRecordingLoading 
                    ? 'Changing...' 
                    : (isRecording || cameraStatus.recording) 
                      ? 'Recording' 
                      : 'Live'
                  }
                </Text>
              </View>
              <Text style={[styles.cameraName, { color: Colors[theme].text }]}>
                {selectedCamera}
              </Text>
            </View>
          </Animated.View>
          
          <View style={styles.controlsContainer}>
            <TouchableOpacity 
              style={[styles.controlButton, styles.roundButton]} 
              onPress={takePicture}
            >
              <Ionicons name="camera" size={28} color="#fff" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.controlButton, 
                styles.roundButton, 
                styles.primaryButton, 
                isRecording && { backgroundColor: Colors[theme].danger }
              ]} 
              onPress={toggleRecording}
              disabled={isRecordingLoading}
            >
              {isRecordingLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : isRecording ? (
                <Ionicons name="stop" size={28} color="#fff" />
              ) : (
                <Ionicons name="radio-button-on" size={28} color="#fff" />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.controlButton, styles.roundButton]} 
              onPress={stopStreaming}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  startContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  statusBox: {
    width: '80%',
    backgroundColor: 'rgba(200, 200, 200, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statusBadges: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  statusValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusValue: {
    fontSize: 16,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '80%',
    marginBottom: 16,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '80%',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 10,
  },
  cameraSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  cameraSelectorText: {
    fontSize: 16,
    fontWeight: '500',
  },
  streamContainer: {
    flex: 1,
  },
  videoContainer: {
    flex: 1,
  },
  videoStream: {
    flex: 1,
  },
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cameraName: {
    fontSize: 14,
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  roundButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  primaryButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ff3b30',
  },
});
