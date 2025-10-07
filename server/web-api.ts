/**
 * Enhanced test server for the UI Development Kit web version
 * Implements a simplified authentication flow with server-side credentials
 */
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Tokens = require("csrf")
import rateLimit from 'express-rate-limit';
import { createStorage } from './session-storage';

// Load environment variables from .env file
dotenv.config();

// Type definitions
interface TokenData {
  accessToken: string;
  accessExpiry: Date;
  refreshToken?: string;
  refreshExpiry?: Date;
}

interface TokenDetails {
  tenant_id: string;
  pod: string;
  org: string;
  identity_id: string;
  user_name: string;
  strong_auth: boolean;
  authorities: string[];
  client_id: string;
  strong_auth_supported: boolean;
  scope: string[];
  exp: number;
  jti: string;
  expiry: Date;
}

interface OAuthState {
  redirectUrl: string;
}

// Session augmentation
declare module 'express-session' {
  interface SessionData {
    isAuthenticated: boolean;
    username: string;
    oauthState?: string;
    oauthStateData?: OAuthState;
    csrfSecret?: string;
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy when running in Lambda/API Gateway
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.set('trust proxy', true);

  // Strip stage name from paths in Lambda environment
  app.use((req, res, next) => {
    // Remove stage name (like /prod, /dev, /stage) from the beginning of the path
    req.url = req.url.replace(/^\/[^\/]+/, '');
    // Ensure we don't end up with an empty path
    if (!req.url || req.url === '') {
      req.url = '/';
    }
    next();
  });
}

// Initialize CSRF tokens
const tokens = new Tokens();

// Configure session storage
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Middleware
app.use(cors({
  origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());


const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per minute
  message: { error: 'Too many request attempts. Please try again later.' },
  // In Lambda/API Gateway, trust the proxy and validate properly
  validate: process.env.AWS_LAMBDA_FUNCTION_NAME ? {
    trustProxy: false, // Disable the trust proxy validation in Lambda
    xForwardedForHeader: false // Disable X-Forwarded-For validation
  } : undefined
});

// CSRF middleware
const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET requests and OAuth callback
  if (req.method === 'GET' || req.path === '/oauth/callback') {
    return next();
  }

  // Ensure session has CSRF secret
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }

  const token = req.headers['x-csrf-token'] as string || req.body._csrf;
  
  if (!token || !tokens.verify(req.session.csrfSecret, token)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

// Configuration for OAuth - loaded from environment variables
const SERVER_CONFIG = {
  // Your SailPoint tenant URL
  tenantUrl: process.env.TENANT_URL || 'http://localhost:3000',
  // Your SailPoint API URL
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  // OAuth client ID (registered with SailPoint)
  clientId: process.env.CLIENT_ID || '',
  // Client secret (should be securely stored in production)
  clientSecret: process.env.CLIENT_SECRET || '',
  // Redirect URI registered with the client
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  // OAuth scopes to request
  scopes: process.env.OAUTH_SCOPES || 'sp:scopes:all'
};

// Initialize storage (DynamoDB for Lambda, memory for local)
const storage = createStorage();

// In-memory token storage for session-based approach
let tokenData: TokenData | null = null;


// Helper functions
function generateStateParam(data: OAuthState): string {
  const stateObj = JSON.stringify(data);
  const randomBytes = crypto.randomBytes(16).toString('hex');
  return Buffer.from(`${randomBytes}:${stateObj}`).toString('base64');
}


function parseJWT(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString());
  } catch (error) {
    console.error('Failed to parse JWT token:', error);
    return {};
  }
}

// Simplified authentication endpoint
app.post('/api/auth/web-login', rateLimiter, csrfProtection, async (req: Request, res: Response) => {
  console.log('POST /api/auth/web-login called');
  
  // Generate and store state parameter
  const stateData: OAuthState = {
    redirectUrl: '/home'
  };

  const state = generateStateParam(stateData);
  req.session.oauthState = state;
  req.session.oauthStateData = stateData;

  // Also store in persistent storage for Lambda
  await storage.setOAuthState(state, stateData, 10);
  
  // Extract tenant name from the tenant URL
  // Expected format: https://beta-15156.identitynow-demo.com/
  let tenantName = '';
  try {
    // Parse the tenant URL to extract the subdomain
    const tenantUrl = new URL(SERVER_CONFIG.tenantUrl);
    tenantName = tenantUrl.hostname.split('.')[0]; // e.g. "beta-15156"
    console.log('Extracted tenant name:', tenantName);
  } catch (error) {
    console.error('Failed to parse tenant URL:', error);
  }

  // Build the OAuth URL using the SailPoint login domain format
  const authUrl = `https://${tenantName}.login.identitynow-demo.com/oauth/authorize?client_id=${SERVER_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(SERVER_CONFIG.redirectUri)}&scope=${encodeURIComponent(SERVER_CONFIG.scopes)}&state=${encodeURIComponent(state)}`;
  
  console.log('Generated auth URL:', authUrl);
  
  res.json({ 
    success: true, 
    authUrl
  });
});

