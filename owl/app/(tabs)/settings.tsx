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
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';
import MjpegViewer from '../../components/MjpegViewer';
import { 
  SERVER_CONFIG, 
  loadServerUrl, 
  updateServerUrl, 
  detectServerUrl,
  PI_CONFIG,
  loadPiConfig,
  updatePiConfig,
  DETECTION_CLASSES,
  loadDetectionClassSettings,
  toggleDetectionCategory,
  toggleNotificationsCategory,
  syncDetectionClassSettings,
  pushDetectionClassSettings,
  toggleClassDetection
} from '../../constants/Config';

// Server configuration - loaded from central config
let HOME_SERVER_URL = SERVER_CONFIG.serverUrl;  // Your Mac running the home server
let PI_SERVER_URL = PI_CONFIG.url;    // Your Pi's Flask server
let PI_CAMERA_IP = PI_CONFIG.ip;

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

// Light detection configuration interface
interface LightDetectionConfig {
  day: {
    light_on_image?: string;
    light_off_image?: string;
    threshold_configured: boolean;
    brightness_threshold_low: number;
    brightness_threshold_high: number;
  };
  night: {
    light_on_image?: string;
    light_off_image?: string;
    threshold_configured: boolean;
    brightness_threshold_low: number;
    brightness_threshold_high: number;
  };
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
  const [serverUrl, setServerUrl] = useState(SERVER_CONFIG.serverUrl);
  const [isDetectingServer, setIsDetectingServer] = useState(false);
  
  // PI Camera configuration
  const [piIp, setPiIp] = useState(PI_CONFIG.ip);
  const [piPort, setPiPort] = useState(PI_CONFIG.port.toString());
  const [piConnected, setPiConnected] = useState(false);
  
  // Detection class settings
  const [detectionClasses, setDetectionClasses] = useState(() => {
    // Initialize with expanded: false for all categories
    const initialState = {...DETECTION_CLASSES};
    Object.keys(initialState).forEach(category => {
      initialState[category].expanded = false;
    });
    return initialState;
  });
  
  // Light detection configuration
  const [lightDetectionConfig, setLightDetectionConfig] = useState<LightDetectionConfig>({
    day: {
      threshold_configured: false,
      brightness_threshold_low: 50,
      brightness_threshold_high: 120
    },
    night: {
      threshold_configured: false,
      brightness_threshold_low: 25,
      brightness_threshold_high: 80
    }
  });
  
  const [lightDetectionExpanded, setLightDetectionExpanded] = useState({
    day: false,
    night: false
  });
  
  const [lightDetectionLoading, setLightDetectionLoading] = useState(false);
  const [lightDetectionStreamUrl, setLightDetectionStreamUrl] = useState("");
  const [lightDetectionStreaming, setLightDetectionStreaming] = useState(false);
  const [lightDetectionActiveSection, setLightDetectionActiveSection] = useState<'day' | 'night' | null>(null);
  const [lightDetectionImageType, setLightDetectionImageType] = useState<'on' | 'off' | null>(null);
  const [lightState, setLightState] = useState(false);
  const [lightControlLoading, setLightControlLoading] = useState(false);
  const [doorState, setDoorState] = useState(false);
  const [doorControlLoading, setDoorControlLoading] = useState(false);
  const [gasState, setGasState] = useState(false);
  const [gasControlLoading, setGasControlLoading] = useState(false);
  const [waterState, setWaterState] = useState(false);
  const [waterControlLoading, setWaterControlLoading] = useState(false);

  // Function to fetch initial light state
  const fetchLightState = async () => {
    try {
      const response = await fetch(`${HOME_SERVER_URL}/api/light-status`);
      if (response.ok) {
        const data = await response.json();
        setLightState(data.status === 'on');
      }
    } catch (error) {
      console.error('Error fetching light state:', error);
    }
  };

  // Function to fetch initial utility states
  const fetchUtilityStates = async () => {
    try {
      // Fetch gas state
      const gasResponse = await fetch(`${HOME_SERVER_URL}/api/gas/status`);
      if (gasResponse.ok) {
        const gasData = await gasResponse.json();
        setGasState(gasData.state === 'on');
      }

      // Fetch water state
      const waterResponse = await fetch(`${HOME_SERVER_URL}/api/water/status`);
      if (waterResponse.ok) {
        const waterData = await waterResponse.json();
        setWaterState(waterData.state === 'on');
      }
    } catch (error) {
      console.error('Error fetching utility states:', error);
    }
  };

  // Load server URL and test connection on mount
  useEffect(() => {
    const loadConfig = async () => {
      // Load server config
      const savedUrl = await loadServerUrl();
      if (savedUrl) {
        setServerUrl(savedUrl);
        HOME_SERVER_URL = savedUrl;
      }
      
      // Load PI config
      const piConfig = await loadPiConfig();
      setPiIp(piConfig.ip);
      setPiPort(piConfig.port.toString());
      PI_SERVER_URL = piConfig.url;
      PI_CAMERA_IP = piConfig.ip;
      
      // Load detection class settings
      const classSettings = await loadDetectionClassSettings();
      setDetectionClasses({...classSettings});
      
      // Load light detection config
      await loadLightDetectionConfig();
      
      // Fetch initial light state
      await fetchLightState();
      
      // Fetch initial utility states
      await fetchUtilityStates();
      
      // Test connections
      testServerConnection();
      testPiConnection();
      
      // Sync detection classes with server if connected
      if (serverConnected) {
        await syncDetectionClassSettings();
        // Refresh local state with synced settings
        setDetectionClasses({...DETECTION_CLASSES});
      }
    };
    
    loadConfig();
  }, []);
  
