import AsyncStorage from '@react-native-async-storage/async-storage';

// Default configuration
export const SERVER_CONFIG = {
  serverUrl: "http://192.168.0.103:9000", // Default for development
  knownIps: [
    'localhost', 
    '10.15.31.208',
    '192.168.0.102',
    '192.168.0.108',
    '192.168.0.103',
    '192.168.85.229', // Add current IP
  ]
}

// PI Camera configuration
export const PI_CONFIG = {
  ip: "192.168.85.120",
  port: 8000,
  get url() {
    return `http://${this.ip}:${this.port}`;
  },
  // Connection settings
  connectionRetries: 3,
  connectionTimeout: 5000, // 5 seconds
  reconnectDelay: 3000, // 3 seconds between retries
}

// Detection class categories with grouped classes
export const DETECTION_CLASSES = {
  people: {
    name: "People",
    classes: {
      0: { name: 'person', enabled: true }
    },
    enabled: true,
    notifications: true
  },
  vehicles: {
    name: "Vehicles",
    classes: {
      1: { name: 'bicycle', enabled: true },
      2: { name: 'car', enabled: true },
      3: { name: 'motorcycle', enabled: true },
      4: { name: 'airplane', enabled: true },
      5: { name: 'bus', enabled: true },
      6: { name: 'train', enabled: true },
      7: { name: 'truck', enabled: true },
      8: { name: 'boat', enabled: true }
    },
    enabled: true,
    notifications: false
  },
  trafficRelated: {
    name: "Traffic Related",
    classes: {
      9: { name: 'traffic light', enabled: true },
      10: { name: 'fire hydrant', enabled: true },
      11: { name: 'stop sign', enabled: true },
      12: { name: 'parking meter', enabled: true }
    },
    enabled: false,
    notifications: false
  },
  animals: {
    name: "Animals",
    classes: {
      14: { name: 'bird', enabled: true },
      15: { name: 'cat', enabled: true },
      16: { name: 'dog', enabled: true },
      17: { name: 'horse', enabled: true },
      18: { name: 'sheep', enabled: true },
      19: { name: 'cow', enabled: true },
      20: { name: 'elephant', enabled: true },
      21: { name: 'bear', enabled: true },
      22: { name: 'zebra', enabled: true },
      23: { name: 'giraffe', enabled: true }
    },
    enabled: true,
    notifications: false
  },
  personalItems: {
    name: "Personal Items",
    classes: {
      24: { name: 'backpack', enabled: true },
      25: { name: 'umbrella', enabled: true },
      26: { name: 'handbag', enabled: true },
      27: { name: 'tie', enabled: true },
      28: { name: 'suitcase', enabled: true }
    },
    enabled: false,
    notifications: false
  },
  sportsEquipment: {
    name: "Sports Equipment",
    classes: {
      29: { name: 'frisbee', enabled: true },
      30: { name: 'skis', enabled: true },
      31: { name: 'snowboard', enabled: true },
      32: { name: 'sports ball', enabled: true },
      33: { name: 'kite', enabled: true },
      34: { name: 'baseball bat', enabled: true },
      35: { name: 'baseball glove', enabled: true },
      36: { name: 'skateboard', enabled: true },
      37: { name: 'surfboard', enabled: true },
      38: { name: 'tennis racket', enabled: true }
    },
    enabled: false,
    notifications: false
  },
  foodAndKitchen: {
    name: "Food & Kitchen",
    classes: {
      39: { name: 'bottle', enabled: true },
      40: { name: 'wine glass', enabled: true },
      41: { name: 'cup', enabled: true },
      42: { name: 'fork', enabled: true },
      43: { name: 'knife', enabled: true },
      44: { name: 'spoon', enabled: true },
      45: { name: 'bowl', enabled: true },
      46: { name: 'banana', enabled: true },
      47: { name: 'apple', enabled: true },
      48: { name: 'sandwich', enabled: true },
      49: { name: 'orange', enabled: true },
      50: { name: 'broccoli', enabled: true },
      51: { name: 'carrot', enabled: true },
      52: { name: 'hot dog', enabled: true },
      53: { name: 'pizza', enabled: true },
      54: { name: 'donut', enabled: true },
      55: { name: 'cake', enabled: true }
    },
    enabled: false,
    notifications: false
  },
  furniture: {
    name: "Furniture & Home",
    classes: {
      13: { name: 'bench', enabled: true },
      56: { name: 'chair', enabled: true },
      57: { name: 'couch', enabled: true },
      58: { name: 'potted plant', enabled: true },
      59: { name: 'bed', enabled: true },
      60: { name: 'dining table', enabled: true },
      61: { name: 'toilet', enabled: true },
      71: { name: 'sink', enabled: true },
      75: { name: 'vase', enabled: true },
      76: { name: 'scissors', enabled: true },
      74: { name: 'clock', enabled: true },
      73: { name: 'book', enabled: true },
      77: { name: 'teddy bear', enabled: true },
      72: { name: 'refrigerator', enabled: true }
    },
    enabled: false,
    notifications: false
  },
  electronics: {
    name: "Electronics",
    classes: {
      62: { name: 'tv', enabled: true },
      63: { name: 'laptop', enabled: true },
      64: { name: 'mouse', enabled: true },
      65: { name: 'remote', enabled: true },
      66: { name: 'keyboard', enabled: true },
      67: { name: 'cell phone', enabled: true },
      68: { name: 'microwave', enabled: true },
      69: { name: 'oven', enabled: true },
      70: { name: 'toaster', enabled: true },
      78: { name: 'hair drier', enabled: true }
    },
    enabled: false,
    notifications: false
  },
  personalCare: {
    name: "Personal Care",
    classes: {
      79: { name: 'toothbrush', enabled: true }
    },
    enabled: false,
    notifications: false
  }
};

