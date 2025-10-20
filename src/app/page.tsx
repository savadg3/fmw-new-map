// app/page.tsx
'use client';

import LocationSearch from '@/components/LocationSearch';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { clearRecentLocations, clearAllLocations } from '../store/slices/locationSlice';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { selectedLocation, currentLocation, recentLocations } = useAppSelector((state) => state.location);
  const dispatch = useAppDispatch();
  const router = useRouter();

  const handleClearAll = () => {
    dispatch(clearAllLocations());
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-2xl mx-auto">
       
        
        {!selectedLocation && <LocationSearch 
          placeholder="Search for any location..."
          showRecent={true}
        />}

        <div className="mt-8 grid grid-cols-1  gap-6">
          {selectedLocation && (
            <div className="p-4 bg-[#686262]  rounded-lg shadow">
              <h3 className="font-semibold text-gray-300 mb-2">Selected Location:</h3>
              <p className="text-sm text-gray-300">{selectedLocation.name}</p>
              <p className="text-xs text-gray-300 mt-1">
                Lat: {selectedLocation.latitude.toFixed(6)}, Lng: {selectedLocation.longitude.toFixed(6)}
              </p>
            </div>
          )}

          {/* {currentLocation && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h3 className="font-semibold text-gray-900 mb-2">Current Location:</h3>
              <p className="text-sm text-gray-600">{currentLocation.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                Lat: {currentLocation.latitude.toFixed(6)}, Lng: {currentLocation.longitude.toFixed(6)}
              </p>
            </div>
          )} */}
        </div>

        {/* Recent Locations */}
        {/* {recentLocations.length > 0 && (
          <div className="mt-6 p-4 bg-white rounded-lg shadow">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">Recent Locations</h3>
              <button
                onClick={handleClearRecent}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Clear Recent
              </button>
            </div>
            <div className="space-y-2">
              {recentLocations.map((location) => (
                <div key={location.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                  <div>
                    <p className="text-sm text-gray-900">{location.name.split(',')[0]}</p>
                    <p className="text-xs text-gray-500">
                      {location.name.split(',').slice(1, 3).join(',')}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )} */}

        {/* Clear All Button */}
        {(selectedLocation || currentLocation || recentLocations.length > 0) && (
          <div className="mt-6 flex gap-4 justify-center">
            <button
              onClick={handleClearAll}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Clear All Locations
            </button>
            <button
              onClick={() => router.push("floor-plan")}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Add floor plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}