  // Test server connection
  const testServerConnection = async () => {
    try {
      console.log('Testing server connections...');
      console.log('Current HOME_SERVER_URL:', HOME_SERVER_URL);
      
      // Test Pi server connection
      try {
        console.log('Testing Pi server connection:', PI_SERVER_URL);
        const piResponse = await fetch(`${PI_SERVER_URL}/status`, { 
          timeout: 3000,
          headers: { 'Accept': 'application/json' }
        });
        const piData = await piResponse.json();
        console.log('Pi server response:', piData);
      } catch (piError) {
        console.warn('Pi server connection error:', piError);
        // Continue even if Pi server is not available
      }
      
      // Test home server connection
      console.log('Testing home server connection:', HOME_SERVER_URL);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      const fetchPromise = fetch(`${HOME_SERVER_URL}/status`, { 
        headers: { 'Accept': 'application/json' }
      });
      
      const homeResponse = await Promise.race([fetchPromise, timeoutPromise]);
      console.log('Home server response status:', homeResponse.status);
      
      if (homeResponse.ok) {
        const homeData = await homeResponse.json();
        console.log('Home server response data:', homeData);
        
        setServerConnected(true);
        setCamera(prev => ({
          ...prev,
          isStreaming: homeData.streaming,
          isOnline: true
        }));
        return true;
      } else {
        console.error('Home server returned error status:', homeResponse.status);
        throw new Error(`Server returned status ${homeResponse.status}`);
      }
    } catch (error) {
      console.error('Server connection error:', error);
      setServerConnected(false);
      setCamera(prev => ({ ...prev, isOnline: false }));
      return false;
    }
  };

  // Test PI connection
  const testPiConnection = async () => {
    try {
      console.log('Testing Pi server connection:', PI_SERVER_URL);
      
      // Create a promise that rejects after 3 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 3000);
      });
      
