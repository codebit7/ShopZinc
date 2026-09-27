import React from 'react'
import ShoppingCart from './../components/ShoppingCart/ShoppingCart'
import SavedForLater from './../components/SavedForLater/SavedForLater'
import FeatureSection from './../components/FeatureSection/FeatureSection'
// Made-up promo ("Super discount on more than Rs 25,000") that the store does not run (BUG-66).
// import DiscountBanner from './../components/DiscountBanner/DiscountBanner'
const CartPage = () => {
  return (
    <div >
      
      <ShoppingCart/>
      <FeatureSection/>
      <SavedForLater/>
      {/* <DiscountBanner/> */}
      
    </div>
  )
}

export default CartPage
