import { render } from 'preact'

import { App } from './app.jsx'
import { Provider } from 'react-redux'
import {store} from './Store/storeIndex.js'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx'

render(
    <Provider  store={store}>
      <BrowserRouter>
      {/* <App /> */}
      {/* Catches render crashes so one broken component shows a fallback, not a blank page. */}
      <ErrorBoundary>
      <App />
      </ErrorBoundary>
      </BrowserRouter>
    </Provider>
, document.getElementById('app'))
