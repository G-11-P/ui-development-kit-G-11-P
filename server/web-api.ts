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
import { createStorage, SessionAuth } from './session-storage';

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

// Request augmentation for custom session ID
declare module 'express-serve-static-core' {
  interface Request {
    customSessionId?: string;
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
    // Ensure response object has EventEmitter methods for Lambda compatibility
    if (!res.on || typeof res.on !== 'function') {
      const EventEmitter = require('events');
      Object.setPrototypeOf(res, EventEmitter.prototype);
      EventEmitter.call(res);
    }

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

// Middleware (order matters!)
app.use(express.json());
app.use(cookieParser()); // MUST be before custom session middleware

app.use(cors({
  origin: process.env.AWS_LAMBDA_FUNCTION_NAME
    ? true // In Lambda, rely on API Gateway CORS configuration
    : ['http://localhost:4200', 'http://127.0.0.1:4200'], // Local development
  credentials: true
}));

// Configure session storage
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Important for cross-origin requests
  }
}));

// Add session logging middleware and custom session ID for Lambda
app.use((req, res, next) => {
  console.log(`[SESSION] ${req.method} ${req.path}`);
  console.log(`[SESSION] Express Session ID: ${req.sessionID}`);

  // In Lambda, use a custom session identifier from client headers
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log(`[SESSION] Lambda mode - checking for session ID header`);
    console.log(`[SESSION] x-session-id header:`, req.headers['x-session-id']);

    // Get custom session ID from header (sent by Angular app)
    const customSessionId = req.headers['x-session-id'] as string;
    console.log(`[SESSION] Custom session ID from header: ${customSessionId || 'NOT_FOUND'}`);

    if (customSessionId) {
      console.log(`[SESSION] Using custom session ID from client: ${customSessionId}`);
      req.customSessionId = customSessionId;
    } else {
      console.log(`[SESSION] WARNING: No session ID provided by client`);
    }
  }

  console.log(`[SESSION] Session exists: ${req.session ? 'YES' : 'NO'}`);
  console.log(`[SESSION] Session authenticated: ${req.session?.isAuthenticated || false}`);
  console.log(`[SESSION] CSRF secret in session: ${req.session?.csrfSecret ? 'EXISTS' : 'MISSING'}`);
  console.log(`[SESSION] Custom Session ID: ${req.customSessionId || 'N/A'}`);
  next();
});


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
const csrfProtection = async (req: Request, res: Response, next: NextFunction) => {
  console.log(`[CSRF] Processing ${req.method} ${req.path}`);
  console.log(`[CSRF] Express Session ID: ${req.sessionID}`);
  console.log(`[CSRF] Custom Session ID: ${req.customSessionId}`);
  console.log(`[CSRF] Session data:`, JSON.stringify(req.session, null, 2));

  // Skip CSRF for GET requests and OAuth callback
  if (req.method === 'GET' || req.path === '/api/oauth/callback') {
    console.log(`[CSRF] Skipping CSRF for ${req.method} ${req.path}`);
    return next();
  }

  // In Lambda, use custom session ID; otherwise use express session ID
  const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
  console.log(`[CSRF] Using session ID: ${sessionIdToUse}`);

  // In Lambda, always use persistent storage first, then session as fallback
  let csrfSecret = null;

  if (process.env.AWS_LAMBDA_FUNCTION_NAME && sessionIdToUse) {
    console.log(`[CSRF] Lambda mode: checking persistent storage for session ID: ${sessionIdToUse}`);
    csrfSecret = (await storage.getCsrfSecret(sessionIdToUse)) || undefined;
    console.log(`[CSRF] CSRF secret from storage: ${csrfSecret ? 'EXISTS' : 'MISSING'}`);
  }

  // Fall back to session if not in Lambda or not found in storage
  if (!csrfSecret) {
    csrfSecret = req.session.csrfSecret;
    console.log(`[CSRF] CSRF secret from session: ${csrfSecret ? 'EXISTS' : 'MISSING'}`);
  }

  // Error: no CSRF secret found anywhere
  if (!csrfSecret) {
    console.log(`[CSRF] ERROR: No CSRF secret found - user must call /api/auth/csrf-token first`);
    return res.status(403).json({ error: 'No CSRF token available. Please refresh and try again.' });
  }

  const token = req.headers['x-csrf-token'] as string || req.body._csrf;
  console.log(`[CSRF] Received token: ${token ? 'EXISTS' : 'MISSING'}`);
  console.log(`[CSRF] Token value (first 10 chars): ${token ? token.substring(0, 10) + '...' : 'N/A'}`);

  if (!token || !tokens.verify(csrfSecret, token)) {
    console.log(`[CSRF] Token verification failed`);
    console.log(`[CSRF] Token exists: ${!!token}`);
    console.log(`[CSRF] Secret exists: ${!!csrfSecret}`);
    if (token && csrfSecret) {
      console.log(`[CSRF] Verification result: ${tokens.verify(csrfSecret, token)}`);
    }
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  console.log(`[CSRF] Token verification successful`);
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
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/api/oauth/callback',
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

function buildSailPointUrl(tenantUrl: string, subdomain: 'api' | 'login'): string {
  try {
    const url = new URL(tenantUrl);
    const hostParts = url.hostname.split('.');

    // Insert the subdomain after the first part (tenant name)
    // e.g. "beta-15156.identitynow-demo.com" -> "beta-15156.api.identitynow-demo.com"
    if (hostParts.length >= 2) {
      hostParts.splice(1, 0, subdomain);
      url.hostname = hostParts.join('.');
    }

    return url.toString().replace(/\/$/, ''); // Remove trailing slash
  } catch (error) {
    console.error('Error building SailPoint URL:', error);
    throw new Error(`Failed to build ${subdomain} URL from tenant URL: ${tenantUrl}`);
  }
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

  // Build the OAuth URL using the SailPoint login domain
  const loginBaseUrl = buildSailPointUrl(SERVER_CONFIG.tenantUrl, 'login');
  const authUrl = `${loginBaseUrl}/oauth/authorize?client_id=${SERVER_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(SERVER_CONFIG.redirectUri)}&scope=${encodeURIComponent(SERVER_CONFIG.scopes)}&state=${encodeURIComponent(state)}`;
  
  console.log('Generated auth URL:', authUrl);
  
  res.json({ 
    success: true, 
    authUrl
  });
});

// OAuth callback handler
app.get('/api/oauth/callback', rateLimiter, async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  
  // Check if error was returned
  if (error) {
    console.error('OAuth error:', error);
    const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:4200';
    return res.redirect(`${websiteUrl}/home?error=oauth_error&message=` + encodeURIComponent(String(error)));
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
    const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:4200';
    return res.redirect(`${websiteUrl}/home?error=invalid_state`);
  }
  
  try {
    // Exchange code for token
    // In a production environment, you would use your client secret here
    // For this example, we're using a mock response
    
    try {
      // Attempt to make a real token exchange
      console.log('Attempting token exchange with SailPoint');
      const apiBaseUrl = buildSailPointUrl(SERVER_CONFIG.tenantUrl, 'api');
      const tokenEndpoint = `${apiBaseUrl}/oauth/token`;
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
      const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
      if (sessionIdToUse) {
        await storage.setTokenData(sessionIdToUse, tokenData);
      }

      // Parse JWT to get user info
      const decodedToken = parseJWT(access_token);
      const username = decodedToken.user_name || 'User';

      // Update session
      req.session.isAuthenticated = true;
      req.session.username = username;

      // Store session auth in persistent storage for Lambda (use same sessionIdToUse as token)
      if (sessionIdToUse) {
        await storage.setSessionAuth(sessionIdToUse, {
          isAuthenticated: true,
          username: username
        });
      }
      
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
      const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
      if (sessionIdToUse) {
        await storage.setTokenData(sessionIdToUse, tokenData);
      }

      // Use mock session data
      req.session.isAuthenticated = true;
      req.session.username = 'Test User';

      // Store session auth in persistent storage for Lambda (use same sessionIdToUse as token)
      if (sessionIdToUse) {
        await storage.setSessionAuth(sessionIdToUse, {
          isAuthenticated: true,
          username: 'Test User'
        });
      }
    }
    
    // Clear OAuth state from both session and persistent storage
    delete req.session.oauthState;
    delete req.session.oauthStateData;
    if (state) {
      await storage.deleteOAuthState(state as string);
    }
    
    // Redirect to success URL
    console.log('Authentication successful, redirecting to Angular app');
    
    // Redirect to success URL using the configured website URL
    const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:4200';
    return res.redirect(`${websiteUrl}/home?success=true`);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:4200';
    return res.redirect(`${websiteUrl}/home?error=callback_error`);
  }
});

