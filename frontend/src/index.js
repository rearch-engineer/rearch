import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssVarsProvider } from '@mui/joy/styles';
import InitColorSchemeScript from '@mui/joy/InitColorSchemeScript';
import CssBaseline from '@mui/joy/CssBaseline';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // React.StrictMode temporarily disabled to prevent double requests in dev
  <>
    <InitColorSchemeScript defaultMode="system" />
    <CssVarsProvider defaultMode="system">
      <CssBaseline />
      <App />
    </CssVarsProvider>
  </>
);
