// components/MjpegViewer.tsx
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

interface MjpegViewerProps {
  streamUrl: string;
  style?: ViewStyle;
}

const MjpegViewer: React.FC<MjpegViewerProps> = ({ streamUrl, style }) => {
  return (
    <View style={[styles.container, style]}>
      <WebView
        source={{ uri: streamUrl }}
        style={styles.webview}
        allowsInlineMediaPlayback
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-start', // Align to top
    paddingTop: 0, // Remove extra top padding
  },
  webview: {
    flex: 1,
  },
});

export default MjpegViewer;
