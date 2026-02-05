// ahoi color scheme - family-friendly, Hamburg-inspired

const primary = '#0087B1'; // Hamburg harbor blue
const secondary = '#FF9900'; // Warm accent

// Category colors for event types
export const CategoryColors = {
  theater: '#9B59B6',    // Purple
  outdoor: '#27AE60',    // Green
  museum: '#E67E22',     // Orange
  music: '#E91E63',      // Pink
  sport: '#3498DB',      // Blue
  market: '#F1C40F',     // Yellow
  kreativ: '#FF6B6B',    // Coral
  lesen: '#45B7D1',      // Teal
} as const;

export default {
  light: {
    text: '#1A1A1A',
    textSecondary: '#666666',
    background: '#FFFFFF',
    backgroundSecondary: '#F5F5F5',
    tint: primary,
    tabIconDefault: '#CCCCCC',
    tabIconSelected: primary,
    border: '#E0E0E0',
    card: '#FFFFFF',
    success: '#27AE60',
    error: '#E74C3C',
    warning: '#F1C40F',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#A0A0A0',
    background: '#121212',
    backgroundSecondary: '#1E1E1E',
    tint: '#4DB8D9',
    tabIconDefault: '#666666',
    tabIconSelected: '#4DB8D9',
    border: '#333333',
    card: '#1E1E1E',
    success: '#2ECC71',
    error: '#E74C3C',
    warning: '#F1C40F',
  },
};
