/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#2f95dc';
const tintColorDark = '#fff';

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
    tabBackground: '#fff',
    gray: '#666',
    secondary: '#666',
    cardBackground: '#fff',
    cardBorder: '#e1e1e1',
    primary: '#0070f3',
    tertiary: '#8b5cf6',
    success: '#10b981',
    danger: '#dc3545',
    warning: '#f59e0b',
    lightGray: '#e5e7eb',
    overlay: 'rgba(0,0,0,0.5)',
    lightBackground: '#f3f4f6',
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
    tabBackground: '#000',
    gray: '#999',
    secondary: '#666',
    cardBackground: '#1a1a1a',
    cardBorder: '#333',
    primary: '#60a5fa',
    tertiary: '#a78bfa',
    success: '#10b981',
    danger: '#ff4444',
    danger: '#ef4444',
    warning: '#f59e0b',
    lightGray: '#374151',
    overlay: 'rgba(0,0,0,0.7)',
    lightBackground: '#26282c',
  },
};
