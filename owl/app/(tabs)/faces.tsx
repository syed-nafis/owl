import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Colors from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

// Mock data for registered faces
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

export default function FacesScreen() {
  const [faces, setFaces] = useState(MOCK_FACES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const colorScheme = useColorScheme();
  
  const filteredFaces = faces.filter(face => {
    // Filter by search query
    const nameMatches = face.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by role
    const roleMatches = selectedRole === 'All' || face.role === selectedRole;
    
    return nameMatches && roleMatches;
  });
  
  const handleAddNewFace = () => {
    Alert.alert(
      "Add New Face", 
      "Choose how to add a new face to recognize",
      [
        {
          text: "Take Photo",
          onPress: () => console.log("Take photo"),
        },
        {
          text: "Choose from Gallery",
          onPress: () => console.log("Choose from gallery"),
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };
  
  const handleFacePress = (face) => {
    Alert.alert(
      face.name,
      `Role: ${face.role}\nSamples: ${face.sampleCount}`,
      [
        {
          text: "Edit",
          onPress: () => console.log("Edit face", face.id),
        },
        {
          text: "Add Samples",
          onPress: () => console.log("Add samples", face.id),
        },
        {
          text: "Delete",
          onPress: () => {
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
                  onPress: () => {
                    setFaces(faces.filter(f => f.id !== face.id));
                  },
                  style: "destructive"
                }
              ]
            );
          },
          style: "destructive"
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };
  
  const renderFaceCard = ({ item }) => (
    <TouchableOpacity 
      style={[styles.faceCard, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}
      onPress={() => handleFacePress(item)}
    >
      <Image source={{ uri: item.image }} style={styles.faceImage} />
      <View style={[styles.roleTag, { backgroundColor: ROLES[item.role] }]}>
        <Text style={styles.roleText}>{item.role}</Text>
      </View>
      <View style={styles.faceInfo}>
        <Text style={[styles.faceName, { color: Colors[colorScheme].text }]}>{item.name}</Text>
        <View style={styles.sampleInfo}>
          <Ionicons name="images-outline" size={16} color={Colors[colorScheme].gray} />
          <Text style={[styles.sampleText, { color: Colors[colorScheme].gray }]}>
            {item.sampleCount} sample{item.sampleCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
  
  return (
    <View style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: Colors[colorScheme].card, borderColor: Colors[colorScheme].cardBorder }]}>
          <Ionicons name="search" size={20} color={Colors[colorScheme].gray} />
          <TextInput
            style={[styles.searchInput, { color: Colors[colorScheme].text }]}
            placeholder="Search faces..."
            placeholderTextColor={Colors[colorScheme].gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors[colorScheme].gray} />
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
          color={Colors[colorScheme].primary}
        />
        {Object.keys(ROLES).map((role) => (
          <ScrollableRoleFilter
            key={role}
            label={role}
            active={selectedRole === role}
            onPress={() => setSelectedRole(role)}
            colorScheme={colorScheme}
            color={ROLES[role]}
          />
        ))}
      </View>
      
      <FlatList
        data={filteredFaces}
        renderItem={renderFaceCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.facesList}
      />
      
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: Colors[colorScheme].primary }]}
        onPress={handleAddNewFace}
      >
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function ScrollableRoleFilter({ label, active, onPress, colorScheme, color }) {
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
}); 