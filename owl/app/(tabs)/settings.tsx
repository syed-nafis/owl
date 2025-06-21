import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

// Server configuration
const HOME_SERVER_URL = 'http://192.168.0.102:9000';  // Your Mac running the home server
const PI_SERVER_URL = 'http://192.168.0.107:8000';    // Your Pi's Flask server
const PI_CAMERA_IP = '192.168.0.107';

// Predefined camera roles
const CAMERA_ROLES = [
  'Front Door',
  'Living Room',
  'Bedroom',
  'Kitchen',
];

// Define the Camera interface
interface Camera {
  id: string;
  name: string;
  role: string;
  isOnline: boolean;
  isStreaming: boolean;
  notifications: boolean;
  recordMotion: boolean;
}

// Single Pi Camera instance
const DEFAULT_CAMERA: Camera = {
  id: '1',
  name: 'Pi Camera',
  role: CAMERA_ROLES[0],
  isOnline: true,
  isStreaming: false,
  notifications: true,
  recordMotion: true,
};

// Mock data for connected cameras
const MOCK_CAMERAS: Camera[] = [
  {
    id: '1',
    name: 'Front Door',
    role: CAMERA_ROLES[0],
    isOnline: true,
    isStreaming: false,
    notifications: true,
    recordMotion: true,
  },
  {
    id: '2',
    name: 'Backyard',
    role: CAMERA_ROLES[1],
    isOnline: false,
    isStreaming: false,
    notifications: true,
    recordMotion: true,
  },
  {
    id: '3',
    name: 'Living Room',
    role: CAMERA_ROLES[2],
    isOnline: true,
    isStreaming: false,
    notifications: false,
    recordMotion: false,
  },
  {
    id: '4',
    name: 'Kitchen',
    role: CAMERA_ROLES[3],
    isOnline: true,
    isStreaming: false,
    notifications: true,
    recordMotion: true,
  },
];

