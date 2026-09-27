import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../api/client";



export const fetchProducts = createAsyncThunk(
  "products/fetchProducts",
  // Any extra keys (category, brand, minPrice, sort...) go straight to the server, which filters
  // the whole catalog; filtering one page in the browser was BUG-57.
  async ({ page = 1, limit = 10, ...filters } = {}, { rejectWithValue }) => {
    try {
      const response = await api.get("/products", { params: { page, limit, ...filters } });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to fetch products");
    }
  }
);


// Multer only reads files from a multipart body. Sending the plain form object
// as JSON meant images never arrived and create always failed (BUG-42).
// No Content-Type set by hand: axios adds the multipart boundary itself.
const PRODUCT_FIELDS = ["name", "description", "price", "discount", "category", "brand", "condition", "stock", "isFeatured"];
export const buildProductFormData = (product, existingImages) => {
  const fd = new FormData();
  for (const key of PRODUCT_FIELDS) {
    // Skip empty values: "" would reach mongoose as an empty string, not "unset".
    if (product[key] !== undefined && product[key] !== null && product[key] !== "") fd.append(key, product[key]);
  }
  // The loop above skips "", but an emptied cost price must reach the server to clear it.
  if (product.costPrice === "") fd.append("costPrice", "");
  else if (product.costPrice !== undefined && product.costPrice !== null) fd.append("costPrice", product.costPrice);
  // Choices go as one JSON string: multipart has no arrays of objects. Always sent when present,
  // even [], so removing every choice in edit mode really clears them on the server.
  if (Array.isArray(product.options)) fd.append("options", JSON.stringify(product.options));
  // Only real File objects are uploads; kept server images go in existingImages.
  for (const file of product.images || []) if (file instanceof File) fd.append("images", file);
  if (existingImages) fd.append("existingImages", JSON.stringify(existingImages));
  return fd;
};

export const createProduct = createAsyncThunk('products/createProduct',
  async (product, { rejectWithValue }) => {
    try {
      const response = await api.post("/create", buildProductFormData(product));
        return response.data;
       } catch (error) {
          return rejectWithValue(error.response?.data?.message || "Failed to create product");
     }
   }

)




// existingImages = the {url,imageId} objects the admin kept; without it the
// server can't tell which old images were removed.
export const updateProduct = createAsyncThunk('products/updateProduct',
  async ({id , product, existingImages = []}, { rejectWithValue }) => {
    try {
      // PUT — matches the backend route (not POST)
      const response = await api.put(`/update/${id}`, buildProductFormData(product, existingImages));
        return response.data;
       } catch (error) {
          return rejectWithValue(error.response?.data?.message || "Failed to update product");
     }
   }

)


export const fetchCategories = createAsyncThunk(
  "products/fetchCategories",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get("/category");
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to fetch product");
    }
  }
);



const productSlice = createSlice({
  name: "product",
  initialState: {
    products: [],
    categories:[],
    product: null,
    loading: false,
    // Own flag for the product list: fetchCategories also flips `loading`, and its reply could end
    // the list's loading state early (the empty state flashed before products arrived).
    productsLoading: false,
    // requestId of the newest fetchProducts. Replies can arrive out of order; an older, slower
    // reply (e.g. page 2 of the previous search) must not overwrite the newest one.
    productsRequestId: null,
    error: null,
    totalPage: 1,
    totalProducts: 0,
    filters: {
      category: "All",
      // null = no price filter. [0, 7000] silently hid every product above 7000.
      priceRange: null,
      rating: 0,
      search: "",
      condition: "Any",
      brands: [],
      featured: "Featured",
    },
  },
  reducers: {
    updateFilter:(state, action)=>{
      state.filters[action.payload.key] = action.payload.value;
    }
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state, action) => {
        state.productsRequestId = action.meta.requestId;
        state.productsLoading = true;
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.productsRequestId) return; // stale reply, see productsRequestId
        state.productsLoading = false;
        state.products = Array.isArray(action.payload.data) ? action.payload.data : [];
        state.totalPage = action.payload.totalPage;
        state.totalProducts = action.payload.totalProducts;
        state.loading = false;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        if (action.meta.requestId !== state.productsRequestId) return; // stale reply, see productsRequestId
        state.productsLoading = false;
        state.loading = false;
        state.error = action.payload;
      })



      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.categories = action.payload;
        state.loading = false;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        // state.error = action.payload.message;
        // rejectWithValue sends a plain string, so `.message` was always undefined and the error was lost.
        state.error = action.payload || action.error?.message;
      })
  },
});

export const { updateFilter } = productSlice.actions;
export default productSlice.reducer;
