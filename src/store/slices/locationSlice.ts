import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  state?: string;
}

interface LocationState {
  currentLocation: Location | null;
  selectedLocation: Location | null;
  recentLocations: Location[];
  isLoading: boolean;
  error: string | null;
}

const initialState: LocationState = {
  currentLocation: null,
  selectedLocation: null,
  recentLocations: [],
  isLoading: false,
  error: null,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setCurrentLocation: (state, action: PayloadAction<Location>) => {
      state.currentLocation = action.payload;
      state.selectedLocation = action.payload;
      
      // Add to recent locations if not already there
      const exists = state.recentLocations.some(
        loc => loc.id === action.payload.id
      );
      if (!exists) {
        state.recentLocations.unshift(action.payload);
        // Keep only last 5 locations
        state.recentLocations = state.recentLocations.slice(0, 5);
      }
    },
    
    setSelectedLocation: (state, action: PayloadAction<Location>) => {
      state.selectedLocation = action.payload;
      
      // Add to recent locations if not already there
      const exists = state.recentLocations.some(
        loc => loc.id === action.payload.id
      );
      if (!exists) {
        state.recentLocations.unshift(action.payload);
        // Keep only last 5 locations
        state.recentLocations = state.recentLocations.slice(0, 5);
      }
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    clearError: (state) => {
      state.error = null;
    },
    
    clearRecentLocations: (state) => {
      state.recentLocations = [];
    },
    
    removeRecentLocation: (state, action: PayloadAction<string>) => {
      state.recentLocations = state.recentLocations.filter(
        loc => loc.id !== action.payload
      );
    },
    
    clearAllLocations: (state) => {
      state.currentLocation = null;
      state.selectedLocation = null;
      state.recentLocations = [];
    },
  },
});

export const {
  setCurrentLocation,
  setSelectedLocation,
  setLoading,
  setError,
  clearError,
  clearRecentLocations,
  removeRecentLocation,
  clearAllLocations,
} = locationSlice.actions;

export default locationSlice.reducer;