export default function SettingsScreen() {
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [serverConnected, setServerConnected] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const [motionSensitivity, setMotionSensitivity] = useState('Medium');
  const [storagePath, setStoragePath] = useState('/home/pi/surveillance');
  const [maxStorageGB, setMaxStorageGB] = useState('32');
  const colorScheme = useColorScheme() ?? 'light';

  // Test server connection on mount
  useEffect(() => {
    const testServerConnection = async () => {
      try {
        console.log('Testing server connections...');
        
        // Test Pi server connection
        const piResponse = await fetch(`${PI_SERVER_URL}/status`);
        const piData = await piResponse.json();
        console.log('Pi server response:', piData);
        
        // Test home server connection
        const homeResponse = await fetch(`${HOME_SERVER_URL}/status`);
        const homeData = await homeResponse.json();
        console.log('Home server response:', homeData);
        
        setServerConnected(true);
        setCamera(prev => ({
          ...prev,
          isStreaming: homeData.streaming || piData.streaming,
          isOnline: true
        }));
      } catch (error) {
        console.error('Server connection error:', error);
        setServerConnected(false);
        setCamera(prev => ({ ...prev, isOnline: false }));
        Alert.alert(
          'Connection Error',
          'Could not connect to one or both servers. Please check if both servers are running and accessible.'
        );
      }
    };

    testServerConnection();
  }, []);

  // Function to toggle camera online/offline
  const toggleStreaming = async () => {
    try {
      console.log('Attempting to toggle camera online/offline...');
      const endpoint = camera.isStreaming ? '/stop-stream' : '/start-stream';
      
      // First, call the Pi server to start/stop the camera
      const piResponse = await fetch(`${PI_SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!piResponse.ok) {
        throw new Error('Failed to control Pi camera');
      }
      
      // Then, call the home server to start/stop recording
      const homeResponse = await fetch(`${HOME_SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ip: PI_CAMERA_IP }),
      });

      if (!homeResponse.ok) {
        // If home server fails, stop the Pi camera
        if (!camera.isStreaming) {
          await fetch(`${PI_SERVER_URL}/stop-stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            }
          });
        }
        throw new Error('Failed to communicate with home server');
      }

      setCamera(prev => ({
        ...prev,
        isStreaming: !prev.isStreaming,
        isOnline: !prev.isStreaming // Update isOnline status to match streaming state
      }));
    } catch (error: any) {
      console.error('Camera toggle error:', error);
      Alert.alert(
        'Error',
        `Failed to toggle camera online status: ${error?.message || 'Unknown error'}. Please check your connection and ensure both servers are running.`
      );
    }
  };

  // Function to handle camera settings changes
  const handleCameraToggle = (field: 'notifications' | 'recordMotion'): void => {
    setCamera(prev => ({ ...prev, [field]: !prev[field] }));
  };

  // Function to handle role change
  const handleRoleChange = (role: string): void => {
    console.log('Role changed to:', role);
    setCamera(prev => ({ ...prev, role }));
  };

  // Check camera status periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${HOME_SERVER_URL}/status`);
        if (response.ok) {
          const data = await response.json();
          setCamera(prev => ({
            ...prev,
            isStreaming: data.streaming,
            isOnline: true,
          }));
        } else {
          setCamera(prev => ({ ...prev, isOnline: false }));
        }
      } catch (error) {
        setCamera(prev => ({ ...prev, isOnline: false }));
      }
    };

    const interval = setInterval(checkStatus, 5000);
    checkStatus(); // Initial check

    return () => clearInterval(interval);
  }, []);

  const renderCameraItem = () => (
    <View 
      style={[styles.cameraItem, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}
    >
      <View style={styles.cameraHeader}>
        <View style={styles.cameraNameContainer}>
          <View 
            style={[
              styles.statusIndicator, 
              { backgroundColor: serverConnected ? Colors[colorScheme].success : Colors[colorScheme].danger }
            ]}
          />
          <Text style={[styles.cameraName, { color: Colors[colorScheme].text }]}>
            {camera.name} {serverConnected ? '(Server Connected)' : '(Server Disconnected)'}
          </Text>
        </View>
      </View>
      
      <View style={styles.cameraDetails}>
        <Text style={[styles.cameraInfo, { color: Colors[colorScheme].gray }]}>
          IP: {PI_CAMERA_IP} • Role: {camera.role}
        </Text>
        
        <View style={[styles.roleSelector, { borderColor: Colors[colorScheme].cardBorder }]}>
          <Text style={[styles.controlLabel, { color: Colors[colorScheme].text }]}>Camera Role</Text>
          <View style={styles.roleButtonsContainer}>
            {CAMERA_ROLES.map(role => (
              <TouchableOpacity
                key={role}
                style={[
                  styles.roleButton,
                  camera.role === role && { backgroundColor: Colors[colorScheme].primary },
                  { borderColor: Colors[colorScheme].cardBorder }
                ]}
                onPress={() => handleRoleChange(role)}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    { color: camera.role === role ? '#fff' : Colors[colorScheme].text }
                  ]}
                >
                  {role}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      
      <View style={styles.cameraControls}>
        <View style={styles.controlItem}>
          <Text style={[styles.controlLabel, { color: Colors[colorScheme].text }]}>Camera Online</Text>
          <Switch
            value={camera.isStreaming}
            onValueChange={toggleStreaming}
            trackColor={{ false: '#767577', true: Colors[colorScheme].primary }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.controlItem}>
          <Text style={[styles.controlLabel, { color: Colors[colorScheme].text }]}>Notifications</Text>
          <Switch
            value={camera.notifications}
            onValueChange={() => handleCameraToggle('notifications')}
            trackColor={{ false: '#767577', true: Colors[colorScheme].primary }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.controlItem}>
          <Text style={[styles.controlLabel, { color: Colors[colorScheme].text }]}>Record Motion</Text>
          <Switch
            value={camera.recordMotion}
            onValueChange={() => handleCameraToggle('recordMotion')}
            trackColor={{ false: '#767577', true: Colors[colorScheme].primary }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </View>
  );
  
  return (
    <View style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      <ScrollView>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            Camera Settings
          </Text>
          
          <View style={styles.cameraList}>
            {renderCameraItem()}
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            Notifications
          </Text>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              Enable Notifications
            </Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#767577', true: Colors[colorScheme].primary }}
              thumbColor="#fff"
            />
          </View>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              Motion Sensitivity
            </Text>
            <View style={styles.segmentedControl}>
              {['Low', 'Medium', 'High'].map(option => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.segmentOption,
                    motionSensitivity === option && { 
                      backgroundColor: Colors[colorScheme].primary 
                    }
                  ]}
                  onPress={() => setMotionSensitivity(option)}
                >
                  <Text 
                    style={[
                      styles.segmentText,
                      { color: motionSensitivity === option ? '#fff' : Colors[colorScheme].text }
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            Storage
          </Text>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              Storage Path
            </Text>
            <TextInput
              style={[styles.textInput, { 
                color: Colors[colorScheme].text,
                backgroundColor: Colors[colorScheme].card,
                borderColor: Colors[colorScheme].cardBorder
              }]}
              value={storagePath}
              onChangeText={setStoragePath}
            />
          </View>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              Max Storage (GB)
            </Text>
            <TextInput
              style={[styles.textInput, { 
                color: Colors[colorScheme].text,
                backgroundColor: Colors[colorScheme].card,
                borderColor: Colors[colorScheme].cardBorder
              }]}
              value={maxStorageGB}
              onChangeText={setMaxStorageGB}
              keyboardType="numeric"
            />
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            Appearance
          </Text>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              Dark Mode
            </Text>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: '#767577', true: Colors[colorScheme].primary }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 12,
  },
  cameraList: {
    marginTop: 8,
  },
  cameraItem: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  cameraNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  cameraName: {
    fontSize: 16,
    fontWeight: '600',
  },
  cameraDetails: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  cameraInfo: {
    fontSize: 14,
  },
  cameraControls: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  controlItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  addCameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
  },
  addCameraText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingLabel: {
    fontSize: 16,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(150,150,150,0.2)',
  },
  segmentText: {
    fontWeight: '500',
  },
  textInput: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
    width: 200,
    fontSize: 14,
  },
  roleSelector: {
    marginTop: 12,
    padding: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  roleButtonsContainer: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  roleButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    minWidth: '48%',
    alignItems: 'center',
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pickerContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: 'rgba(150,150,150,0.2)',
    overflow: 'hidden',
  },
  picker: {
    height: 40,
    width: '100%',
  },
}); 