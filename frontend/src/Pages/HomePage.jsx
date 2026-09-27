import React, { useEffect, useState } from 'react'
import api from '../api/client'


// Hardcoded demo images for the old static sections — the sections now come from the API.
// import sofa from './../assets/Image/interior/1.png'
// import plant from './../assets/Image/interior/4.png'
// import kitchenDish from './../assets/Image/interior/5.png'
// import lamp from './../assets/Image/interior/6.png'
// import homeAppliance from './../assets/Image/interior/7.png'
// import blender from './../assets/Image/interior/8.png'
// import kitchenMixer from './../assets/Image/interior/9.png'
// import bowl from './../assets/Image/interior/3.png'
// import infoPic from './../assets/Image/interior/12.jpg'
// import techInfo from './../assets/Image/interior/13.jpg'


// import smartphone from './../assets/Image/tech/1.png'
// import cameras from './../assets/Image/tech/6.png'
// import laptops from './../assets/Image/tech/7.png'
// import smartwatch from './../assets/Image/tech/8.png'
// import smartTablet from './../assets/Image/tech/2.png'
// import headPhone from './../assets/Image/tech/9.png'
// import GamingSet from './../assets/Image/tech/5.png'
// import smartkattle from './../assets/Image/interior/10.png'


// Fake B2B blocks (lorem ipsum, made-up suppliers, sourcing services) — not what this store does (BUG-66).
// import RequestQuote from './../components/RequestQuote/RequestQuote'
import RecommendedItems from './../components/RecommendedItems/RecommendedItems'
// import ExtraServices from './../components/Extra Services/ExtraServices'
// import SuppliersList from './../components/Supplier List/SupplierList'
// Hidden on home (fake newsletter, no backend) — still used on the filter page.
// import JoinUs from './../components/JoinUs/JoinUs'
// Replaced by HeroCarousel (dynamic slides from home categories + the top deal).
// import CategoryBanner from './../components/CategoryBanner/CategoryBanner'
import HeroCarousel from './../components/HeroCarousel/HeroCarousel'

import DealsOffer from './../components/DealsOffer/DealsOffer'
// Sections built only from real store data; each hides itself when it has nothing to show.
import CartReminder from './../components/HomeExtras/CartReminder'
import ShopByCategory from './../components/HomeExtras/ShopByCategory'
import NewArrivals from './../components/HomeExtras/NewArrivals'
import RecentlyViewed from './../components/HomeExtras/RecentlyViewed'
import ShopByBrand from './../components/HomeExtras/ShopByBrand'
// Store facts strip removed from home on request; still shown on the cart page.
// import FeatureSection from './../components/FeatureSection/FeatureSection'
import HomeOutdoor from './../components/HomeOutdoor/HomeOutdoor'
import NavBar from '../components/Header/NavBar'
// import TopNav from '../components/Header/TopNav'
import Footer from '../components/Footer/Footer'
const HomePage = () => {

    // Home sections are driven by categories the admin marked showOnHome (already sorted by homeOrder).
    const [homeCategories, setHomeCategories] = useState([])

    useEffect(() => {
        api.get('/category', { params: { home: 1 } })
            // getAllCategories returns a bare array, no {data} wrapper.
            .then((res) => setHomeCategories(Array.isArray(res.data) ? res.data : []))
            .catch((error) => console.error(error))
    }, [])


    // const Homeproducts = [
    //     { id: 1, name: "Soft chairs", price: "USD 19", img: sofa },
    //     { id: 2, name: "Sofa & chair", price: "USD 19", img: lamp},
    //     { id: 3, name: "Kitchen dishes", price: "USD 19", img:kitchenDish },
    //     { id: 4, name: "Smart watches", price: "USD 19", img: bowl},
    //     { id: 5, name: "Kitchen mixer", price: "USD 100", img: kitchenMixer },
    //     { id: 6, name: "Blenders", price: "USD 39", img: blender },
    //     { id: 7, name: "Home appliance", price: "USD 19", img: homeAppliance},
    //     { id: 8, name: "Coffee maker", price: "USD 10", img:plant},
    //   ];


    //   const Techproducts =
    //   [
    //     { id: 1, name: "Smart watches", price: "USD 19", img: smartwatch },
    //     { id: 2, name: "Cameras", price: "USD 89", img: cameras},
    //     { id: 3, name: "Headphones", price: "USD 10", img:headPhone },
    //     { id: 4, name: "Electric kattle", price: "USD 90", img: smartkattle},
    //     { id: 5, name: "Gaming set", price: "USD 35", img: GamingSet },
    //     { id: 6, name: "Laptops & PC", price: "USD 340", img: laptops },
    //     { id: 7, name: "Smartphones", price: "USD 19", img: smartTablet},
    //     { id: 8, name: "mobiles", price: "USD 240", img:smartphone},
    //   ];

    //  const  homeCover={
    //         image:infoPic,
    //         title:"Home and Outdoor"
    //   }
    // const  techCover ={
    //      image:techInfo,
    //     title:"Consumer Electronics and gedgets"
    // }

  return (
    <div>


     {/* <CategoryBanner/> */}
     <HeroCarousel/>
     <CartReminder/>
     <ShopByCategory/>
     <DealsOffer/>
     <NewArrivals/>
     {/* <HomeOutdoor products={Homeproducts} info ={homeCover}/> */}
     {/* <HomeOutdoor products={Techproducts} info ={techCover}/> */}
     {homeCategories.map((c) => <HomeOutdoor category={c} key={c._id}/>)}
     {/* One gap here instead of per-component margins, so the lower sections space evenly */}
     {/* home-stack: lets the new sections drop their own top margin inside this gap */}
     <div className="home-stack" style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '24px' }}>
       {/* Hidden: fake content, see the imports above (BUG-66). */}
       {/* <RequestQuote/> */}
       <RecommendedItems/>
       <RecentlyViewed/>
       <ShopByBrand/>
       {/* <ExtraServices/> */}
       {/* <SuppliersList/> */}
       {/* <JoinUs/> */}
       {/* <FeatureSection/> */}
     </div>

    </div>
  )
}

export default HomePage