// Server configuration (use the same URL as SERVER_CONFIG)
export const SERVER_URL = SERVER_CONFIG.serverUrl;

// API endpoints
export const API_ENDPOINTS = {
  // Notifications
  notifications: '/api/mobile/notifications',
  notificationsByType: (type: string) => `/api/mobile/notifications?type=${type}`,
  notificationResponse: (id: string) => `/api/notifications/${id}/response`,
  
  // Smart Lighting (backwards compatibility)
  smartLightingNotifications: '/api/smart-lighting/notifications',
  
  // Door Access
  doorAccess: '/api/door-access',
  testButtonPress: '/api/test/button-press',
  
  // Test endpoints
  testNotifications: '/api/test/notifications',
};

// Other configuration
export const APP_CONFIG = {
  version: '1.0.0',
  appName: 'Owl Security',
};

// Load the saved URL from storage
export const loadServerUrl = async () => {
  try {
    const savedUrl = await AsyncStorage.getItem('SERVER_URL');
    if (savedUrl) {
      SERVER_CONFIG.serverUrl = savedUrl;
      console.log('Loaded server URL:', savedUrl);
      return savedUrl;
    }
  } catch (error) {
    console.error('Failed to load server URL:', error);
  }
  return SERVER_CONFIG.serverUrl;
};

// Save a new URL
export const updateServerUrl = async (newUrl: string) => {
  try {
    SERVER_CONFIG.serverUrl = newUrl;
    await AsyncStorage.setItem('SERVER_URL', newUrl);
    console.log('Saved server URL:', newUrl);
    return true;
  } catch (error) {
    console.error('Failed to save server URL:', error);
    return false;
  }
};