// Check login status
app.get('/api/auth/login-status', rateLimiter, async (req: Request, res: Response) => {
  console.log('GET /api/auth/login-status called');

  // Check session first, then persistent storage for Lambda
  let isAuthenticated: boolean = req.session.isAuthenticated === true;
  let username: string | undefined = req.session.username;

  // In Lambda, check persistent storage if session is not authenticated
  if (!isAuthenticated && process.env.AWS_LAMBDA_FUNCTION_NAME && req.customSessionId) {
    console.log(`[LOGIN-STATUS] Checking persistent storage for session: ${req.customSessionId}`);
    const authData = await storage.getSessionAuth(req.customSessionId);
    if (authData) {
      console.log(`[LOGIN-STATUS] Found auth data in storage: ${JSON.stringify(authData)}`);
      isAuthenticated = authData.isAuthenticated;
      username = authData.username;

      // Update Express session with persistent data
      req.session.isAuthenticated = authData.isAuthenticated;
      req.session.username = authData.username;
    } else {
      console.log(`[LOGIN-STATUS] No auth data found in storage`);
    }
  }

  console.log(`[LOGIN-STATUS] Final auth state: isAuthenticated=${isAuthenticated}, username=${username}`);

  // Return current authentication status
  res.json({
    isLoggedIn: isAuthenticated,
    username: username
  });
});

