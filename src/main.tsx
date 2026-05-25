/**
 * F-11 — React entry point (boots the three-workspace router).
 *
 * Wires UI5 Web Components React. Routes are owned by F-11 (/customer),
 * F-12 (/admin), F-13 (/internal). The router renders all three so the
 * three-workspace separation invariant (HAPPY-6) can be smoke-tested by
 * mounting each route and asserting DOM exclusivity.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