// Auto-detect the server URL
export const detectServerUrl = async () => {
  try {
    console.log('Starting server auto-detection...');
    // First load our known IPs from storage
    await loadKnownIps();
    
    // Use stored IP list as our starting point
    const possibleIps = [...SERVER_CONFIG.knownIps];
    
    // Add dynamic subnet ranges (10.0.0.x, 10.15.x.x, 192.168.0.x)
    const baseSubnets = [
      '10.15.31.', // Your current subnet
      '10.0.0.',
      '192.168.0.',
      '192.168.1.',
    ];
    
    // Build a comprehensive list of IPs to check
    let allIps = [...possibleIps];
    
    // Add the first 10 addresses in each subnet
    baseSubnets.forEach(subnet => {
      for (let i = 1; i <= 10; i++) {
        // Skip addresses we already have
        const ip = `${subnet}${i}`;
        if (!possibleIps.includes(ip)) {
          allIps.push(ip);
        }
      }
    });
    
    console.log(`Will try to detect server on ${allIps.length} IP addresses`);
    
    // Function to try connecting with timeout support
    const tryConnect = async (ip) => {
      const testUrl = `http://${ip}:9000/api/server-info`;
      console.log(`Trying to connect to ${testUrl}`);
      
      try {
        // Create a promise that rejects after 2.5 seconds (increased timeout)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 2500);
        });
        
        // Race the fetch against the timeout
        const response = await Promise.race([
          fetch(testUrl, { 
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          }),
          timeoutPromise
        ]);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Server info response:', data);
          const newUrl = data.serverUrl || `http://${ip}:9000`;
          console.log(`Connection successful to ${testUrl}! Server URL: ${newUrl}`);
          
          // Extract IP from URL for learning
          const urlObj = new URL(newUrl);
          const foundIp = urlObj.hostname;
          
          // Add this IP to our known IPs for future detection
          await addKnownIp(foundIp);
          
          // Save the URL
          await updateServerUrl(newUrl);
          return newUrl;
        } else {
          console.log(`Response not OK from ${ip}: ${response.status}`);
        }
      } catch (e) {
        console.log(`Failed to connect to ${ip}: ${e.message}`);
        return null;
      }
      return null;
    };
    
    // Try connecting to all IPs, but prioritize the current one if it exists
    const currentIp = '192.168.0.108'; // Known working IP
    if (allIps.includes(currentIp)) {
      console.log(`Trying known working IP first: ${currentIp}`);
      const result = await tryConnect(currentIp);
      if (result) {
        return result;
      }
    }
    
    // Try connecting to all other IPs
    for (const ip of allIps) {
      if (ip !== currentIp) { // Skip the one we already tried
        const result = await tryConnect(ip);
        if (result) {
          return result;
        }
      }
    }
    
    // If we reach here, we couldn't connect to any server
    console.error('Could not auto-detect server on any IP');
    return null;
  } catch (error) {
    console.error('Server detection failed:', error);
    return null;
  }
};