      const fetchPromise = fetch(`${PI_SERVER_URL}/status`, { 
        headers: { 'Accept': 'application/json' }
      });
      
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      console.log('Pi server response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Pi server response data:', data);
        setPiConnected(true);
        return true;
      } else {
        console.error('Pi server returned error status:', response.status);
        setPiConnected(false);
        return false;
      }
    } catch (error) {
      console.error('Pi server connection error:', error);
      setPiConnected(false);
      return false;
    }
  };

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

  // Function to auto-detect the server
  const handleAutoDetectServer = async () => {
    setIsDetectingServer(true);
    
    // Show a message to the user that this might take a moment
    Alert.alert(
      'Detecting Server',
      'Scanning the network for your server. This might take up to 30 seconds...',
      [{ text: 'OK' }],
      { cancelable: false }
    );
    
    try {
      console.log('Starting auto-detect from settings screen...');
      const detectedUrl = await detectServerUrl();
      console.log('Auto-detect result:', detectedUrl);
      
      if (detectedUrl) {
        // Update the UI state
        setServerUrl(detectedUrl);
        // Update the global variable
        HOME_SERVER_URL = detectedUrl;
        
        console.log('Testing connection to detected server:', detectedUrl);
        const isConnected = await testServerConnection();
        console.log('Connection test result:', isConnected);
        
        if (isConnected) {
          Alert.alert('Success', `Server found and connected at: ${detectedUrl}`);
        } else {
          Alert.alert('Warning', `Server found at ${detectedUrl} but connection test failed. Please check if the server is running.`);
        }
      } else {
        Alert.alert(
          'Server Not Found',
          'Could not auto-detect the server. Please check that:\n\n' +
          '• Your server is running\n' + 
          '• Your phone and server are on the same network\n' +
          '• Try entering the server URL manually'
        );
      }
    } catch (error) {
      console.error('Auto-detection error:', error);
      Alert.alert('Error', `Failed to auto-detect server: ${error.message}`);
    } finally {
      setIsDetectingServer(false);
    }
  };
  
  // Function to save the server URL
  const handleSaveServerUrl = async () => {
    if (!serverUrl) {
      Alert.alert('Error', 'Please enter a valid server URL');
      return;
    }
    
    HOME_SERVER_URL = serverUrl;
    const isConnected = await testServerConnection();
    
    if (!isConnected) {
      Alert.alert(
        'Warning',
        'Could not connect to this server. Save anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Save Anyway', 
            onPress: async () => {
              await updateServerUrl(serverUrl);
              Alert.alert('Saved', 'Server URL has been saved but connection failed.');
            }
          }
        ]
      );
      return;
    }
    
    await updateServerUrl(serverUrl);
    Alert.alert('Success', 'Server URL has been saved and connected successfully');
  };

  // Function to save the PI configuration
  const handleSavePiConfig = async () => {
    if (!piIp || !piPort) {
      Alert.alert('Error', 'Please enter valid IP and port');
      return;
    }
    
    // Update the global variables
    const portNumber = parseInt(piPort, 10);
    await updatePiConfig(piIp, portNumber);
    
    // Update local variables
    PI_SERVER_URL = PI_CONFIG.url;
    PI_CAMERA_IP = PI_CONFIG.ip;
    
    // Test the connection
    const isConnected = await testPiConnection();
    
    if (!isConnected) {
      Alert.alert(
        'Warning',
        'Could not connect to this PI camera. Save anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Save Anyway', 
            onPress: () => {
              Alert.alert('Saved', 'PI configuration has been saved but connection failed.');
            }
          }
        ]
      );
      return;
    }
    
    Alert.alert('Success', 'PI configuration has been saved and connected successfully');
  };

  // Toggle detection class settings
  const handleToggleDetectionCategory = async (category, enabled) => {
    const updated = {...detectionClasses};
    updated[category].enabled = enabled;
    setDetectionClasses(updated);
    await toggleDetectionCategory(category, enabled);
    
    // If server is connected, push settings to server
    if (serverConnected) {
      await pushDetectionClassSettings();
    }
  };
  
  // Toggle notification settings for detection classes
  const handleToggleNotificationCategory = async (category, enabled) => {
    const updated = {...detectionClasses};
    updated[category].notifications = enabled;
    setDetectionClasses(updated);
    await toggleNotificationsCategory(category, enabled);
    
    // If server is connected, push settings to server
    if (serverConnected) {
      await pushDetectionClassSettings();
    }
  };

  // Add a function to handle toggling of individual classes
  const handleToggleClass = async (category, classId, enabled) => {
    const updated = {...detectionClasses};
    if (updated[category] && updated[category].classes && updated[category].classes[classId]) {
      updated[category].classes[classId].enabled = enabled;
      
      // Check if any classes are enabled in the category
      let anyClassEnabled = false;
      Object.keys(updated[category].classes).forEach(key => {
        if (updated[category].classes[key].enabled) {
          anyClassEnabled = true;
        }
      });
      
      // Update category enabled state if needed
      if (!anyClassEnabled) {
        updated[category].enabled = false;
      } else if (anyClassEnabled && !updated[category].enabled) {
        updated[category].enabled = true;
      }
      
      setDetectionClasses(updated);
      await toggleClassDetection(category, classId, enabled);
      
      // If server is connected, push settings to server
      if (serverConnected) {
        await pushDetectionClassSettings();
      }
    }
  };

  // Light detection functions
  const loadLightDetectionConfig = async () => {
    try {
      const response = await fetch(`${HOME_SERVER_URL}/api/light-detection-config`);
      if (response.ok) {
        const config = await response.json();
        console.log('Light detection config loaded:', config);
        setLightDetectionConfig(config);
      }
    } catch (error) {
      console.error('Failed to load light detection config:', error);
    }
  };
  
  const startLightDetectionStream = async (section: 'day' | 'night', imageType: 'on' | 'off') => {
    try {
      setLightDetectionLoading(true);
      const mjpegUrl = `${PI_SERVER_URL}/stream`;
      
      const response = await fetch(`${PI_SERVER_URL}/start-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await new Promise(resolve => setTimeout(resolve, 500));
          setLightDetectionStreamUrl(mjpegUrl);
          setLightDetectionStreaming(true);
          setLightDetectionActiveSection(section);
          setLightDetectionImageType(imageType);
        }
      }
    } catch (error) {
      Alert.alert('Camera Error', 'Failed to start camera stream');
    } finally {
      setLightDetectionLoading(false);
    }
  };
  
  const stopLightDetectionStream = async () => {
    if (!lightDetectionStreaming) return;
    
    try {
      await fetch(`${PI_SERVER_URL}/stop-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error stopping stream:', error);
    } finally {
      setLightDetectionStreaming(false);
      setLightDetectionStreamUrl("");
      setLightDetectionActiveSection(null);
      setLightDetectionImageType(null);
    }
  };
  
  const captureLightReferenceImage = async () => {
    if (!lightDetectionActiveSection || !lightDetectionImageType) return;
    
    try {
      setLightDetectionLoading(true);
      
      const response = await fetch(`${PI_SERVER_URL}/capture-light-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: lightDetectionActiveSection,
          imageType: lightDetectionImageType,
          timestamp: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('Capture response data:', data);
          
          // Update the light detection config with server URL, not local Pi URL
          const imageUrl = data.server_image_url || data.image_url;
          console.log('Using image URL:', imageUrl);
          
          setLightDetectionConfig(prev => ({
            ...prev,
            [lightDetectionActiveSection]: {
              ...prev[lightDetectionActiveSection],
              [`light_${lightDetectionImageType}_image`]: imageUrl
            }
          }));
          
          Alert.alert("Success", `Light ${lightDetectionImageType} reference image captured for ${lightDetectionActiveSection} settings!`);
          stopLightDetectionStream();
          
          // Reload the config from server to get the updated data
          await loadLightDetectionConfig();
          
          // Check if both images are captured, then calculate thresholds
          const sectionConfig = lightDetectionConfig[lightDetectionActiveSection];
          const imageKey = `light_${lightDetectionImageType}_image`;
          const otherImageKey = `light_${lightDetectionImageType === 'on' ? 'off' : 'on'}_image`;
          
          if (sectionConfig[otherImageKey]) {
            calculateThresholds(lightDetectionActiveSection);
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to capture reference image');
    } finally {
      setLightDetectionLoading(false);
    }
  };
  
  const calculateThresholds = async (section: 'day' | 'night') => {
    try {
      const response = await fetch(`${HOME_SERVER_URL}/api/calculate-light-thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section })
      });
      
      if (response.ok) {
        const data = await response.json();
        setLightDetectionConfig(prev => ({
          ...prev,
          [section]: {
            ...prev[section],
            threshold_configured: true,
            brightness_threshold_low: data.brightness_threshold_low,
            brightness_threshold_high: data.brightness_threshold_high
          }
        }));
        
        Alert.alert("Success", `Light detection thresholds calculated for ${section} settings!`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to calculate thresholds');
    }
  };
  
  const clearLightReferenceImages = async (section: 'day' | 'night') => {
    Alert.alert(
      "Clear Reference Images",
      `This will remove all reference images for ${section} settings and reset thresholds. Continue?`,
      [
        { text: "Cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await fetch(`${HOME_SERVER_URL}/api/clear-light-references`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section })
              });
              
              if (response.ok) {
                setLightDetectionConfig(prev => ({
                  ...prev,
                  [section]: {
                    threshold_configured: false,
                    brightness_threshold_low: section === 'day' ? 50 : 25,
                    brightness_threshold_high: section === 'day' ? 120 : 80
                  }
                }));
                
                // Reload config to refresh the display
                await loadLightDetectionConfig();
                
                Alert.alert("Success", `${section} reference images cleared`);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to clear reference images');
            }
          }
        }
      ]
    );
  };

  // Function to toggle light state
  const toggleLight = async () => {
    try {
      setLightControlLoading(true);
      const response = await fetch(`${HOME_SERVER_URL}/api/esp/light`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state: !lightState ? 'on' : 'off' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setLightState(!lightState);
          Alert.alert('Success', `Light turned ${!lightState ? 'on' : 'off'} successfully`);
        } else {
          Alert.alert('Error', 'Failed to control light');
        }
      }
    } catch (error) {
      console.error('Error controlling light:', error);
      Alert.alert('Error', 'Failed to control light. Please check your connection.');
    } finally {
      setLightControlLoading(false);
    }
  };

  // Function to toggle door state
  const toggleDoor = async () => {
    try {
      setDoorControlLoading(true);
      const response = await fetch(`${HOME_SERVER_URL}/api/esp/open-door`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDoorState(!doorState);
          Alert.alert('Success', `Door ${!doorState ? 'opened' : 'closed'} successfully`);
        } else {
          Alert.alert('Error', 'Failed to control door');
        }
      }
    } catch (error) {
      console.error('Error controlling door:', error);
      Alert.alert('Error', 'Failed to control door. Please check your connection.');
    } finally {
      setDoorControlLoading(false);
    }
  };

  // Function to toggle gas valve
  const toggleGas = async () => {
    try {
      setGasControlLoading(true);
      const response = await fetch(`${HOME_SERVER_URL}/api/gas/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: !gasState ? 'on' : 'off' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.message) {
          setGasState(!gasState);
          Alert.alert('Success', `Gas valve ${!gasState ? 'opened' : 'closed'} successfully`);
        } else {
          Alert.alert('Error', 'Failed to control gas valve');
        }
      }
    } catch (error) {
      console.error('Error controlling gas valve:', error);
      Alert.alert('Error', 'Failed to control gas valve. Please check your connection.');
    } finally {
      setGasControlLoading(false);
    }
  };

  // Function to toggle water tap
  const toggleWater = async () => {
    try {
      setWaterControlLoading(true);
      const response = await fetch(`${HOME_SERVER_URL}/api/water/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: !waterState ? 'on' : 'off' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.message) {
          setWaterState(!waterState);
          Alert.alert('Success', `Water tap ${!waterState ? 'opened' : 'closed'} successfully`);
        } else {
          Alert.alert('Error', 'Failed to control water tap');
        }
      }
    } catch (error) {
      console.error('Error controlling water tap:', error);
      Alert.alert('Error', 'Failed to control water tap. Please check your connection.');
    } finally {
      setWaterControlLoading(false);
    }
  };

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
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
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
        
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            Server Configuration
          </Text>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              Server URL
            </Text>
            <TextInput
              style={[styles.textInput, { 
                color: Colors[colorScheme].text,
                backgroundColor: Colors[colorScheme].card,
                borderColor: Colors[colorScheme].cardBorder
              }]}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://10.15.31.208:9000"
              placeholderTextColor="gray"
            />
          </View>
          
          <View style={[styles.buttonRow, { marginVertical: 10 }]}>
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: Colors[colorScheme].primary }]}
              onPress={handleSaveServerUrl}
            >
              <Text style={styles.buttonText}>Save URL</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: Colors[colorScheme].secondary }]}
              onPress={handleAutoDetectServer}
              disabled={isDetectingServer}
            >
              {isDetectingServer ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Auto-Detect</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: Colors[colorScheme].tertiary }]}
              onPress={testServerConnection}
            >
              <Text style={styles.buttonText}>Test Connection</Text>
            </TouchableOpacity>
          </View>
          
          <View style={[styles.statusContainer, { paddingVertical: 5 }]}>
            <Text style={[styles.statusText, { 
              color: serverConnected ? 'green' : 'red',
              fontWeight: '500'
            }]}>
              Server Status: {serverConnected ? 'Connected' : 'Disconnected'}
            </Text>
            <Text style={{ color: Colors[colorScheme].gray, fontSize: 12, marginTop: 5 }}>
              If your school IP changes frequently, use Auto-Detect to reconnect
            </Text>
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            PI Camera Configuration
          </Text>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              PI Camera IP
            </Text>
            <TextInput
              style={[styles.textInput, { 
                color: Colors[colorScheme].text,
                backgroundColor: Colors[colorScheme].card,
                borderColor: Colors[colorScheme].cardBorder
              }]}
              value={piIp}
              onChangeText={setPiIp}
              placeholder="192.168.0.107"
              placeholderTextColor="gray"
            />
          </View>
          
          <View style={[styles.settingItem, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.settingLabel, { color: Colors[colorScheme].text }]}>
              PI Camera Port
            </Text>
            <TextInput
              style={[styles.textInput, { 
                color: Colors[colorScheme].text,
                backgroundColor: Colors[colorScheme].card,
                borderColor: Colors[colorScheme].cardBorder
              }]}
              value={piPort}
              onChangeText={setPiPort}
              placeholder="8000"
              placeholderTextColor="gray"
              keyboardType="numeric"
            />
          </View>
          
          <View style={[styles.buttonRow, { marginVertical: 10 }]}>
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: Colors[colorScheme].primary }]}
              onPress={handleSavePiConfig}
            >
              <Text style={styles.buttonText}>Save PI Config</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: Colors[colorScheme].tertiary }]}
              onPress={testPiConnection}
            >
              <Text style={styles.buttonText}>Test PI Connection</Text>
            </TouchableOpacity>
          </View>
          
          <View style={[styles.statusContainer, { paddingVertical: 5 }]}>
            <Text style={[styles.statusText, { 
              color: piConnected ? 'green' : 'red',
              fontWeight: '500'
            }]}>
              PI Camera Status: {piConnected ? 'Connected' : 'Disconnected'}
            </Text>
            <Text style={{ color: Colors[colorScheme].gray, fontSize: 12, marginTop: 5 }}>
              Configure your Raspberry Pi camera IP address and port
            </Text>
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            Detect Light On/Off
          </Text>
          
          <Text style={[styles.sectionDescription, { color: Colors[colorScheme].gray }]}>
            Configure light detection with day and night specific thresholds using reference images
          </Text>
          
          {/* Add this inside the Light Detection section, before the Day Settings */}
          <View style={[styles.lightControlSection, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}>
            <View style={styles.lightControlHeader}>
              <View style={styles.lightControlTitleContainer}>
                <Ionicons name={lightState ? "bulb" : "bulb-outline"} size={24} color={lightState ? "#FFA500" : Colors[colorScheme].text} style={{ marginRight: 8 }} />
                <Text style={[styles.lightControlTitle, { color: Colors[colorScheme].text }]}>
                  Light Control
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.lightToggleButton,
                  { backgroundColor: lightControlLoading ? Colors[colorScheme].gray : (lightState ? Colors[colorScheme].success : Colors[colorScheme].primary) }
                ]}
                onPress={toggleLight}
                disabled={lightControlLoading}
              >
                {lightControlLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.lightToggleButtonText}>
                    {lightState ? 'Turn Off' : 'Turn On'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Day Settings */}
          <View style={[styles.lightDetectionSection, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}>
            <TouchableOpacity
              style={styles.lightDetectionHeader}
              onPress={() => setLightDetectionExpanded(prev => ({ ...prev, day: !prev.day }))}
            >
              <View style={styles.lightDetectionTitleContainer}>
                <Ionicons name="sunny" size={24} color="#FFA500" style={{ marginRight: 8 }} />
                <Text style={[styles.lightDetectionTitle, { color: Colors[colorScheme].text }]}>
                  Day Settings
                </Text>
                <View style={[styles.statusBadge, { 
                  backgroundColor: lightDetectionConfig.day?.threshold_configured ? 
                    Colors[colorScheme].success : Colors[colorScheme].warning 
                }]}>
                  <Text style={styles.statusBadgeText}>
                    {lightDetectionConfig.day?.threshold_configured ? 'Configured' : 'Not Configured'}
                  </Text>
                </View>
              </View>
              <Ionicons 
                name={lightDetectionExpanded.day ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color={Colors[colorScheme].text} 
              />
            </TouchableOpacity>
            
            {lightDetectionExpanded.day && (
              <View style={styles.lightDetectionContent}>
                <Text style={[styles.lightDetectionDisclaimer, { color: Colors[colorScheme].gray }]}>
                  📸 Capture reference images during <Text style={{ fontWeight: 'bold' }}>daytime</Text> to set optimal thresholds for light detection.{'\n'}
                  • First capture with lights ON{'\n'}
                  • Then capture with lights OFF{'\n'}
                  • Ensure consistent lighting conditions
                </Text>
                
                <View style={styles.lightDetectionImages}>
                  <View style={styles.imageSection}>
                    <Text style={[styles.imageSectionTitle, { color: Colors[colorScheme].text }]}>Lights ON</Text>
                    {lightDetectionConfig.day?.light_on_image ? (
                      <View style={styles.imagePreviewContainer}>
                        <Image 
                          source={{ uri: `${HOME_SERVER_URL}${lightDetectionConfig.day.light_on_image}` }}
                          style={styles.referenceImagePreview}
                          resizeMode="cover"
                          onLoad={() => console.log('Day ON image loaded successfully from:', `${HOME_SERVER_URL}${lightDetectionConfig.day?.light_on_image}`)}
                          onError={(error) => {
                            console.error('Day ON image failed to load from:', `${HOME_SERVER_URL}${lightDetectionConfig.day?.light_on_image}`);
                            console.error('Error details:', error.nativeEvent.error);
                          }}
                        />
                        <View style={styles.imageStatusOverlay}>
                          <Ionicons name="checkmark-circle" size={16} color={Colors[colorScheme].success} />
                          <Text style={[styles.imageStatusText, { color: Colors[colorScheme].success }]}>Captured</Text>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.captureButton, { backgroundColor: Colors[colorScheme].primary }]}
                        onPress={() => startLightDetectionStream('day', 'on')}
                        disabled={lightDetectionLoading}
                      >
                        <Ionicons name="camera" size={16} color="#fff" />
                        <Text style={styles.captureButtonText}>Capture</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <View style={styles.imageSection}>
                    <Text style={[styles.imageSectionTitle, { color: Colors[colorScheme].text }]}>Lights OFF</Text>
                    {lightDetectionConfig.day?.light_off_image ? (
                      <View style={styles.imagePreviewContainer}>
                        <Image 
                          source={{ uri: `${HOME_SERVER_URL}${lightDetectionConfig.day.light_off_image}` }}
                          style={styles.referenceImagePreview}
                          resizeMode="cover"
                          onLoad={() => console.log('Day OFF image loaded successfully from:', `${HOME_SERVER_URL}${lightDetectionConfig.day?.light_off_image}`)}
                          onError={(error) => {
                            console.error('Day OFF image failed to load from:', `${HOME_SERVER_URL}${lightDetectionConfig.day?.light_off_image}`);
                            console.error('Error details:', error.nativeEvent.error);
                          }}
                        />
                        <View style={styles.imageStatusOverlay}>
                          <Ionicons name="checkmark-circle" size={16} color={Colors[colorScheme].success} />
                          <Text style={[styles.imageStatusText, { color: Colors[colorScheme].success }]}>Captured</Text>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.captureButton, { backgroundColor: Colors[colorScheme].primary }]}
                        onPress={() => startLightDetectionStream('day', 'off')}
                        disabled={lightDetectionLoading}
                      >
                        <Ionicons name="camera" size={16} color="#fff" />
                        <Text style={styles.captureButtonText}>Capture</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                
                {lightDetectionConfig.day?.threshold_configured && (
                  <View style={styles.thresholdInfo}>
                    <Text style={[styles.thresholdTitle, { color: Colors[colorScheme].text }]}>Calculated Thresholds:</Text>
                    <Text style={[styles.thresholdValue, { color: Colors[colorScheme].gray }]}>
                      Low: {lightDetectionConfig.day?.brightness_threshold_low} • High: {lightDetectionConfig.day?.brightness_threshold_high}
                    </Text>
                  </View>
                )}
                
                <TouchableOpacity
                  style={[styles.clearButton, { borderColor: Colors[colorScheme].danger }]}
                  onPress={() => clearLightReferenceImages('day')}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors[colorScheme].danger} />
                  <Text style={[styles.clearButtonText, { color: Colors[colorScheme].danger }]}>Clear References</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          {/* Night Settings */}
          <View style={[styles.lightDetectionSection, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}>
            <TouchableOpacity
              style={styles.lightDetectionHeader}
              onPress={() => setLightDetectionExpanded(prev => ({ ...prev, night: !prev.night }))}
            >
              <View style={styles.lightDetectionTitleContainer}>
                <Ionicons name="moon" size={24} color="#4A90E2" style={{ marginRight: 8 }} />
                <Text style={[styles.lightDetectionTitle, { color: Colors[colorScheme].text }]}>
                  Night Settings
                </Text>
                <View style={[styles.statusBadge, { 
                  backgroundColor: lightDetectionConfig.night?.threshold_configured ? 
                    Colors[colorScheme].success : Colors[colorScheme].warning 
                }]}>
                  <Text style={styles.statusBadgeText}>
                    {lightDetectionConfig.night?.threshold_configured ? 'Configured' : 'Not Configured'}
                  </Text>
                </View>
              </View>
              <Ionicons 
                name={lightDetectionExpanded.night ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color={Colors[colorScheme].text} 
              />
            </TouchableOpacity>
            
            {lightDetectionExpanded.night && (
              <View style={styles.lightDetectionContent}>
                <Text style={[styles.lightDetectionDisclaimer, { color: Colors[colorScheme].gray }]}>
                  🌙 Capture reference images during <Text style={{ fontWeight: 'bold' }}>nighttime</Text> to set optimal thresholds for light detection.{'\n'}
                  • First capture with lights ON{'\n'}
                  • Then capture with lights OFF{'\n'}
                  • Ensure consistent lighting conditions
                </Text>
                
                <View style={styles.lightDetectionImages}>
                  <View style={styles.imageSection}>
                    <Text style={[styles.imageSectionTitle, { color: Colors[colorScheme].text }]}>Lights ON</Text>
                    {lightDetectionConfig.night?.light_on_image ? (
                      <View style={styles.imagePreviewContainer}>
                        <Image 
                          source={{ uri: `${HOME_SERVER_URL}${lightDetectionConfig.night.light_on_image}` }}
                          style={styles.referenceImagePreview}
                          resizeMode="cover"
                          onLoad={() => console.log('Night ON image loaded successfully from:', `${HOME_SERVER_URL}${lightDetectionConfig.night?.light_on_image}`)}
                          onError={(error) => {
                            console.error('Night ON image failed to load from:', `${HOME_SERVER_URL}${lightDetectionConfig.night?.light_on_image}`);
                            console.error('Error details:', error.nativeEvent.error);
                          }}
                        />
                        <View style={styles.imageStatusOverlay}>
                          <Ionicons name="checkmark-circle" size={16} color={Colors[colorScheme].success} />
                          <Text style={[styles.imageStatusText, { color: Colors[colorScheme].success }]}>Captured</Text>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.captureButton, { backgroundColor: Colors[colorScheme].primary }]}
                        onPress={() => startLightDetectionStream('night', 'on')}
                        disabled={lightDetectionLoading}
                      >
                        <Ionicons name="camera" size={16} color="#fff" />
                        <Text style={styles.captureButtonText}>Capture</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <View style={styles.imageSection}>
                    <Text style={[styles.imageSectionTitle, { color: Colors[colorScheme].text }]}>Lights OFF</Text>
                    {lightDetectionConfig.night?.light_off_image ? (
                      <View style={styles.imagePreviewContainer}>
                        <Image 
                          source={{ uri: `${HOME_SERVER_URL}${lightDetectionConfig.night.light_off_image}` }}
                          style={styles.referenceImagePreview}
                          resizeMode="cover"
                          onLoad={() => console.log('Night OFF image loaded successfully from:', `${HOME_SERVER_URL}${lightDetectionConfig.night?.light_off_image}`)}
                          onError={(error) => {
                            console.error('Night OFF image failed to load from:', `${HOME_SERVER_URL}${lightDetectionConfig.night?.light_off_image}`);
                            console.error('Error details:', error.nativeEvent.error);
                          }}
                        />
                        <View style={styles.imageStatusOverlay}>
                          <Ionicons name="checkmark-circle" size={16} color={Colors[colorScheme].success} />
                          <Text style={[styles.imageStatusText, { color: Colors[colorScheme].success }]}>Captured</Text>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.captureButton, { backgroundColor: Colors[colorScheme].primary }]}
                        onPress={() => startLightDetectionStream('night', 'off')}
                        disabled={lightDetectionLoading}
                      >
                        <Ionicons name="camera" size={16} color="#fff" />
                        <Text style={styles.captureButtonText}>Capture</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                
                {lightDetectionConfig.night?.threshold_configured && (
                  <View style={styles.thresholdInfo}>
                    <Text style={[styles.thresholdTitle, { color: Colors[colorScheme].text }]}>Calculated Thresholds:</Text>
                    <Text style={[styles.thresholdValue, { color: Colors[colorScheme].gray }]}>
                      Low: {lightDetectionConfig.night?.brightness_threshold_low} • High: {lightDetectionConfig.night?.brightness_threshold_high}
                    </Text>
                  </View>
                )}
                
                <TouchableOpacity
                  style={[styles.clearButton, { borderColor: Colors[colorScheme].danger }]}
                  onPress={() => clearLightReferenceImages('night')}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors[colorScheme].danger} />
                  <Text style={[styles.clearButtonText, { color: Colors[colorScheme].danger }]}>Clear References</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          {/* Camera Stream Modal */}
          {lightDetectionStreaming && (
            <Modal visible={lightDetectionStreaming} transparent={true} animationType="slide">
              <View style={styles.streamModalOverlay}>
                <View style={[styles.streamModalContainer, { backgroundColor: Colors[colorScheme].background }]}>
                  <View style={styles.streamModalHeader}>
                    <Text style={[styles.streamModalTitle, { color: Colors[colorScheme].text }]}>
                      Capture Light {lightDetectionImageType?.toUpperCase()} - {lightDetectionActiveSection?.toUpperCase()}
                    </Text>
                    <TouchableOpacity onPress={stopLightDetectionStream}>
                      <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.streamContainer}>
                    <MjpegViewer streamUrl={lightDetectionStreamUrl} style={styles.streamView} />
                  </View>
                  
                  <View style={styles.streamModalActions}>
                    <TouchableOpacity
                      style={[styles.captureStreamButton, { backgroundColor: Colors[colorScheme].primary }]}
                      onPress={captureLightReferenceImage}
                      disabled={lightDetectionLoading}
                    >
                      {lightDetectionLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="camera" size={20} color="#fff" />
                          <Text style={styles.captureStreamButtonText}>Capture Reference</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors[colorScheme].text }]}>
            Detection Classes
          </Text>
          
          <Text style={[styles.sectionDescription, { color: Colors[colorScheme].gray }]}>
            Toggle which object types to detect and receive notifications for
          </Text>
          
          <View style={[styles.detectionClassHeader, { borderBottomColor: Colors[colorScheme].cardBorder }]}>
            <Text style={[styles.detectionClassHeaderText, { color: Colors[colorScheme].text, flex: 3 }]}>
              Category
            </Text>
            <Text style={[styles.detectionClassHeaderText, { color: Colors[colorScheme].text, flex: 1, textAlign: 'center' }]}>
              Detect
            </Text>
            <Text style={[styles.detectionClassHeaderText, { color: Colors[colorScheme].text, flex: 1, textAlign: 'center' }]}>
              Notify
            </Text>
          </View>
          
          {Object.keys(detectionClasses).map((category) => (
            <View 
              key={category}
              style={[
                styles.detectionClassContainer, 
                { borderBottomColor: Colors[colorScheme].cardBorder }
              ]}
            >
              <View style={styles.detectionClassHeader}>
                <TouchableOpacity 
                  style={styles.detectionClassInfo}
                  onPress={() => {
                    setDetectionClasses(prev => ({
                      ...prev,
                      [category]: {
                        ...prev[category],
                        expanded: !prev[category].expanded
                      }
                    }));
                  }}
                >
                  <View style={styles.categoryTitleContainer}>
                    <View style={styles.categoryTitleRow}>
                      <Text style={[styles.detectionClassName, { color: Colors[colorScheme].text }]}>
                        {detectionClasses[category].name}
                      </Text>
                      <Ionicons 
                        name={detectionClasses[category].expanded ? 'chevron-up' : 'chevron-down'} 
                        size={20} 
                        color={Colors[colorScheme].text} 
                        style={styles.expandIcon}
                      />
                    </View>
                    <Text style={[styles.detectionClassCount, { color: Colors[colorScheme].gray }]}>
                      {`${Object.keys(detectionClasses[category].classes).length} classes`}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                <View style={styles.detectionClassToggle}>
                  <Switch
                    value={detectionClasses[category].enabled}
                    onValueChange={(value) => handleToggleDetectionCategory(category, value)}
                    trackColor={{ false: '#767577', true: Colors[colorScheme].primary }}
                    thumbColor="#fff"
                  />
                </View>
                
                <View style={styles.detectionClassToggle}>
                  <Switch
                    value={detectionClasses[category].notifications}
                    onValueChange={(value) => handleToggleNotificationCategory(category, value)}
                    trackColor={{ false: '#767577', true: detectionClasses[category].enabled ? Colors[colorScheme].danger : '#767577' }}
                    thumbColor="#fff"
                    disabled={!detectionClasses[category].enabled}
                  />
                </View>
              </View>
              
              {detectionClasses[category].expanded && (
                <View style={styles.classesGrid}>
                  {Object.entries(detectionClasses[category].classes).map(([classId, classData], index) => (
                    <View 
                      key={`${category}-${classId}`} 
                      style={[
                        styles.classItem,
                        index % 2 === 0 && styles.classItemLeft,
                        {
                          backgroundColor: classData.enabled ? 
                            Colors[colorScheme].lightBackground : 
                            'transparent',
                          borderColor: Colors[colorScheme].cardBorder,
                        }
                      ]}
                    >
                      <Text 
                        style={[
                          styles.className, 
                          { 
                            color: classData.enabled ? 
                              Colors[colorScheme].text : 
                              Colors[colorScheme].gray 
                          }
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {classData.name}
                      </Text>
                      <Switch
                        value={classData.enabled}
                        onValueChange={(value) => handleToggleClass(category, classId, value)}
                        trackColor={{ false: '#767577', true: Colors[colorScheme].primary }}
                        thumbColor="#fff"
                        disabled={!detectionClasses[category].enabled}
                        style={styles.classSwitch}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
          
          <TouchableOpacity 
            style={[styles.infoButton, { backgroundColor: Colors[colorScheme].lightBackground }]}
            onPress={() => {
              Alert.alert(
                "Detection Class Settings",
                "Enable detection for specific object categories. When enabled, the system will look for these objects in video footage.\n\nToggle notifications to receive alerts when these objects are detected.\n\nNote: Disabling categories improves performance.",
                [{ text: "OK" }]
              )
            }}
          >
            <Ionicons name="information-circle-outline" size={16} color={Colors[colorScheme].text} style={{ marginRight: 6 }} />
            <Text style={[styles.infoButtonText, { color: Colors[colorScheme].text }]}>
              How detection classes work
            </Text>
          </TouchableOpacity>
          
          <View style={styles.detectionSettingsFooter}>
            <Text style={[styles.detectionSettingsNote, { color: Colors[colorScheme].gray }]}>
              Disable categories you don't need to improve detection performance.
            </Text>
            <Text style={[styles.detectionSettingsNote, { color: Colors[colorScheme].gray }]}>
              Enable notifications to receive alerts when specific objects are detected.
            </Text>
          </View>
        </View>

        {/* Add this after the Light Control section */}
        <View style={[styles.doorControlSection, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}>
          <View style={styles.doorControlHeader}>
            <View style={styles.doorControlTitleContainer}>
              <Ionicons name={doorState ? "lock-open" : "lock-closed"} size={24} color={doorState ? "#4CAF50" : Colors[colorScheme].text} style={{ marginRight: 8 }} />
              <Text style={[styles.doorControlTitle, { color: Colors[colorScheme].text }]}>
                Door Control
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.doorToggleButton,
                { backgroundColor: doorControlLoading ? Colors[colorScheme].gray : (doorState ? Colors[colorScheme].success : Colors[colorScheme].primary) }
              ]}
              onPress={toggleDoor}
              disabled={doorControlLoading}
            >
              {doorControlLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.doorToggleButtonText}>
                  {doorState ? 'Close Door' : 'Open Door'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Add this after the Door Control section */}
        <View style={[styles.utilityControlsSection, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}>
          <Text style={[styles.utilityControlsTitle, { color: Colors[colorScheme].text }]}>
            Utility Controls
          </Text>
          
          {/* Gas Control */}
          <View style={styles.utilityControlRow}>
            <View style={styles.utilityControlTitleContainer}>
              <Ionicons 
                name={gasState ? "flame" : "flame-outline"} 
                size={24} 
                color={gasState ? "#FF5722" : Colors[colorScheme].text} 
                style={{ marginRight: 8 }} 
              />
              <Text style={[styles.utilityControlName, { color: Colors[colorScheme].text }]}>
                Gas Valve
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.utilityToggleButton,
                { backgroundColor: gasControlLoading ? Colors[colorScheme].gray : (gasState ? Colors[colorScheme].danger : Colors[colorScheme].primary) }
              ]}
              onPress={toggleGas}
              disabled={gasControlLoading}
            >
              {gasControlLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.utilityToggleButtonText}>
                  {gasState ? 'Turn Off' : 'Turn On'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          
          {/* Water Control */}
          <View style={[styles.utilityControlRow, { borderTopWidth: 1, borderTopColor: Colors[colorScheme].cardBorder }]}>
            <View style={styles.utilityControlTitleContainer}>
              <Ionicons 
                name={waterState ? "water" : "water-outline"} 
                size={24} 
                color={waterState ? "#2196F3" : Colors[colorScheme].text} 
                style={{ marginRight: 8 }} 
              />
              <Text style={[styles.utilityControlName, { color: Colors[colorScheme].text }]}>
                Water Tap
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.utilityToggleButton,
                { backgroundColor: waterControlLoading ? Colors[colorScheme].gray : (waterState ? Colors[colorScheme].info : Colors[colorScheme].primary) }
              ]}
              onPress={toggleWater}
              disabled={waterControlLoading}
            >
              {waterControlLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.utilityToggleButtonText}>
                  {waterState ? 'Turn Off' : 'Turn On'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  button: {
    padding: 10,
    borderRadius: 8,
    minWidth: '30%',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  statusContainer: {
    marginTop: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 12,
  },
  detectionClassHeader: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  detectionClassHeaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  detectionClassContainer: {
    borderBottomWidth: 1,
    marginBottom: 8,
    paddingBottom: 8,
  },
  detectionClassHeader: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  detectionClassInfo: {
    flex: 3,
    paddingRight: 12,
  },
  categoryTitleContainer: {
    flex: 1,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detectionClassName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  detectionClassCount: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  expandIcon: {
    marginLeft: 8,
  },
  detectionClassToggle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  classesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginBottom: 8,
  },
  classItem: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderRadius: 8,
  },
  classItemLeft: {
    marginRight: '2%',
  },
  className: {
    flex: 1,
    fontSize: 14,
    marginRight: 4,
  },
  classSwitch: {
    transform: [{ scale: 0.8 }],
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    alignSelf: 'center',
  },
  infoButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  detectionSettingsFooter: {
    marginTop: 16,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.2)',
    backgroundColor: 'rgba(150,150,150,0.05)',
    borderRadius: 8,
  },
  detectionSettingsNote: {
    fontSize: 12,
    marginBottom: 4,
  },
  // Light detection styles
  lightDetectionSection: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  lightDetectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  lightDetectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lightDetectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  lightDetectionContent: {
    padding: 16,
    paddingTop: 0,
  },
  lightDetectionDisclaimer: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  lightDetectionImages: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  imageSection: {
    flex: 1,
    marginHorizontal: 4,
  },
  imageSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  imageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  referenceImagePreview: {
    width: '100%',
    height: 100,
    borderRadius: 8,
  },
  imageStatusOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  imageStatusText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  thresholdInfo: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginBottom: 12,
  },
  thresholdTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  thresholdValue: {
    fontSize: 12,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  // Stream modal styles
  streamModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamModalContainer: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  streamModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  streamModalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  streamContainer: {
    aspectRatio: 16/9,
    backgroundColor: '#000',
  },
  streamView: {
    flex: 1,
  },
  streamModalActions: {
    padding: 16,
  },
  captureStreamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
  },
  captureStreamButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Light control styles
  lightControlSection: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  lightControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lightControlTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lightControlTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  lightToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  lightToggleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Door control styles
  doorControlSection: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  doorControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  doorControlTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doorControlTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  doorToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  doorToggleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Utility controls styles
  utilityControlsSection: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  utilityControlsTitle: {
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
    paddingBottom: 8,
  },
  utilityControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  utilityControlTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  utilityControlName: {
    fontSize: 16,
    fontWeight: '500',
  },
  utilityToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  utilityToggleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
}); 