// OAuth callback handler
app.get('/oauth/callback', rateLimiter, async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  
  // Check if error was returned
  if (error) {
    console.error('OAuth error:', error);
    return res.redirect('/home?error=oauth_error&message=' + encodeURIComponent(String(error)));
  }
  
  // Validate state parameter (check both session and persistent storage)
  let stateData: OAuthState | null = null;

  if (state && req.session.oauthState === state && req.session.oauthStateData) {
    // Use session data if available (local development)
    stateData = req.session.oauthStateData;
  } else if (state) {
    // Fall back to persistent storage (Lambda)
    stateData = await storage.getOAuthState(state as string);
  }

  if (!state || !stateData) {
    console.error('Invalid or missing OAuth state');
    return res.redirect('/home?error=invalid_state');
  }
  
  try {
    // Exchange code for token
    // In a production environment, you would use your client secret here
    // For this example, we're using a mock response
    
    try {
      // Attempt to make a real token exchange
      // Extract tenant name for token endpoint
      let tenantName = '';
      try {
        const tenantUrl = new URL(SERVER_CONFIG.tenantUrl);
        tenantName = tenantUrl.hostname.split('.')[0]; 
      } catch (error) {
        console.error('Failed to parse tenant URL for token exchange:', error);
        
      }
      
      // Use the SailPoint token endpoint format with proper headers
      console.log('Attempting token exchange with SailPoint');
      const tokenEndpoint = `https://${tenantName}.api.identitynow-demo.com/oauth/token`;
      console.log('Token endpoint:', tokenEndpoint);
      
      // Using form-urlencoded format as required by OAuth2 spec
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('client_id', SERVER_CONFIG.clientId);
      params.append('client_secret', SERVER_CONFIG.clientSecret);
      params.append('code', code!.toString());
      params.append('redirect_uri', SERVER_CONFIG.redirectUri);
      
      const tokenResponse = await axios.post(tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Store token information
      tokenData = {
        accessToken: access_token,
        accessExpiry: new Date(Date.now() + expires_in * 1000),
        refreshToken: refresh_token,
        refreshExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };

      // Store in persistent storage for Lambda
      if (req.sessionID) {
        await storage.setTokenData(req.sessionID, tokenData);
      }
      
      // Parse JWT to get user info
      const decodedToken = parseJWT(access_token);
      const username = decodedToken.user_name || 'User';
      
      // Update session
      req.session.isAuthenticated = true;
      req.session.username = username;
      
    } catch (tokenError) {
      console.error('Error exchanging code for token, using mock data:', tokenError);
      
      // For development/testing, create mock token data
      tokenData = {
        accessToken: 'mock-access-token-' + Date.now(),
        accessExpiry: new Date(Date.now() + 3600 * 1000), // 1 hour
        refreshToken: 'mock-refresh-token-' + Date.now(),
        refreshExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      };

      // Store in persistent storage for Lambda
      if (req.sessionID) {
        await storage.setTokenData(req.sessionID, tokenData);
      }
      
      // Use mock session data
      req.session.isAuthenticated = true;
      req.session.username = 'Test User';
    }
    
    // Clear OAuth state from both session and persistent storage
    delete req.session.oauthState;
    delete req.session.oauthStateData;
    if (state) {
      await storage.deleteOAuthState(state as string);
    }
    
    // Redirect to success URL
    console.log('Authentication successful, redirecting to Angular app');
    
    // Use a full URL to the Angular app instead of a relative path
    return res.redirect('http://localhost:4200/home?success=true');
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    return res.redirect('/home?error=callback_error');
  }
});

// Check login status
app.get('/api/auth/login-status', rateLimiter, (req: Request, res: Response) => {
  console.log('GET /api/auth/login-status called');
  
  // Return current authentication status from session
  res.json({
    isLoggedIn: req.session.isAuthenticated === true,
    username: req.session.username
  });
});

