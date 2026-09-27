import React, { useEffect, useState } from 'react'
import ProductDetail from './../components/ProductDetails/ProductDetails'
import Path from './../components/Path/Path'
import ProductInfoTabs from './../components/ProductInfoTabs/ProductInforTabs'
// "You may like" removed on request (it was hardcoded demo data).
// import RecommendationList from './../components/RecommendationList/RecommendationList'
import RelatedProducts from './../components/RelatedProducts/RelatedProducts'
// Made-up promo the store does not run (BUG-66).
// import DiscountBanner from './../components/DiscountBanner/DiscountBanner'
import NavBar from '../components/Header/NavBar'
// import TopNav from '../components/Header/TopNav'
import Footer from '../components/Footer/Footer'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import './productDetailsPage.css'
import api from '../api/client'
import { addRecent } from '../utils/recentlyViewed'

const ProductDetailsPage = () => {

  const { id } = useParams();
  const { products } = useSelector((state) => state.products);
  const [product, setProduct] = useState({});
  const [status, setStatus] = useState('loading'); // loading | ready | notfound

  useEffect(() => {
    let alive = true;
    // Show the list copy at once if we have it, but always fetch by id: only that response has
    // reviewer names, and direct links / refresh have no list at all (BUG-70).
    const found = products.find((p) => p._id === id);
    if (found) { setProduct(found); setStatus('ready'); } else { setProduct({}); setStatus('loading'); }
    api.get(`/product/${id}`)
      .then((res) => {
        if (!alive) return;
        // if (res.data?.data) { setProduct(res.data.data); setStatus('ready'); } else setStatus('notfound');
        // addRecent: feeds "Recently viewed" on the home page. Only after a real load, so bad ids are never saved.
        if (res.data?.data) { setProduct(res.data.data); setStatus('ready'); addRecent(id); } else setStatus('notfound');
      })
      .catch(() => { if (alive && !found) setStatus('notfound'); });
    // Stops a slow reply for an old id from overwriting the product now on screen.
    return () => { alive = false; };
  }, [id]); // not `products`: the list refetching must not re-trigger this page's fetch

  // The central <PageTitle/> only sets a generic "Product" title on pathname change; this runs
  // after the product loads, so the real name wins.
  useEffect(() => {
    if (product?.name) document.title = `${product.name} | Shopzinc`;
  }, [product?.name]);

   
  return (
    <div>
     
      {status === 'loading' && <div className="pd-state container">Loading product…</div>}
      {status === 'notfound' && (
        <div className="pd-state container">
          <h2>Product not found</h2>
          <p>It may have been removed. <Link to="/filter">Browse all products</Link></p>
        </div>
      )}
      {status === 'ready' && (
        <>
          <Path items={[
            { label: 'Home', href: '/' },
            ...(product.category?.name ? [{ label: product.category.name, href: `/filter?category=${product.category._id}` }] : [{ label: 'Products', href: '/filter' }]),
            { label: product.name },
          ]} />
          <ProductDetail product ={product}/>
          <div className="pd-extra container">
             {/* <ProductInfoTabs product={product}/> */}
             {/* After a review is saved/deleted, the server sends the fresh ratings + average; putting them
                 on the product updates the stars at the top of the page too, without a reload. */}
             <ProductInfoTabs
               product={product}
               onReviewsChange={(data) => setProduct((p) => ({ ...p, ratings: data.ratings, averageRating: data.averageRating }))}
             />
             {/* <RecommendationList/> */}
          </div>
          <RelatedProducts product={product}/>
        </>
      )}
      {/* <DiscountBanner/> */}
      
    </div>
  )
}

export default ProductDetailsPage