// Function to add a new IP address to known IPs
export const addKnownIp = async (newIp: string) => {
  try {
    if (!newIp || newIp === 'localhost') return;
    
    // Load existing IPs first
    await loadKnownIps();
    
    // Check if already exists
    if (!SERVER_CONFIG.knownIps.includes(newIp)) {
      // Add the new IP
      SERVER_CONFIG.knownIps.push(newIp);
      
      // Generate similar IPs based on subnet pattern
      const ipParts = newIp.split('.');
      if (ipParts.length === 4) {
        const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.`;
        // Add this subnet to future searches if not already in the list
        if (!SERVER_CONFIG.knownIps.includes(`${subnet}1`)) {
          SERVER_CONFIG.knownIps.push(`${subnet}1`);
        }
      }
      
      // Save the updated list (limit to 20 entries to avoid bloat)
      if (SERVER_CONFIG.knownIps.length > 20) {
        SERVER_CONFIG.knownIps = SERVER_CONFIG.knownIps.slice(-20);
      }
      
      // Save to storage
      await AsyncStorage.setItem('KNOWN_IPS', JSON.stringify(SERVER_CONFIG.knownIps));
      console.log('Added new IP to known list:', newIp);
    }
  } catch (error) {
    console.error('Failed to add known IP:', error);
  }
};

// Load known IPs from storage
export const loadKnownIps = async () => {
  try {
    const savedIps = await AsyncStorage.getItem('KNOWN_IPS');
    if (savedIps) {
      const parsedIps = JSON.parse(savedIps);
      if (Array.isArray(parsedIps)) {
        SERVER_CONFIG.knownIps = parsedIps;
        console.log('Loaded known IPs:', parsedIps);
      }
    }
  } catch (error) {
    console.error('Failed to load known IPs:', error);
  }
};

// Load PI camera configuration from storage
export const loadPiConfig = async () => {
  try {
    const savedIp = await AsyncStorage.getItem('PI_IP');
    const savedPort = await AsyncStorage.getItem('PI_PORT');
    
    if (savedIp) {
      PI_CONFIG.ip = savedIp;
      console.log('Loaded PI IP:', savedIp);
    }
    
    if (savedPort) {
      PI_CONFIG.port = parseInt(savedPort, 10);
      console.log('Loaded PI port:', savedPort);
    }
    
    return PI_CONFIG;
  } catch (error) {
    console.error('Failed to load PI config:', error);
    return PI_CONFIG;
  }
};

// Save PI camera configuration
export const updatePiConfig = async (ip: string, port: number) => {
  try {
    PI_CONFIG.ip = ip;
    PI_CONFIG.port = port;
    
    await AsyncStorage.setItem('PI_IP', ip);
    await AsyncStorage.setItem('PI_PORT', port.toString());
    
    console.log('Saved PI config:', { ip, port });
    return true;
  } catch (error) {
    console.error('Failed to save PI config:', error);
    return false;
  }
};

// Track the last time we logged camera connection errors
let lastCameraErrorLogTime = 0;
const ERROR_LOG_INTERVAL = 60000; // Only log camera errors once per minute

// Helper function to connect to Pi with retries
export const connectToPi = async (endpoint: string, options: RequestInit = {}) => {
  let retries = PI_CONFIG.connectionRetries;
  let lastError = null;
  const isStatusCheck = endpoint === '/status'; // Check if this is just a status check
  
  // For status checks, don't log every connection attempt
  if (!isStatusCheck) {
    console.log(`Connecting to Pi at ${PI_CONFIG.url}${endpoint}`);
  }
  
  while (retries > 0) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), PI_CONFIG.connectionTimeout);
      });
      
      // Create the fetch promise
      const fetchPromise = fetch(`${PI_CONFIG.url}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      
      // Race the promises
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      return response;
    } catch (error) {
      const now = Date.now();
      lastError = error;
      retries--;
      
      // Only log errors for status checks once per minute to reduce noise
      if (!isStatusCheck || now - lastCameraErrorLogTime > ERROR_LOG_INTERVAL) {
        console.warn(`Failed to connect to Pi${isStatusCheck ? ' (status check)' : ''}: ${error.message}`);
        if (isStatusCheck) {
          lastCameraErrorLogTime = now;
        }
      }
      
      if (retries > 0 && !isStatusCheck) {
        console.log(`Retrying in ${PI_CONFIG.reconnectDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, PI_CONFIG.reconnectDelay));
      }
    }
  }
  
  // If all retries failed, throw the last error, but don't log it again if it's just a status check
  if (!isStatusCheck) {
    throw lastError || new Error('Failed to connect to Pi camera');
  } else {
    throw lastError || new Error('Camera status check failed');
  }
};

// Load detection class settings from storage
export const loadDetectionClassSettings = async () => {
  try {
    const savedSettings = await AsyncStorage.getItem('DETECTION_CLASSES');
    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings);
      
      // Update the settings for each category
      Object.keys(DETECTION_CLASSES).forEach(category => {
        if (parsedSettings[category]) {
          // Update category-level settings
          if (typeof parsedSettings[category].enabled === 'boolean') {
            DETECTION_CLASSES[category].enabled = parsedSettings[category].enabled;
          }
          if (typeof parsedSettings[category].notifications === 'boolean') {
            DETECTION_CLASSES[category].notifications = parsedSettings[category].notifications;
          }
          
          // Update class-level settings
          if (parsedSettings[category].classes) {
            Object.keys(parsedSettings[category].classes).forEach(classId => {
              if (DETECTION_CLASSES[category].classes[classId] && 
                  parsedSettings[category].classes[classId] &&
                  typeof parsedSettings[category].classes[classId].enabled === 'boolean') {
                DETECTION_CLASSES[category].classes[classId].enabled = 
                  parsedSettings[category].classes[classId].enabled;
              }
            });
          }
        }
      });
      
      console.log('Loaded detection class settings');
    }
    
    return DETECTION_CLASSES;
  } catch (error) {
    console.error('Failed to load detection class settings:', error);
    return DETECTION_CLASSES;
  }
};

// Save detection class settings
export const saveDetectionClassSettings = async (settings = DETECTION_CLASSES) => {
  try {
    // Create a simplified version with just enabled/notifications flags
    const simplifiedSettings = {};
    
    Object.keys(settings).forEach(category => {
      simplifiedSettings[category] = {
        enabled: settings[category].enabled,
        notifications: settings[category].notifications
      };
    });
    
    await AsyncStorage.setItem('DETECTION_CLASSES', JSON.stringify(simplifiedSettings));
    console.log('Saved detection class settings');
    return true;
  } catch (error) {
    console.error('Failed to save detection class settings:', error);
    return false;
  }
};

// Toggle detection for a specific category
export const toggleDetectionCategory = async (category, enabled) => {
  if (DETECTION_CLASSES[category]) {
    DETECTION_CLASSES[category].enabled = enabled;
    await saveDetectionClassSettings();
    return true;
  }
  return false;
};

// Toggle notifications for a specific category
export const toggleNotificationsCategory = async (category, enabled) => {
  if (DETECTION_CLASSES[category]) {
    DETECTION_CLASSES[category].notifications = enabled;
    await saveDetectionClassSettings();
    return true;
  }
  return false;
};

// Toggle individual class detection
export const toggleClassDetection = async (category, classId, enabled) => {
  if (DETECTION_CLASSES[category] && 
      DETECTION_CLASSES[category].classes && 
      DETECTION_CLASSES[category].classes[classId]) {
    
    DETECTION_CLASSES[category].classes[classId].enabled = enabled;
    
    // Update the category's enabled state if needed
    let anyClassEnabled = false;
    Object.keys(DETECTION_CLASSES[category].classes).forEach(key => {
      if (DETECTION_CLASSES[category].classes[key].enabled) {
        anyClassEnabled = true;
      }
    });
    
    // If no classes are enabled, disable the category
    if (!anyClassEnabled) {
      DETECTION_CLASSES[category].enabled = false;
    } 
    // If any class is enabled and the category is disabled, enable it
    else if (anyClassEnabled && !DETECTION_CLASSES[category].enabled) {
      DETECTION_CLASSES[category].enabled = true;
    }
    
    await saveDetectionClassSettings();
    return true;
  }
  return false;
};

// Sync detection class settings with server
export const syncDetectionClassSettings = async () => {
  try {
    // First load local settings
    await loadDetectionClassSettings();

    // Then try to get settings from server
    console.log('Syncing detection class settings with server...');
    const response = await fetch(`${SERVER_CONFIG.serverUrl}/api/detection-settings`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      
      if (data.success && data.settings) {
        console.log('Got detection settings from server');
        
        // Apply server settings to local config
        Object.keys(data.settings).forEach(category => {
          if (DETECTION_CLASSES[category] && data.settings[category]) {
            if (typeof data.settings[category].enabled === 'boolean') {
              DETECTION_CLASSES[category].enabled = data.settings[category].enabled;
            }
            
            if (typeof data.settings[category].notifications === 'boolean') {
              DETECTION_CLASSES[category].notifications = data.settings[category].notifications;
            }
          }
        });
        
        // Save updated settings locally
        await saveDetectionClassSettings();
        return true;
      }
    }
  } catch (error) {
    console.error('Error syncing detection settings with server:', error);
  }
  
  return false;
};

// Push detection class settings to server 
export const pushDetectionClassSettings = async () => {
  try {
    // Create a complete settings object with class-level settings
    const completeSettings = {};
    
    Object.keys(DETECTION_CLASSES).forEach(category => {
      completeSettings[category] = {
        enabled: DETECTION_CLASSES[category].enabled,
        notifications: DETECTION_CLASSES[category].notifications,
        classes: {}
      };
      
      // Add class-level settings
      Object.keys(DETECTION_CLASSES[category].classes).forEach(classId => {
        completeSettings[category].classes[classId] = {
          enabled: DETECTION_CLASSES[category].classes[classId].enabled
        };
      });
    });
    
    console.log('Pushing detection class settings to server...');
    const response = await fetch(`${SERVER_CONFIG.serverUrl}/api/detection-settings`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completeSettings)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Server response:', data);
      return data.success;
    }
    
    return false;
  } catch (error) {
    console.error('Error pushing detection settings to server:', error);
    return false;
  }
};

// Initialize on import
loadServerUrl();
loadKnownIps();
loadPiConfig(); 