import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface MapState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

const initialState: MapState = {
  center: [0, 0],
  zoom: 0,
  pitch: 0,
  bearing: 0,
};

const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setMapState(state, action: PayloadAction<MapState>) {
      state.center = [...action.payload.center];
      state.zoom = action.payload.zoom;
      state.pitch = action.payload.pitch;
      state.bearing = action.payload.bearing;
    },
  },
});

export const { setMapState } = mapSlice.actions;
export default mapSlice.reducer;
