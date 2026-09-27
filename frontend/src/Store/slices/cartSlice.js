import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../api/client";
// No cycle: authSlice imports only the api client, not this slice.
import { logout } from "./authSlice";

export const addCartItem = createAsyncThunk(
  "cart/addCartItem",
  async (cartData, { rejectWithValue }) => {
    try {
      const res = await api.post("/cart/add", cartData);
      return res.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to add to cart");
    }
  }
);

// itemId = the cart line _id. Why not the product id: with choices (Size M / Size L) one product
// can be two lines, and only the line id says which one to change.
export const deleteCartItem = createAsyncThunk(
  "cart/deleteCartItem",
  async (itemId, { rejectWithValue }) => {
    try {
      // POST — matches the backend route (not DELETE)
      const res = await api.post(`/cart/delete/${itemId}`);
      return res.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to delete cart item");
    }
  }
);


export const updateCartItem = createAsyncThunk(
  "cart/updateCartItem",
  async ({ itemId, quantity }, { rejectWithValue }) => {
    try {
      const res = await api.put(`/cart/update/${itemId}`, { quantity });
      return res.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to update cart item");
    }
  }
);


export const getCartItems = createAsyncThunk(
  "cart/getCartItems",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get("/cart/");
      return res.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to fetch cart items");
    }
  }
);


export const clearCart = createAsyncThunk(
  "cart/clearCart",
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.post("/cart/clear", {});
      return res.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to clear cart");
    }
  }
);


const initialState = {
  items: [],
  // Why: the server computes all cart money now; the UI only shows these, never recalculates.
  subtotal: 0,
  discount: 0,
  total: 0,
  // Delivery: fee and items+fee, both from the server (backend/src/config/shipping.js).
  shippingFee: 0,
  grandTotal: 0,
  freeShippingFrom: 0,
  loading: false,
  error: null,
};

// Why: every cart endpoint returns the same shape, so one setter keeps all five thunks in sync.
const applyCart = (state, payload) => {
  state.loading = false;
  state.items = payload?.items ?? [];
  state.subtotal = payload?.subtotal ?? 0;
  state.discount = payload?.discount ?? 0;
  state.total = payload?.total ?? 0;
  state.shippingFee = payload?.shippingFee ?? 0;
  // Older responses have no grandTotal; the items total is then the best we know.
  state.grandTotal = payload?.grandTotal ?? state.total;
  state.freeShippingFrom = payload?.freeShippingFrom ?? 0;
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  extraReducers: (builder) => {
    builder


      .addCase(addCartItem.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(addCartItem.fulfilled, (state, action) => {
        // state.loading = false;
        // state.items = action.payload.items;
        // state.total = action.payload.total;
        applyCart(state, action.payload);
      })
      .addCase(addCartItem.rejected, (state, action) => {
        state.loading = false;

        state.error = action.payload;
      })
      .addCase(deleteCartItem.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(deleteCartItem.fulfilled, (state, action) => {
        // state.loading = false;
        // state.items = action.payload.items;
        // state.total = action.payload.total;
        applyCart(state, action.payload);
      })
      .addCase(deleteCartItem.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateCartItem.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateCartItem.fulfilled, (state, action) => {
        // state.loading = false;
        // state.items = action.payload.items;
        // state.total = action.payload.total;
        applyCart(state, action.payload);
      })
      .addCase(updateCartItem.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(getCartItems.pending, (state) => {
        state.loading = true;
        state.error = null;
      })


      .addCase(getCartItems.fulfilled, (state, action) => {
        // state.loading = false;
        // state.items = action.payload.items;
        // state.total = action.payload.total
        applyCart(state, action.payload);
  })

      .addCase(getCartItems.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Why: on a failed load, a previous user's items (and navbar count) must not linger.
        state.items = [];
        state.subtotal = 0;
        state.discount = 0;
        state.total = 0;
        state.shippingFee = 0;
        state.grandTotal = 0;
      })
      .addCase(clearCart.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(clearCart.fulfilled, (state, action) => {
        // state.loading = false;
        // state.items = [];
        // state.total = 0;
        applyCart(state, action.payload);
      })
      .addCase(clearCart.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Why: without this, the next user on the same tab saw the old cart and its count.
      // The logout thunk swallows its own errors, so it always fulfills; rejected is kept to be safe.
      .addCase(logout.fulfilled, () => initialState)
      .addCase(logout.rejected, () => initialState);
  },
});

export default cartSlice.reducer;