// Check access token status and auto-refresh if needed
app.get('/api/auth/status/access/', rateLimiter, async (req: Request, res: Response) => {
  console.log('GET /api/auth/status/access/ called');

  // Check if user is authenticated (session first, then persistent storage for Lambda)
  let isAuthenticated: boolean = req.session.isAuthenticated === true;

  if (!isAuthenticated && process.env.AWS_LAMBDA_FUNCTION_NAME && req.customSessionId) {
    const authData = await storage.getSessionAuth(req.customSessionId);
    if (authData) {
      isAuthenticated = authData.isAuthenticated;
      // Update Express session with persistent data
      req.session.isAuthenticated = authData.isAuthenticated;
      req.session.username = authData.username;
    }
  }

  if (!isAuthenticated) {
    return res.json({
      authtype: 'oauth' as const,
      accessTokenIsValid: false,
      needsRefresh: false
    });
  }

  // Try to get token data from memory first, then persistent storage
  const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
  if (!tokenData && sessionIdToUse) {
    tokenData = await storage.getTokenData(sessionIdToUse);
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
      // Use the SailPoint token refresh endpoint
      const apiBaseUrl = buildSailPointUrl(SERVER_CONFIG.tenantUrl, 'api');
      const tokenEndpoint = `${apiBaseUrl}/oauth/token`;

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
      const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
      if (sessionIdToUse) {
        await storage.setTokenData(sessionIdToUse, tokenData);
      }

      // Parse JWT to update user info if needed
      const decodedToken = parseJWT(access_token);
      const username = decodedToken.user_name || req.session.username || 'User';
      req.session.username = username;

      accessTokenIsValid = true;
      console.log('Token refreshed successfully');
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
  delete req.session.csrfSecret;

  // Clear token data, CSRF secret, and session auth from memory and persistent storage
  tokenData = null;
  const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
  if (sessionIdToUse) {
    await storage.deleteTokenData(sessionIdToUse);
    await storage.deleteCsrfSecret(sessionIdToUse);
    await storage.deleteSessionAuth(sessionIdToUse);
  }

  res.json({ success: true });
});

// CSRF token endpoint
app.get('/api/auth/csrf-token', rateLimiter, async (req: Request, res: Response) => {
  console.log('[CSRF-TOKEN] GET /api/auth/csrf-token called');
  console.log(`[CSRF-TOKEN] Express Session ID: ${req.sessionID}`);
  console.log(`[CSRF-TOKEN] Custom Session ID: ${req.customSessionId}`);
  console.log(`[CSRF-TOKEN] Session data:`, JSON.stringify(req.session, null, 2));

  // In Lambda, use custom session ID; otherwise use express session ID
  const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
  console.log(`[CSRF-TOKEN] Using session ID: ${sessionIdToUse}`);

  // In Lambda, always check persistent storage first, then session as fallback
  let csrfSecret = null;

  if (process.env.AWS_LAMBDA_FUNCTION_NAME && sessionIdToUse) {
    console.log(`[CSRF-TOKEN] Lambda mode: checking persistent storage for session ID: ${sessionIdToUse}`);
    csrfSecret = (await storage.getCsrfSecret(sessionIdToUse)) || undefined;
    console.log(`[CSRF-TOKEN] CSRF secret from storage: ${csrfSecret ? 'EXISTS' : 'MISSING'}`);
  }

  // Fall back to session if not in Lambda or not found in storage
  if (!csrfSecret) {
    csrfSecret = req.session.csrfSecret;
    console.log(`[CSRF-TOKEN] CSRF secret from session: ${csrfSecret ? 'EXISTS' : 'MISSING'}`);
  }

  // Create new secret if none exists
  if (!csrfSecret) {
    console.log(`[CSRF-TOKEN] Creating new CSRF secret`);
    csrfSecret = tokens.secretSync();
    req.session.csrfSecret = csrfSecret;
    console.log(`[CSRF-TOKEN] Stored CSRF secret in session`);

    // Always store in persistent storage for Lambda
    if (sessionIdToUse) {
      console.log(`[CSRF-TOKEN] Storing CSRF secret in persistent storage for session: ${sessionIdToUse}`);
      await storage.setCsrfSecret(sessionIdToUse, csrfSecret);
    }
  }

  // Generate CSRF token
  const csrfToken = tokens.create(csrfSecret);
  console.log(`[CSRF-TOKEN] Generated token (first 10 chars): ${csrfToken.substring(0, 10)}...`);

  res.json({ csrfToken });
});

// SDK API proxy endpoint
app.post('/api/sdk/:methodName', rateLimiter, csrfProtection, async (req: Request, res: Response) => {
  console.log('POST /api/sdk called', req.params);
  const { methodName } = req.params;
  const { args } = req.body;

  // Check if user is authenticated (session first, then persistent storage for Lambda)
  let isAuthenticated: boolean = req.session.isAuthenticated === true;

  if (!isAuthenticated && process.env.AWS_LAMBDA_FUNCTION_NAME && req.customSessionId) {
    const authData = await storage.getSessionAuth(req.customSessionId);
    if (authData) {
      isAuthenticated = authData.isAuthenticated;
      // Update Express session with persistent data
      req.session.isAuthenticated = authData.isAuthenticated;
      req.session.username = authData.username;
    }
  }

  if (!isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Try to get token data from memory first, then persistent storage
  const sessionIdToUse = process.env.AWS_LAMBDA_FUNCTION_NAME ? req.customSessionId : req.sessionID;
  if (!tokenData && sessionIdToUse) {
    tokenData = await storage.getTokenData(sessionIdToUse);
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
    
    // Build API base path using helper function
    let basePath = '';
    try {
      basePath = buildSailPointUrl(SERVER_CONFIG.tenantUrl, 'api');
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
    console.log('  GET  /api/oauth/callback');
    console.log('  GET  /api/auth/login-status');
    console.log('  GET  /api/auth/status/access/');
    console.log('  GET  /api/auth/csrf-token');
  console.log('  POST /api/auth/logout (CSRF protected)');
  console.log('  POST /api/sdk/:methodName (CSRF protected)');
})};