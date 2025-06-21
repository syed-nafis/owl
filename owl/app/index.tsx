// App.tsx - Main entry point
import { Redirect } from 'expo-router';

// Redirect to the tabbed navigation structure
export default function App() {
  return <Redirect href="/(tabs)" />;
}
