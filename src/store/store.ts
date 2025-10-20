import { configureStore } from '@reduxjs/toolkit';
import locationReducer from './slices/locationSlice';
import mapReducer from './slices/mapSlices';

export const makeStore = () => {
  return configureStore({
    reducer: {
      location: locationReducer,
      map: mapReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['persist/PERSIST'],
        },
      }),
  });
};

// Infer the type of makeStore
export type AppStore = ReturnType<typeof makeStore>;
// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];