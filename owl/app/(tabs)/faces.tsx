import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  ColorSchemeName,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';
import MjpegViewer from '../../components/MjpegViewer';

// Define API URL - change this to your server's address
const API_URL = 'http://192.168.0.102:9000'; // Update with your server IP

// Your Raspberry Pi camera's IP address and port
const PI_CAMERA_IP = '192.168.0.107'; // Update with your Pi camera's IP
const PI_CAMERA_PORT = 8000; // Pi camera runs on port 8000 by default

// Mock data for registered faces - will be replaced with API data
const MOCK_FACES = [
  {
    id: '1',
    name: 'Adam Smith',
    role: 'Family',
    image: 'https://via.placeholder.com/300x300/333/fff?text=Adam',
    dateAdded: '2023-05-15T10:30:00',
    sampleCount: 5,
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    role: 'Family',
    image: 'https://via.placeholder.com/300x300/333/fff?text=Sarah',
    dateAdded: '2023-05-16T14:20:00',
    sampleCount: 8,
  },
  {
    id: '3',
    name: 'Mike Reynolds',
    role: 'Friend',
    image: 'https://via.placeholder.com/300x300/333/fff?text=Mike',
    dateAdded: '2023-05-18T09:45:00',
    sampleCount: 3,
  },
  {
    id: '4',
    name: 'Emma Davis',
    role: 'Neighbor',
    image: 'https://via.placeholder.com/300x300/333/fff?text=Emma',
    dateAdded: '2023-05-20T16:10:00',
    sampleCount: 6,
  },
  {
    id: '5',
    name: 'John Wilson',
    role: 'Service',
    image: 'https://via.placeholder.com/300x300/333/fff?text=John',
    dateAdded: '2023-05-25T11:05:00',
    sampleCount: 4,
  },
];

// Roles with their respective colors
const ROLES = {
  'Family': '#60a5fa',   // Blue
  'Friend': '#10b981',   // Green
  'Neighbor': '#8b5cf6', // Purple
  'Service': '#f59e0b',  // Amber
  'Unknown': '#6b7280',  // Gray
};

// Face Capture Modal component
interface FaceCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (imageUri: string, name: string, role: string) => void;
  colorScheme: ColorSchemeName;
}

// Add type for face object
interface Face {
  id: string;
  name: string;
  role: string;
  image: string;
  dateAdded: string;
  sampleCount: number;
}

// Add type for FormData
interface ImageFormData extends FormData {
  append(name: string, value: Blob | string, fileName?: string): void;
}

interface CaptureResponse {
  success: boolean;
  image_url?: string;
  server_image_url?: string;
  error?: string;
}

// Update getThemeColors function with proper type safety
const getThemeColors = (scheme: ColorSchemeName) => {
  const validScheme = (scheme || 'light') as keyof typeof Colors;
  return Colors[validScheme];
};

