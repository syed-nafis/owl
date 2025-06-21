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

// Server and camera configuration
const PI_CAMERA_IP = '192.168.0.107'; // Your Pi IP address
const PI_SERVER_PORT = 8000; // Your Pi server port
const HOME_SERVER_IP = '192.168.0.102'; // Your home server IP
const HOME_SERVER_PORT = 9000; // Your home server port

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
  
  const colorScheme = useColorScheme();
  // Use a safe color scheme that handles null/undefined
  const theme = colorScheme ?? 'light';
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Check camera status on component mount
  useEffect(() => {
    checkCameraStatus();
    
    // Poll for camera status every 5 seconds
    const interval = setInterval(() => {
      checkCameraStatus();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  const checkCameraStatus = async () => {
    try {
      const response = await fetch(`http://${PI_CAMERA_IP}:${PI_SERVER_PORT}/status`);
      const data = await response.json();
      
      setCameraStatus({
        online: data.status === 'online',
        recording: data.recording
      });
      
      // If already recording, reflect that in the UI
      if (data.recording && !isRecording) {
        setIsRecording(true);
      }
    } catch (error) {
      console.error('Failed to check camera status:', error);
      setCameraStatus({
        online: false,
        recording: false
      });
    }
  };
  
  const startStreaming = async () => {
    setIsLoading(true);
    
    try {
      // Send request to start streaming
      const response = await fetch(`http://${PI_CAMERA_IP}:${PI_SERVER_PORT}/start-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        // Set up the stream URL
        const streamUrl = `http://${PI_CAMERA_IP}:${PI_SERVER_PORT}/stream`;
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
      // Send request to stop streaming
      await fetch(`http://${PI_CAMERA_IP}:${PI_SERVER_PORT}/stop-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error stopping stream:', error);
    }
    
    setIsStreaming(false);
  };
  
  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  const startRecording = async () => {
    try {
      // Send request to start recording to home server
      const response = await fetch(`http://${HOME_SERVER_IP}:${HOME_SERVER_PORT}/start-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ip: PI_CAMERA_IP })
      });
      
      if (response.ok) {
        setIsRecording(true);
        Alert.alert('Recording Started', 'Video is now being recorded and saved to server');
      } else {
        const error = await response.text();
        Alert.alert('Error', `Failed to start recording: ${error}`);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Could not start recording. Check server connection.');
    }
  };
  
  const stopRecording = async () => {
    try {
      // Send request to stop recording
      const response = await fetch(`http://${HOME_SERVER_IP}:${HOME_SERVER_PORT}/stop-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ip: PI_CAMERA_IP })
      });
      
      if (response.ok) {
        setIsRecording(false);
        Alert.alert('Recording Stopped', 'Video recording has been stopped');
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Could not stop recording');
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
          
          {cameraStatus.online && !cameraStatus.recording && (
            <TouchableOpacity 
              style={[styles.recordButton, { backgroundColor: Colors[theme].danger }]}
              onPress={startRecording}
            >
              <Ionicons name="radio-button-on" size={24} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Start Recording</Text>
            </TouchableOpacity>
          )}
          
          {cameraStatus.online && cameraStatus.recording && (
            <TouchableOpacity 
              style={[styles.recordButton, { backgroundColor: Colors[theme].danger }]}
              onPress={stopRecording}
            >
              <Ionicons name="stop" size={24} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Stop Recording</Text>
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
                <View style={[styles.statusDot, { backgroundColor: isRecording ? Colors[theme].danger : Colors[theme].success }]} />
                <Text style={[styles.statusText, { color: Colors[theme].text }]}>
                  {isRecording ? 'Recording' : 'Live'}
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
            >
              {isRecording ? (
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
