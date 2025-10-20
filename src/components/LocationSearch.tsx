'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Navigation, Clock } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedLocation, setCurrentLocation, setLoading, setError, type Location } from '../store/slices/locationSlice';

interface LocationSearchProps {
  placeholder?: string;
  showRecent?: boolean;
}

export default function LocationSearch({ 
  placeholder = "Search locations...",
  showRecent = true
}: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dispatch = useAppDispatch();
  const { recentLocations, isLoading } = useAppSelector((state) => state.location);

  // Debounced search for locations
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      dispatch(setLoading(true));
      try {
        const results = await searchLocations(query);
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Error searching locations:', error);
        dispatch(setError('Failed to search locations'));
        setSuggestions([]);
      } finally {
        dispatch(setLoading(false));
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, dispatch]);

  const searchLocations = async (searchQuery: string): Promise<Location[]> => {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch locations');
    }

    const data = await response.json();
    
    return data.map((item: any) => ({
      id: item.place_id,
      name: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    }));
  };

  const getCurrentLocation = () => {
    setShowSuggestions(false)
    if (!navigator.geolocation) {
      dispatch(setError('Geolocation is not supported by your browser'));
      return;
    }

    dispatch(setLoading(true));
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocode to get location name
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          
          if (response.ok) {
            const data = await response.json();
            const location: Location = {
              id: 'current',
              name: data.display_name,
              latitude,
              longitude,
            };
            
            // setQuery(data.display_name);
            dispatch(setCurrentLocation(location));
          }
        } catch (error) {
          console.error('Error getting location name:', error);
          // Still provide coordinates even if reverse geocoding fails
          const location: Location = {
            id: 'current',
            name: `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            latitude,
            longitude,
          };
          // setQuery(location.name);
          dispatch(setCurrentLocation(location));
        } finally {
          dispatch(setLoading(false));
          // setShowSuggestions(false);
        }
      },
      (error) => {
        console.error('Error getting current location:', error);
        dispatch(setLoading(false));
        dispatch(setError('Unable to get your current location. Please make sure location services are enabled.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const handleSuggestionClick = (location: Location) => {
    setShowSuggestions(false);
    dispatch(setSelectedLocation(location));
  };

  const handleRecentLocationClick = (location: Location) => {
    setQuery(location.name);
    setShowSuggestions(false);
    dispatch(setSelectedLocation(location));
  };

  const handleInputBlur = () => {
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const displaySuggestions = showRecent && query.length === 0 && recentLocations.length > 0 
    ? recentLocations 
    : suggestions;

  const showRecentLabel = showRecent && query.length === 0 && recentLocations.length > 0;

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="w-full text-gray-500 pl-10 pr-20 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={getCurrentLocation}
          disabled={isLoading}
          className="absolute right-2 p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
          title="Use current location"
        >
          <Navigation className="h-4 w-4" />
        </button>
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && (displaySuggestions.length > 0 || isLoading) && (
        <div className="absolute z-10 w-full mt-1 bg-[#686262] border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-light">
              Searching...
            </div>
          ) : (
            <>
              {showRecentLabel && (
                <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-200 flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  Recent Locations
                </div>
              )}
              
              {displaySuggestions.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  className="w-full p-3 text-left hover:bg-gray-500 border-b border-gray-100 last:border-b-0 flex items-start"
                  onClick={() => 
                    showRecentLabel 
                      ? handleRecentLocationClick(location)
                      : handleSuggestionClick(location)
                  }
                >
                  <MapPin className="h-4 w-4 text-light mt-0.5 mr-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-light truncate">
                      {location.name.split(',')[0]}
                    </div>
                    <div className="text-xs text-light truncate">
                      {location.name.split(',').slice(1).join(',').trim()}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}