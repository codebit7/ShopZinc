import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../api/client";
// No cycle: authSlice imports only the api client, not this slice.
import { logout } from "./authSlice";

export const getWishlistItem = createAsyncThunk(
  "wishlist/getItems",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get("/wishlist");
      return res.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch wishlist items"
      );
    }
  }
);


export const addToWishlist = createAsyncThunk(
  "wishlist/addItem",
  async (item, { rejectWithValue }) => {
    try {
      const res = await api.post("/wishlist", { item });
      return res.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to add item to wishlist"
      );
    }
  }
);


export const removeToWishlist = createAsyncThunk(
  "wishlist/removeItem",
  async (item, { rejectWithValue }) => {
    try {
      // DELETE — matches the route (not POST)
      // backend returns the full wishlist after the change — keep redux in sync with the server
      const res = await api.delete("/wishlist/remove", { data: { item } });
      return res.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to remove item from wishlist"
      );
    }
  }
);


export const clearWishlist = createAsyncThunk(
  "wishlist/clear",
  async (_, { rejectWithValue }) => {
    try {
      // backend returns the (now empty) wishlist array
      const res = await api.post("/wishlist/clear", {});
      return res.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to clear wishlist"
      );
    }
  }
);

const wishListSlice = createSlice({
  name: "wishList",
  initialState: {
    wishList: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      
      .addCase(getWishlistItem.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getWishlistItem.fulfilled, (state, action) => {
        state.loading = false;
        state.wishList = action.payload;
      })
      .addCase(getWishlistItem.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

     
      .addCase(addToWishlist.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addToWishlist.fulfilled, (state, action) => {
        state.loading = false;
        // payload is the full wishlist array, not one item — replace, don't push
        state.wishList = action.payload;
      })
      .addCase(addToWishlist.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

    
      .addCase(removeToWishlist.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(removeToWishlist.fulfilled, (state, action) => {
        state.loading = false;
        // payload is the full wishlist array — the old filter compared product objects to an id and removed nothing
        state.wishList = action.payload;
      })
      .addCase(removeToWishlist.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

     
      .addCase(clearWishlist.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(clearWishlist.fulfilled, (state, action) => {
        state.loading = false;
        state.wishList = action.payload;
      })
      .addCase(clearWishlist.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Why: without this, the next user on the same tab saw the old wishlist and its count.
      .addCase(logout.fulfilled, () => ({ wishList: [], loading: false, error: null }))
      .addCase(logout.rejected, () => ({ wishList: [], loading: false, error: null }));
  },
});

// `reducers: {}` is empty, so this was always undefined; nothing imports it. Use the clearWishlist thunk.
// export const { clearWishList } = wishListSlice.actions;
export default wishListSlice.reducer;
