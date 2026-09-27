import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../api/client";
import { getRateLimit } from "../../components/Auth/rateLimit";

const initialState = {
  user: null,
  isAuthenticated: false,
  status: "idle",
  error: null,
  code: null,
  // Flips true once the first /users/me settles, either way. Routing must
  // wait for it or a refresh flashes the login page.
  bootstrapped: false,
  resendMessage: null,
};

export const login = createAsyncThunk(
  "auth/login",
  async (credentials, { rejectWithValue }) => {
    try {
      const res = await api.post("/users/login", credentials);
      return res.data.user;
    } catch (error) {
      // status + retryAfter added so Login can lock its button on a RATE_LIMITED 429;
      // without retryAfter the page cannot know how long to wait.
      return rejectWithValue({
        message: error.response?.data?.message || "Failed to login",
        code: error.response?.data?.code || null,
        status: error.response?.status ?? null,
        retryAfter: getRateLimit(error)?.retryAfter ?? null,
      });
    }
  }
);

export const fetchMe = createAsyncThunk("auth/fetchMe", async (_, { rejectWithValue }) => {
  try {
    // skipAuthRedirect: a fresh visitor with no session must simply resolve
    // as "not logged in", not get navigated by the interceptor.
    const res = await api.get("/users/me", { skipAuthRedirect: true });
    return res.data.user;
  } catch (error) {
    return rejectWithValue(null);
  }
});

export const logout = createAsyncThunk("auth/logout", async () => {
  try {
    await api.post("/users/logout");
  } catch (error) {
    // Clear locally even if the server call fails.
  }
});

export const resendVerification = createAsyncThunk(
  "auth/resendVerification",
  async (email, { rejectWithValue }) => {
    try {
      const res = await api.post("/users/resend-verification", { email });
      return res.data.message;
    } catch (error) {
      // return rejectWithValue(error.response?.data?.message || "Could not resend the email");
      // Payload stays the plain message (the reducer stores it in resendMessage); code and
      // retryAfter ride in action.meta so Login can lock the resend button on a RATE_LIMITED 429.
      return rejectWithValue(error.response?.data?.message || "Could not resend the email", {
        code: error.response?.data?.code || null,
        retryAfter: getRateLimit(error)?.retryAfter ?? null,
      });
    }
  }
);

export const updateMe = createAsyncThunk(
  "auth/updateMe",
  async (data, { rejectWithValue }) => {
    try {
      // Server returns the same user shape as /users/me, so it can replace state.user.
      const res = await api.put("/users/me", data);
      return res.data.user;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not save your changes");
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuthError: (state) => {
      state.error = null;
      state.code = null;
      state.resendMessage = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.code = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = "success";
        state.user = action.payload;
        state.isAuthenticated = true;
        // A completed login means the session question is answered, even if the
        // boot /users/me call has not settled yet — otherwise Protect would sit
        // on its loader over a logged-in user.
        state.bootstrapped = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.message || "Failed to login";
        state.code = action.payload?.code || null;
      })

      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.bootstrapped = true;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.bootstrapped = true;
      })

      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.status = "idle";
        state.error = null;
        state.code = null;
        state.bootstrapped = true;
      })

      // Only fulfilled is handled: ProfilePage shows its own saving/error state per form.
      .addCase(updateMe.fulfilled, (state, action) => {
        state.user = action.payload;
      })

      .addCase(resendVerification.pending, (state) => {
        state.resendMessage = null;
      })
      .addCase(resendVerification.fulfilled, (state, action) => {
        state.resendMessage = action.payload;
      })
      .addCase(resendVerification.rejected, (state, action) => {
        state.resendMessage = action.payload;
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
