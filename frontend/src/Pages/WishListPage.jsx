import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { getWishlistItem } from '../Store/slices/wishList';
import ProductGrid from '../components/ProductGrid/ProductGrid';
import './wishListPage.css'

const WishListPage = () => {

     // slice field is `wishList` (capital L) — reading `wishlist` was always undefined (BUG-50)
     const { wishList: wishlist } = useSelector((state) => state.wishlist);

     const dispatch = useDispatch();

    useEffect(() => {
        dispatch(getWishlistItem())
    }
    , [dispatch])
  return (
    <div className="wishlist-page container">
        <h1 className="wishlist-title">
          Your favorites
          {Array.isArray(wishlist) && wishlist.length > 0 && (
            <span className="wishlist-count">{wishlist.length} items</span>
          )}
        </h1>
        {
            Array.isArray(wishlist) && wishlist.length > 0 ? <ProductGrid products ={wishlist}/>:
            <div className="wishlist-empty">
              <p className="wishlist-empty-title">No items in your wishlist</p>
              <p className="wishlist-empty-text">Tap the heart on any product to save it here.</p>
              <Link to="/filter" className="wishlist-empty-link">Continue shopping</Link>
            </div>
        }

    </div>
  )
}

export default WishListPage