// Check access token status and auto-refresh if needed
app.get('/api/auth/status/access/', rateLimiter, async (req: Request, res: Response) => {
  console.log('GET /api/auth/status/access/ called');
  
  // Check if user is authenticated and has token data
  if (!req.session.isAuthenticated) {
    return res.json({
      authtype: 'oauth' as const,
      accessTokenIsValid: false,
      needsRefresh: false
    });
  }

  // Try to get token data from memory first, then persistent storage
  if (!tokenData && req.sessionID) {
    tokenData = await storage.getTokenData(req.sessionID);
  }

  if (!tokenData) {
    return res.json({
      authtype: 'oauth' as const,
      accessTokenIsValid: false,
      needsRefresh: false
    });
  }
  
  // Check if access token is still valid
  const now = new Date();
  let accessTokenIsValid = tokenData.accessExpiry > now;
  const canRefresh = tokenData.refreshToken && tokenData.refreshExpiry && tokenData.refreshExpiry > now;
  
  // If token is expired but we can refresh, attempt to refresh it
  if (!accessTokenIsValid && canRefresh) {
    console.log('Access token expired, attempting to refresh...');
    
    try {
      // Extract tenant name for token endpoint
      let tenantName = '';
      try {
        const tenantUrl = new URL(SERVER_CONFIG.tenantUrl);
        tenantName = tenantUrl.hostname.split('.')[0]; 
      } catch (error) {
        console.error('Failed to parse tenant URL for token refresh:', error);
      }
      
      if (tenantName) {
        // Use the SailPoint token refresh endpoint
        const tokenEndpoint = `https://${tenantName}.api.identitynow-demo.com/oauth/token`;
        
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', SERVER_CONFIG.clientId);
        params.append('client_secret', SERVER_CONFIG.clientSecret);
        params.append('refresh_token', tokenData.refreshToken!);
        
        const refreshResponse = await axios.post(tokenEndpoint, params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        
        const { access_token, refresh_token, expires_in } = refreshResponse.data;
        
        // Update token data with new tokens
        tokenData = {
          accessToken: access_token,
          accessExpiry: new Date(Date.now() + expires_in * 1000),
          refreshToken: refresh_token || tokenData.refreshToken, // Use new refresh token if provided, otherwise keep existing
          refreshExpiry: tokenData.refreshExpiry // Keep existing refresh token expiry
        };

        // Update persistent storage
        if (req.sessionID) {
          await storage.setTokenData(req.sessionID, tokenData);
        }
        
        // Parse JWT to update user info if needed
        const decodedToken = parseJWT(access_token);
        const username = decodedToken.user_name || req.session.username || 'User';
        req.session.username = username;
        
        accessTokenIsValid = true;
        console.log('Token refreshed successfully');
      }
    } catch (refreshError) {
      console.error('Failed to refresh token:', refreshError);
      // If refresh fails, the token is still invalid
      accessTokenIsValid = false;
    }
  }
  
  res.json({
    authtype: 'oauth' as const,
    accessTokenIsValid,
    expiry: tokenData.accessExpiry,
    needsRefresh: !accessTokenIsValid && canRefresh
  });
});

// Logout endpoint
app.post('/api/auth/logout', rateLimiter, csrfProtection, async (req: Request, res: Response) => {
  console.log('POST /api/auth/logout called');
  
  // Clear session
  req.session.isAuthenticated = false;
  delete req.session.username;

  // Clear token data from memory and persistent storage
  tokenData = null;
  if (req.sessionID) {
    await storage.deleteTokenData(req.sessionID);
  }
  
  res.json({ success: true });
});

// CSRF token endpoint
app.get('/api/auth/csrf-token', rateLimiter, (req: Request, res: Response) => {
  console.log('GET /api/auth/csrf-token called');
  
  // Ensure session has CSRF secret
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }
  
  // Generate CSRF token
  const csrfToken = tokens.create(req.session.csrfSecret);
  
  res.json({ csrfToken });
});

// SDK API proxy endpoint
app.post('/api/sdk/:methodName', rateLimiter, csrfProtection, async (req: Request, res: Response) => {
  console.log('POST /api/sdk called', req.params);
  const { methodName } = req.params;
  const { args } = req.body;
  
  // Check if user is authenticated
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Try to get token data from memory first, then persistent storage
  if (!tokenData && req.sessionID) {
    tokenData = await storage.getTokenData(req.sessionID);
  }

  if (!tokenData) {
    return res.status(401).json({ error: 'No token data found' });
  }

  // Check if access token is valid
  const now = new Date();
  if (tokenData.accessExpiry <= now) {
    return res.status(401).json({ error: 'Access token expired' });
  }

  try {
    // Import the generated SDK wrapper
    const { executeSdkMethod } = require('./sailpoint-sdk-web');
    
    // Extract tenant name for API base path
    let basePath = '';
    try {
      const tenantUrl = new URL(SERVER_CONFIG.tenantUrl);
      const tenantName = tenantUrl.hostname.split('.')[0];
      basePath = `https://${tenantName}.api.identitynow-demo.com`;
    } catch (error) {
      console.error('Failed to construct API base path:', error);
      return res.status(500).json({ error: 'Failed to determine API base path' });
    }

    // Execute the SDK method
    const result = await executeSdkMethod(
      methodName,
      args || {},
      tokenData.accessToken,
      basePath
    );
    
    // Send the full result (includes data, headers, status, etc.)
    res.json(result);
  } catch (error) {
    console.error('SDK method execution error:', error);
    res.status(500).json({ 
      error: 'SDK method execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Config endpoints
app.get('/api/config', rateLimiter, (req: Request, res: Response) => {
  console.log('GET /api/config called');
  res.json({
    version: '1.0.0',
    settings: {
      theme: 'light',
      autoRefresh: true
    }
  });
});


// Export app for Lambda or other environments
export default app;

// Start server only if running directly (not when imported)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Web API server running on port ${PORT}`);
    console.log(`OAuth client configured for: ${SERVER_CONFIG.tenantUrl}`);
    console.log('Available endpoints:');
    console.log('  POST /api/auth/web-login (CSRF protected)');
    console.log('  GET  /oauth/callback');
    console.log('  GET  /api/auth/login-status');
    console.log('  GET  /api/auth/status/access/');
    console.log('  GET  /api/auth/csrf-token');
  console.log('  POST /api/auth/logout (CSRF protected)');
  console.log('  POST /api/sdk/:methodName (CSRF protected)');
})};