const FaceCaptureModal = ({ visible, onClose, onCapture, colorScheme }: FaceCaptureModalProps) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Family");
  const [loading, setLoading] = useState(false);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [serverImageUri, setServerImageUri] = useState<string | null>(null);
  
  // Start streaming when modal is opened
  useEffect(() => {
    if (visible) {
      startStreaming();
    } else {
      stopStreaming();
      setIsStreaming(false);
      setStreamUrl("");
      setCapturedImageUri(null);
      setServerImageUri(null);
      setName("");
    }
    
    return () => {
      // Clean up when component unmounts
      stopStreaming();
    };
  }, [visible]);
  
  const startStreaming = async () => {
    try {
      setLoading(true);
      // Use the constants we defined at the top of the file
      const mjpegUrl = `http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/stream`;
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        // Try to access the stream
        const response = await fetch(`http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/start-stream`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Wait a bit for the camera to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
            
            setStreamUrl(mjpegUrl);
            setIsStreaming(true);
            console.log('Stream started successfully:', mjpegUrl);
          } else {
            throw new Error(data.error || 'Failed to start stream');
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to connect to camera');
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Camera request timed out. Please check if the camera is connected and try again.');
        }
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to camera';
      console.error('Error starting stream:', error);
      Alert.alert(
        'Camera Error',
        errorMessage,
        [
          {
            text: 'Retry',
            onPress: () => startStreaming()
          },
          { text: 'OK' }
        ]
      );
    } finally {
      setLoading(false);
    }
  };
  
  const stopStreaming = async () => {
    try {
      if (!isStreaming) return;
      
      // Stop the stream on the Pi camera
      const response = await fetch(`http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/stop-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Error stopping stream:', await response.text());
      }
    } catch (error) {
      console.error('Error stopping stream:', error);
    } finally {
      setIsStreaming(false);
      setStreamUrl("");
    }
  };
  
  const captureScreenshot = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }
    
    try {
      setLoading(true);
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        // Call the capture API on the Pi camera
        const response = await fetch(`http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/capture`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            name: name.trim(),
            timestamp: new Date().toISOString()
          }),
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json() as CaptureResponse;
          if (data.success) {
            // Store both the local Pi image URL and the server URL if available
            const piImageUrl = `http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}${data.image_url}`;
            setCapturedImageUri(piImageUrl);
            
            if (data.server_image_url) {
              // If the image was also uploaded to the main server
              const serverUrl = `${API_URL}${data.server_image_url}`;
              setServerImageUri(serverUrl);
            }
            
            Alert.alert("Success", "Image captured! Click 'Register Face' to continue.");
          } else {
            throw new Error(data.error || "Failed to capture image");
          }
        } else {
          const errorData = await response.json().catch(() => ({} as CaptureResponse));
          throw new Error(errorData.error || "Server error capturing image");
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Camera request timed out. Please check if the camera is connected and try again.');
        }
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to communicate with camera";
      console.error("Error capturing image:", error);
      Alert.alert(
        "Camera Error",
        errorMessage || "Failed to communicate with camera. Please check if the camera is online and try again.",
        [
          { 
            text: "Retry",
            onPress: () => {
              // Try to restart the stream
              stopStreaming().then(() => startStreaming());
            }
          },
          { text: "OK" }
        ]
      );
    } finally {
      setLoading(false);
    }
  };
  
  const handleRegisterFace = () => {
    if (!capturedImageUri) {
      Alert.alert("Error", "Please capture an image first");
      return;
    }
    
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }
    
    // Use the server image URI if available, otherwise use the local image
    const imageUriToUse = serverImageUri || capturedImageUri;
    
    // Call the parent handler with image path and face details
    onCapture(imageUriToUse, name.trim(), role);
    onClose();
  };
  
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: getThemeColors(colorScheme).background }]}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={getThemeColors(colorScheme).text} />
            <Text style={[styles.backButtonText, { color: getThemeColors(colorScheme).text }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: getThemeColors(colorScheme).text }]}>Register New Face</Text>
          <View style={styles.headerSpacer} />
        </View>
        
        {/* Camera Preview */}
        <View style={styles.previewContainer}>
          {capturedImageUri ? (
            <View style={styles.capturedContainer}>
              <Image 
                source={{ uri: capturedImageUri }} 
                style={styles.capturedImage} 
                resizeMode="contain"
              />
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={() => {
                  setCapturedImageUri(null);
                  startStreaming(); // Restart stream when retaking
                }}
              >
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cameraPreviewContainer}>
              {isStreaming && streamUrl ? (
                <MjpegViewer streamUrl={streamUrl} style={styles.cameraPreview} />
              ) : (
                <View style={[styles.cameraPreview, { backgroundColor: getThemeColors(colorScheme).card }]}>
                  {loading ? (
                    <ActivityIndicator size="large" color={getThemeColors(colorScheme).primary} />
                  ) : (
                    <View style={styles.cameraOfflineContainer}>
                      <Ionicons name="camera-outline" size={48} color={getThemeColors(colorScheme).gray} />
                      <Text style={[styles.cameraOfflineText, { color: getThemeColors(colorScheme).text }]}>
                        Camera not connected
                      </Text>
                      <TouchableOpacity
                        style={[styles.retryButton, { backgroundColor: getThemeColors(colorScheme).primary }]}
                        onPress={startStreaming}
                      >
                        <Text style={styles.retryButtonText}>Retry Connection</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
        
        {/* Form */}
        <ScrollView style={styles.formScrollView}>
          <View style={styles.formContainer}>
            <Text style={[styles.formLabel, { color: getThemeColors(colorScheme).text }]}>Name</Text>
            <TextInput
              style={[
                styles.textInput, 
                { 
                  backgroundColor: getThemeColors(colorScheme).card, 
                  color: getThemeColors(colorScheme).text,
                  borderColor: getThemeColors(colorScheme).cardBorder
                }
              ]}
              placeholder="Enter name"
              placeholderTextColor={getThemeColors(colorScheme).gray}
              value={name}
              onChangeText={setName}
            />
            
            <Text style={[styles.formLabel, { color: getThemeColors(colorScheme).text, marginTop: 16 }]}>Role</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.rolesContainer}
              contentContainerStyle={styles.rolesContentContainer}
            >
              {Object.keys(ROLES).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleButton,
                    { 
                      backgroundColor: role === r ? ROLES[r as keyof typeof ROLES] : 'transparent',
                      borderColor: ROLES[r as keyof typeof ROLES] 
                    }
                  ]}
                  onPress={() => setRole(r)}
                >
                  <Text
                    style={[
                      styles.roleText,
                      { color: role === r ? '#fff' : ROLES[r as keyof typeof ROLES] }
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
        
        {/* Action Button */}
        <View style={styles.buttonContainer}>
          {capturedImageUri ? (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: getThemeColors(colorScheme).primary }]}
              onPress={handleRegisterFace}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="person-add" size={20} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>Register Face</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: getThemeColors(colorScheme).primary }]}
              onPress={captureScreenshot}
              disabled={loading || !isStreaming}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="camera" size={20} color="#fff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>Capture Photo</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

// Update ScrollableRoleFilter props type
interface ScrollableRoleFilterProps {
  label: string;
  active: boolean;
  onPress: () => void;
  colorScheme: ColorSchemeName;
  color: string;
}

function ScrollableRoleFilter({ label, active, onPress, colorScheme, color }: ScrollableRoleFilterProps) {
  return (
    <TouchableOpacity
      style={[
        styles.roleFilterButton,
        active && { backgroundColor: color, borderColor: color }
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.roleFilterText,
          { color: active ? '#fff' : getThemeColors(colorScheme).text }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Add new interfaces for face registration
interface FaceDetails {
  name: string;
  role: string;
  access: {
    bedroom: boolean;
    living_room: boolean;
    kitchen: boolean;
    front_door: boolean;
  };
  images: Array<{
    uri: string;
    isFromPi?: boolean;
  }>;
}

interface FaceDetailsFormProps {
  visible: boolean;
  onClose: () => void;
  onNext: (details: FaceDetails) => void;
  colorScheme: ColorSchemeName;
}

interface PictureCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  faceDetails: FaceDetails;
  onUpdateImages: (images: FaceDetails['images']) => void;
  onSave: (details: FaceDetails) => void;
  colorScheme: ColorSchemeName;
}

const FACE_CAPTURE_TIPS = [
  "Add at least 3 pictures from different angles",
  "Ensure good lighting - face should be clearly visible",
  "Take pictures from different angles (front, slight left/right)",
  "Include pictures with and without glasses if applicable",
  "Avoid very dark or blurry images",
  "Expression should be neutral",
  "Distance should be 2-3 feet from camera"
];

const ACCESS_AREAS = {
  bedroom: "Bedroom",
  living_room: "Living Room",
  kitchen: "Kitchen",
  front_door: "Front Door"
};

// Face Details Form Component
const FaceDetailsForm = ({ visible, onClose, onNext, colorScheme }: FaceDetailsFormProps) => {
  const [details, setDetails] = useState<FaceDetails>({
    name: "",
    role: "Family",
    access: {
      bedroom: false,
      living_room: false,
      kitchen: false,
      front_door: false
    },
    images: []
  });

  const handleNext = () => {
    if (!details.name.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }
    onNext(details);
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: getThemeColors(colorScheme).background }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={getThemeColors(colorScheme).text} />
            <Text style={[styles.backButtonText, { color: getThemeColors(colorScheme).text }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: getThemeColors(colorScheme).text }]}>Add New Face</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.formScrollView}>
          <View style={styles.formContainer}>
            <Text style={[styles.formLabel, { color: getThemeColors(colorScheme).text }]}>Name</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: getThemeColors(colorScheme).card,
                  color: getThemeColors(colorScheme).text,
                  borderColor: getThemeColors(colorScheme).cardBorder
                }
              ]}
              placeholder="Enter name"
              placeholderTextColor={getThemeColors(colorScheme).gray}
              value={details.name}
              onChangeText={(text) => setDetails({ ...details, name: text })}
            />

            <Text style={[styles.formLabel, { color: getThemeColors(colorScheme).text, marginTop: 16 }]}>Role</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.rolesContainer}
              contentContainerStyle={styles.rolesContentContainer}
            >
              {Object.keys(ROLES).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleButton,
                    {
                      backgroundColor: details.role === r ? ROLES[r as keyof typeof ROLES] : 'transparent',
                      borderColor: ROLES[r as keyof typeof ROLES]
                    }
                  ]}
                  onPress={() => setDetails({ ...details, role: r })}
                >
                  <Text
                    style={[
                      styles.roleText,
                      { color: details.role === r ? '#fff' : ROLES[r as keyof typeof ROLES] }
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.formLabel, { color: getThemeColors(colorScheme).text, marginTop: 24 }]}>Access Areas</Text>
            <View style={styles.accessContainer}>
              {Object.entries(ACCESS_AREAS).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.accessButton,
                    {
                      backgroundColor: details.access[key as keyof typeof details.access] 
                        ? getThemeColors(colorScheme).primary 
                        : 'transparent',
                      borderColor: getThemeColors(colorScheme).primary
                    }
                  ]}
                  onPress={() => setDetails({
                    ...details,
                    access: {
                      ...details.access,
                      [key]: !details.access[key as keyof typeof details.access]
                    }
                  })}
                >
                  <Ionicons
                    name={details.access[key as keyof typeof details.access] ? "checkmark-circle" : "ellipse-outline"}
                    size={24}
                    color={details.access[key as keyof typeof details.access] 
                      ? "#fff" 
                      : getThemeColors(colorScheme).primary}
                    style={styles.accessIcon}
                  />
                  <Text
                    style={[
                      styles.accessText,
                      {
                        color: details.access[key as keyof typeof details.access]
                          ? "#fff"
                          : getThemeColors(colorScheme).text
                      }
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: getThemeColors(colorScheme).primary }]}
            onPress={handleNext}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="arrow-forward" size={20} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Next: Add Pictures</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// Picture Capture Modal Component
const PictureCaptureModal = ({ 
  visible, 
  onClose, 
  faceDetails,
  onUpdateImages,
  onSave,
  colorScheme 
}: PictureCaptureModalProps) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      stopStreaming();
    }
    return () => {
      stopStreaming();
    };
  }, [visible]);

  const startStreaming = async () => {
    try {
      setLoading(true);
      const mjpegUrl = `http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/stream`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(`http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/start-stream`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            await new Promise(resolve => setTimeout(resolve, 500));
            setStreamUrl(mjpegUrl);
            setIsStreaming(true);
          } else {
            throw new Error(data.error || 'Failed to start stream');
          }
        } else {
          throw new Error('Failed to connect to camera');
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Camera request timed out');
        }
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to camera';
      Alert.alert('Camera Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const stopStreaming = async () => {
    if (!isStreaming) return;
    
    try {
      await fetch(`http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/stop-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error stopping stream:', error);
    } finally {
      setIsStreaming(false);
      setStreamUrl("");
    }
  };

  const handleAddPicture = () => {
    Alert.alert(
      "Add Picture",
      "Choose how to add a picture",
      [
        {
          text: "Take Photo with Pi Camera",
          onPress: () => {
            if (isStreaming) {
              stopStreaming();
            }
            startStreaming();
          }
        },
        {
          text: "Choose from Gallery",
          onPress: pickFromGallery
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  const pickFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "You need to grant camera roll permissions to use this feature");
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0].uri) {
        const newImages = [...faceDetails.images, { uri: result.assets[0].uri }];
        onUpdateImages(newImages);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image from gallery");
    }
  };

  const captureFromPiCamera = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: faceDetails.name,
          timestamp: new Date().toISOString()
        }),
      });
      
      if (response.ok) {
        const data = await response.json() as CaptureResponse;
        if (data.success) {
          const piImageUrl = `http://${PI_CAMERA_IP}:${PI_CAMERA_PORT}${data.image_url}`;
          const newImages = [...faceDetails.images, { uri: piImageUrl, isFromPi: true }];
          onUpdateImages(newImages);
          Alert.alert("Success", "Picture captured successfully!");
        } else {
          throw new Error(data.error || "Failed to capture image");
        }
      } else {
        throw new Error("Server error capturing image");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to capture image";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (faceDetails.images.length < 3) {
      Alert.alert(
        "More Pictures Required", 
        "Please add at least 3 pictures from different angles for better face recognition. This helps improve accuracy."
      );
      return;
    }
    
    try {
      setLoading(true);
      
      // First, register the face with the first image
      const firstImage = faceDetails.images[0];
      const formData = new FormData();
      
      // Ensure proper image format and quality
      formData.append('image', {
        uri: firstImage.uri,
        type: 'image/jpeg',
        name: 'face.jpg',
        quality: 0.9  // High quality JPEG
      } as unknown as Blob);
      formData.append('name', faceDetails.name);
      formData.append('role', faceDetails.role);
      formData.append('access_bedroom', faceDetails.access.bedroom.toString());
      formData.append('access_living_room', faceDetails.access.living_room.toString());
      formData.append('access_kitchen', faceDetails.access.kitchen.toString());
      formData.append('access_front_door', faceDetails.access.front_door.toString());
      
      console.log('Uploading face with data:', {
        name: faceDetails.name,
        role: faceDetails.role,
        imageUri: firstImage.uri
      });
      
      const response = await fetch(`${API_URL}/api/faces`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const responseText = await response.text();
      console.log('Server response:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error('Invalid server response: ' + responseText);
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to register face');
      }
      
      const faceId = data.id;
      
      // Then add any additional images
      const additionalImages = faceDetails.images.slice(1);
      let failedUploads = 0;
      
      const uploadPromises = additionalImages.map(async (image, index) => {
        try {
          const imageFormData = new FormData();
          imageFormData.append('image', {
            uri: image.uri,
            type: 'image/jpeg',
            name: 'face.jpg',
            quality: 0.9  // High quality JPEG
          } as unknown as Blob);
          
          const imageResponse = await fetch(`${API_URL}/api/faces/${faceId}/images`, {
            method: 'POST',
            body: imageFormData,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'multipart/form-data',
            },
          });
          
          if (!imageResponse.ok) {
            const errorData = await imageResponse.json().catch(() => ({ error: 'Failed to upload image' }));
            throw new Error(errorData.error || 'Failed to upload image');
          }
          
          return await imageResponse.json();
        } catch (error) {
          console.error(`Error uploading additional image ${index + 2}:`, error);
          failedUploads++;
          return null;
        }
      });
      
      const results = await Promise.all(uploadPromises);
      
      if (failedUploads > 0) {
        Alert.alert(
          "Partial Success",
          `Face registered successfully but ${failedUploads} additional image${failedUploads > 1 ? 's' : ''} failed to upload. You can add more images later.`
        );
      } else {
        Alert.alert("Success", "Face registered successfully with all images!");
      }
      
      onClose();
    } catch (error) {
      console.error("Error saving face:", error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to save face. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: getThemeColors(colorScheme).background }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={getThemeColors(colorScheme).text} />
            <Text style={[styles.backButtonText, { color: getThemeColors(colorScheme).text }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: getThemeColors(colorScheme).text }]}>Add Pictures</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.formScrollView}>
          <View style={styles.formContainer}>
            <View style={styles.tipsContainer}>
              <Text style={[styles.tipsTitle, { color: getThemeColors(colorScheme).text }]}>
                Tips for Better Face Recognition
              </Text>
              {FACE_CAPTURE_TIPS.map((tip, index) => (
                <View key={index} style={styles.tipRow}>
                  <Ionicons name="bulb-outline" size={16} color={getThemeColors(colorScheme).primary} />
                  <Text style={[styles.tipText, { color: getThemeColors(colorScheme).text }]}>
                    {tip}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.imagesContainer}>
              <Text style={[styles.imagesTitle, { color: getThemeColors(colorScheme).text }]}>
                Pictures ({faceDetails.images.length}/3 minimum)
              </Text>
              <View style={styles.imageCountIndicator}>
                <View style={styles.progressDots}>
                  {[0, 1, 2].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.progressDot,
                        {
                          backgroundColor: index < faceDetails.images.length 
                            ? getThemeColors(colorScheme).primary 
                            : getThemeColors(colorScheme).gray
                        }
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.imageCountText, { color: getThemeColors(colorScheme).text }]}>
                  {faceDetails.images.length < 3 
                    ? `Add ${3 - faceDetails.images.length} more picture${3 - faceDetails.images.length !== 1 ? 's' : ''}`
                    : 'Minimum requirement met'}
                </Text>
              </View>
              <View style={styles.imageGrid}>
                {faceDetails.images.map((image, index) => (
                  <View key={index} style={styles.imageWrapper}>
                    <Image source={{ uri: image.uri }} style={styles.thumbnailImage} />
                    <TouchableOpacity
                      style={styles.deleteImageButton}
                      onPress={() => {
                        const newImages = faceDetails.images.filter((_, i) => i !== index);
                        onUpdateImages(newImages);
                      }}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff3b30" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.addImageButton, { backgroundColor: getThemeColors(colorScheme).card }]}
                  onPress={handleAddPicture}
                >
                  <Ionicons name="add" size={40} color={getThemeColors(colorScheme).primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        {isStreaming && (
          <View style={styles.streamOverlay}>
            <View style={styles.streamContainer}>
              <MjpegViewer streamUrl={streamUrl} style={styles.streamView} />
              <TouchableOpacity
                style={[styles.captureButton, { backgroundColor: getThemeColors(colorScheme).primary }]}
                onPress={captureFromPiCamera}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="camera" size={30} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeStreamButton}
                onPress={() => {
                  stopStreaming();
                }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: getThemeColors(colorScheme).primary }]}
            onPress={handleSave}
            disabled={loading || faceDetails.images.length === 0}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.buttonContent}>
                <Ionicons name="save" size={20} color="#fff" style={styles.buttonIcon} />
                <Text style={styles.buttonText}>Save Face</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// Add these interfaces near the top of the file
interface ImageUpload {
  uri: string;
  type: string;
  name: string;
}

export default function FacesScreen() {
  const [faces, setFaces] = useState(MOCK_FACES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isCaptureModalVisible, setIsCaptureModalVisible] = useState(false);
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [showPictureCapture, setShowPictureCapture] = useState(false);
  const [newFaceDetails, setNewFaceDetails] = useState<FaceDetails>({
    name: "",
    role: "Family",
    access: {
      bedroom: false,
      living_room: false,
      kitchen: false,
      front_door: false
    },
    images: []
  });
  const colorScheme = useColorScheme();
  const flatListRef = useRef<FlatList>(null);
  
  // Fetch faces from the API
  const fetchFaces = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_URL}/api/faces`);
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const formattedData = data.map(face => ({
            id: face.id.toString(),
            name: face.name,
            role: face.role,
            image: `${API_URL}${face.image}`,
            dateAdded: face.dateAdded || new Date().toISOString(),
            sampleCount: face.sampleCount || 1,
          }));
          setFaces(formattedData);
          
          // Scroll to the bottom to show new faces
          setTimeout(() => {
            if (flatListRef.current) {
              flatListRef.current.scrollToEnd({ animated: true });
            }
          }, 500);
        }
      }
    } catch (error) {
      console.error("Error fetching faces:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchFaces();
  }, []);

  // Fetch faces on component mount and after registration
  useEffect(() => {
    fetchFaces();
  }, []);
  
  const filteredFaces = faces.filter(face => {
    // Filter by search query
    const nameMatches = face.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by role
    const roleMatches = selectedRole === 'All' || face.role === selectedRole;
    
    return nameMatches && roleMatches;
  });
  
  // Take a photo using Pi camera
  const handleCaptureFromPi = async () => {
    // Show the capture modal instead of directly calling the API
    setIsCaptureModalVisible(true);
  };
  
  // Process image and add face
  const processAndAddFace = async (imageUri: string, name: string, role: string) => {
    try {
      setLoading(true);
      
      // Create form data
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'face.jpg'
      } as unknown as Blob);
      formData.append('name', name);
      formData.append('role', role);
      
      // Send to server
      const response = await fetch(`${API_URL}/api/faces`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        Alert.alert("Success", "Face registered successfully!");
        
        // Add the new face to our state
        const newFace = {
          id: data.id.toString(),
          name: name,
          role: role,
          image: `${API_URL}${data.image}`,
          dateAdded: new Date().toISOString(),
          sampleCount: 1,
        };
        
        setFaces([...faces, newFace]);
        return true;
      } else {
        const errorData = await response.json();
        Alert.alert("Error", errorData.error || "Failed to register face");
      }
    } catch (error) {
      console.error("Error registering face:", error);
      Alert.alert("Error", "Failed to communicate with server");
    } finally {
      setLoading(false);
    }
    return false;
  };
  
  const handleAddNewFace = () => {
    setShowDetailsForm(true);
  };

  const handleDetailsNext = (details: FaceDetails) => {
    setNewFaceDetails(details);
    setShowDetailsForm(false);
    setShowPictureCapture(true);
  };

  const handleUpdateImages = (images: FaceDetails['images']) => {
    setNewFaceDetails(prev => ({ ...prev, images }));
  };

  const handleSaveFace = async (details: FaceDetails) => {
    setShowPictureCapture(false);
    // After successful registration, refresh the faces list
    await fetchFaces();
  };
  
  const renderFaceCard = ({ item }: { item: Face }) => (
    <TouchableOpacity 
      style={[styles.faceCard, { 
        backgroundColor: getThemeColors(colorScheme).card, 
        borderColor: getThemeColors(colorScheme).cardBorder 
      }]}
      onPress={() => handleFacePress(item)}
    >
      <Image source={{ uri: item.image }} style={styles.faceImage} />
      <View style={[styles.roleTag, { backgroundColor: ROLES[item.role as keyof typeof ROLES] }]}>
        <Text style={styles.roleText}>{item.role}</Text>
      </View>
      <View style={styles.faceInfo}>
        <Text style={[styles.faceName, { color: getThemeColors(colorScheme).text }]}>{item.name}</Text>
        <View style={styles.sampleInfo}>
          <Ionicons name="images-outline" size={16} color={getThemeColors(colorScheme).gray} />
          <Text style={[styles.sampleText, { color: getThemeColors(colorScheme).gray }]}>
            {item.sampleCount} sample{item.sampleCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
  
  // Add back the handleFacePress function
  const handleFacePress = (face: Face) => {
    Alert.alert(
      face.name,
      `Role: ${face.role}\nSamples: ${face.sampleCount}`,
      [
        {
          text: "View Samples",
          onPress: () => Alert.alert("Coming Soon", "This feature will be available soon."),
        },
        {
          text: "Add Samples",
          onPress: () => handleAddSampleToFace(face),
        },
        {
          text: "Delete",
          onPress: () => handleDeleteFace(face),
          style: "destructive"
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };
  
  // Add these functions before the handleFacePress function
  const handleAddSampleToFace = (face: Face) => {
    Alert.alert(
      "Add Sample", 
      `Add another sample image for ${face.name}`,
      [
        {
          text: "Take Photo with Pi Camera",
          onPress: () => {
            setShowPictureCapture(true);
            setNewFaceDetails({
              ...newFaceDetails,
              name: face.name,
              role: face.role,
              images: []
            });
          },
        },
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            
            if (!permissionResult.granted) {
              Alert.alert("Permission Required", "You need to grant camera roll permissions to use this feature");
              return;
            }
            
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            
            if (!result.canceled && result.assets[0].uri) {
              const formData = new FormData();
              formData.append('image', {
                uri: result.assets[0].uri,
                type: 'image/jpeg',
                name: 'face.jpg'
              } as unknown as Blob);
              
              try {
                const response = await fetch(`${API_URL}/api/faces/${face.id}/images`, {
                  method: 'POST',
                  body: formData,
                  headers: {
                    'Content-Type': 'multipart/form-data',
                  },
                });
                
                if (response.ok) {
                  Alert.alert("Success", "Sample image added successfully!");
                  
                  // Update the face's sample count in our state
                  setFaces(faces.map(f => 
                    f.id === face.id 
                      ? {...f, sampleCount: f.sampleCount + 1}
                      : f
                  ));
                } else {
                  const errorData = await response.json();
                  Alert.alert("Error", errorData.error || "Failed to add sample image");
                }
              } catch (error) {
                console.error("Error adding sample:", error);
                Alert.alert("Error", "Failed to communicate with server");
              }
            }
          },
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  const handleDeleteFace = (face: Face) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete ${face.name}?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Delete", 
          onPress: async () => {
            try {
              setLoading(true);
              
              const response = await fetch(`${API_URL}/api/faces/${face.id}`, {
                method: 'DELETE',
              });
              
              if (response.ok) {
                Alert.alert("Success", `${face.name} has been deleted`);
                // Remove from our state
                setFaces(faces.filter(f => f.id !== face.id));
              } else {
                Alert.alert("Error", "Failed to delete face");
              }
            } catch (error) {
              console.error("Error deleting face:", error);
              Alert.alert("Error", "Failed to communicate with server");
            } finally {
              setLoading(false);
            }
          },
          style: "destructive"
        }
      ]
    );
  };
  
  return (
    <View style={[styles.container, { backgroundColor: getThemeColors(colorScheme).background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      <View style={styles.header}>
        <View style={[styles.searchBar, { 
          backgroundColor: getThemeColors(colorScheme).card,
          borderColor: getThemeColors(colorScheme).cardBorder 
        }]}>
          <Ionicons name="search" size={20} color={getThemeColors(colorScheme).gray} />
          <TextInput
            style={[styles.searchInput, { color: getThemeColors(colorScheme).text }]}
            placeholder="Search faces..."
            placeholderTextColor={getThemeColors(colorScheme).gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={getThemeColors(colorScheme).gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <View style={styles.roleFilters}>
        <ScrollableRoleFilter 
          label="All" 
          active={selectedRole === 'All'} 
          onPress={() => setSelectedRole('All')}
          colorScheme={colorScheme}
          color={getThemeColors(colorScheme).primary}
        />
        {Object.keys(ROLES).map((role) => (
          <ScrollableRoleFilter
            key={role}
            label={role}
            active={selectedRole === role}
            onPress={() => setSelectedRole(role)}
            colorScheme={colorScheme}
            color={ROLES[role as keyof typeof ROLES]}
          />
        ))}
      </View>
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={getThemeColors(colorScheme).primary} />
          <Text style={{ color: getThemeColors(colorScheme).text, marginTop: 10 }}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredFaces}
          renderItem={renderFaceCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.facesList}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={{ color: getThemeColors(colorScheme).text }}>
                {searchQuery ? "No faces match your search" : "No faces registered yet"}
              </Text>
            </View>
          )}
        />
      )}
      
      <FaceDetailsForm
        visible={showDetailsForm}
        onClose={() => setShowDetailsForm(false)}
        onNext={handleDetailsNext}
        colorScheme={colorScheme}
      />
      
      <PictureCaptureModal
        visible={showPictureCapture}
        onClose={() => setShowPictureCapture(false)}
        faceDetails={newFaceDetails}
        onUpdateImages={handleUpdateImages}
        onSave={handleSaveFace}
        colorScheme={colorScheme}
      />
      
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: getThemeColors(colorScheme).primary }]}
        onPress={handleAddNewFace}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="add" size={24} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
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
    padding: 4,
  },
  roleFilters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  roleFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  roleFilterText: {
    fontWeight: '500',
    fontSize: 14,
  },
  facesList: {
    padding: 8,
    flexGrow: 1,
  },
  faceCard: {
    flex: 1,
    margin: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    maxWidth: '46%',
  },
  faceImage: {
    height: 160,
    width: '100%',
  },
  roleTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  roleText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 12,
  },
  faceInfo: {
    padding: 10,
  },
  faceName: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sampleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sampleText: {
    fontSize: 13,
    marginLeft: 4,
  },
  addButton: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    paddingTop: 60, // Increased padding to avoid phone bezel
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backButtonText: {
    fontSize: 17,
    marginLeft: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 70, // Match the width of the back button for centering
  },
  previewContainer: {
    height: 350, // Increased height for better preview
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  cameraPreviewContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 16,
  },
  cameraOfflineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraPreview: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraOfflineText: {
    fontSize: 16,
  },
  formScrollView: {
    flex: 1,
  },
  formContainer: {
    paddingHorizontal: 20,
  },
  formLabel: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    fontSize: 16,
  },
  rolesContainer: {
    marginTop: 8,
  },
  rolesContentContainer: {
    paddingVertical: 8,
  },
  roleButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1.5,
  },
  buttonContainer: {
    padding: 20,
    paddingBottom: 30, // Extra padding at bottom
  },
  actionButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  capturedContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  capturedImage: {
    width: '100%',
    height: '100%',
  },
  retakeButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  accessContainer: {
    marginTop: 8,
  },
  accessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  accessIcon: {
    marginRight: 12,
  },
  accessText: {
    fontSize: 16,
    fontWeight: '500',
  },
  tipsContainer: {
    backgroundColor: 'rgba(200, 200, 200, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  imagesContainer: {
    marginBottom: 24,
  },
  imagesTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  imageCountIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  imageCountText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  imageWrapper: {
    width: '33.33%',
    padding: 8,
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
  },
  deleteImageButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 4,
  },
  addImageButton: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  streamOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  streamContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  streamView: {
    width: '100%',
    height: '100%',
  },
  captureButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeStreamButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 