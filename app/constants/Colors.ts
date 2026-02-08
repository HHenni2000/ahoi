// ahoi "Coastal Fresh" color scheme
// Scandinavian-minimal, Hamburg-inspired

import { EventCategory } from '@/types/event';

const primary = '#1A7A94'; // Deep petrol

// Category colors - softer pastels
export const CategoryColors: Record<EventCategory, string> = {
  theater: '#A78BCA',
  outdoor: '#5EBD8A',
  museum: '#E8A465',
  music: '#E87BA0',
  sport: '#6DB3E8',
  market: '#E8D06A',
  kreativ: '#F09090',
  lesen: '#6EC5DC',
} as const;

// Pastel backgrounds for cards per category
export const CategoryPastelColors: Record<EventCategory, string> = {
  theater: '#F5F0FA',
  outdoor: '#EEFAF3',
  museum: '#FDF5EC',
  music: '#FDF0F5',
  sport: '#EEF5FD',
  market: '#FDFAEC',
  kreativ: '#FDF0F0',
  lesen: '#EEFAFD',
} as const;

// Dark mode pastel backgrounds
export const CategoryPastelColorsDark: Record<EventCategory, string> = {
  theater: '#1E1528',
  outdoor: '#0F2018',
  museum: '#241A0F',
  music: '#24101A',
  sport: '#0F1824',
  market: '#24200F',
  kreativ: '#241010',
  lesen: '#0F1E24',
} as const;

export default {
  light: {
    text: '#1A2B3C',
    textSecondary: '#7A8B9A',
    background: '#FAFAF7',
    backgroundSecondary: '#F2F0EB',
    tint: primary,
    tabIconDefault: '#B8C5D0',
    tabIconSelected: primary,
    border: '#E8ECF0',
    card: '#FFFFFF',
    success: '#5EBD8A',
    error: '#E87B7B',
    warning: '#E8D06A',
  },
  dark: {
    text: '#F0F4F8',
    textSecondary: '#8899AA',
    background: '#0F1A24',
    backgroundSecondary: '#1A2634',
    tint: '#3DB8D9',
    tabIconDefault: '#4A5A6A',
    tabIconSelected: '#3DB8D9',
    border: '#2A3A4A',
    card: '#1E2D3D',
    success: '#5EBD8A',
    error: '#E87B7B',
    warning: '#E8D06A',
  },
};
