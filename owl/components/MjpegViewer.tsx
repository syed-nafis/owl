// components/MjpegViewer.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ViewStyle, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';

interface MjpegViewerProps {
  streamUrl: string;
  style?: ViewStyle;
}

const MjpegViewer: React.FC<MjpegViewerProps> = ({ streamUrl, style }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // HTML template for displaying MJPEG stream
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            overflow: hidden;
          }
          img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <img src="${streamUrl}" onerror="window.ReactNativeWebView.postMessage('error')" onload="window.ReactNativeWebView.postMessage('loaded')">
      </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    const message = event.nativeEvent.data;
    if (message === 'loaded') {
      setIsLoading(false);
      setError(null);
    } else if (message === 'error') {
      setIsLoading(false);
      setError('Failed to connect to camera stream');
    }
  };

  useEffect(() => {
    // Reset states when stream URL changes
    setIsLoading(true);
    setError(null);
  }, [streamUrl]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        allowsInlineMediaPlayback
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
      />
      {isLoading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Connecting to camera...</Text>
        </View>
      )}
      {error && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
});

export default MjpegViewer;
