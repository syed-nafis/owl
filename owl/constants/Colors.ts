/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0070f3';
const tintColorDark = '#60a5fa';

export default {
  light: {
    text: '#1a1a1a',
    background: '#ffffff',
    tint: tintColorLight,
    tabBackground: '#f5f5f5',
    tabInactive: '#8e8e93',
    card: '#ffffff',
    cardBorder: '#e5e5e5',
    primary: '#0070f3',
    secondary: '#3b82f6',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    gray: '#6b7280',
    lightGray: '#e5e7eb',
    overlay: 'rgba(0,0,0,0.5)',
  },
  dark: {
    text: '#ffffff',
    background: '#121212',
    tint: tintColorDark,
    tabBackground: '#1e1e1e',
    tabInactive: '#6b7280',
    card: '#1e1e1e',
    cardBorder: '#2e2e2e',
    primary: '#60a5fa',
    secondary: '#3b82f6',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    gray: '#9ca3af',
    lightGray: '#374151',
    overlay: 'rgba(0,0,0,0.7)',
  },
};
