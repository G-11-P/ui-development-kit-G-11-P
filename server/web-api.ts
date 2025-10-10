/**
 * Enhanced test server for the UI Development Kit web version
 * Implements a simplified authentication flow with server-side credentials
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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

interface OAuthState {
  redirectUrl: string;
  clientSessionId?: string;
}


// Request augmentation for session ID
declare module 'express-serve-static-core' {
  interface Request {
    sessionId?: string;
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


// Add session ID middleware
app.use((req, res, next) => {
  // Get session ID from header (sent by Angular app)
  const sessionId = req.headers['x-session-id'] as string;
  if (sessionId) {
    req.sessionId = sessionId;
  }
  next();
});


const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per minute
  message: { error: 'Too many request attempts. Please try again later.' },
  // In Lambda/API Gateway, trust the proxy and validate properly
  validate: process.env.AWS_LAMBDA_FUNCTION_NAME ? {
    trustProxy: false,
    xForwardedForHeader: false
  } : undefined
});

// CSRF middleware
const csrfProtection = async (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET requests and OAuth callback
  if (req.method === 'GET' || req.path === '/api/oauth/callback') {
    return next();
  }

  if (!req.sessionId) {
    return res.status(403).json({ error: 'No session ID found. Please refresh and try again.' });
  }

  const csrfSecret = await storage.getCsrfSecret(req.sessionId);
  if (!csrfSecret) {
    return res.status(403).json({ error: 'No CSRF token available. Please refresh and try again.' });
  }

  const token = req.headers['x-csrf-token'] as string || req.body._csrf;
  if (!token || !tokens.verify(csrfSecret, token)) {
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
  // OAuth client ID and Secret (registered with SailPoint)
  clientId: process.env.CLIENT_ID || '',
  clientSecret: process.env.CLIENT_SECRET || '',
  // Redirect URI registered with the client
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/api/oauth/callback',
  // OAuth scopes to request
  scopes: process.env.OAUTH_SCOPES || 'sp:scopes:all'
};

// Initialize storage
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

// authentication endpoint
app.post('/api/auth/web-login', rateLimiter, csrfProtection, async (req: Request, res: Response) => {
  if (!req.sessionId) {
    return res.status(400).json({ error: 'No session ID found' });
  }

  // Generate and store state parameter
  const stateData: OAuthState = {
    redirectUrl: '/home',
    clientSessionId: req.sessionId
  };

  const state = generateStateParam(stateData);
  await storage.setOAuthState(state, stateData, 10);

  // Build the OAuth URL using the SailPoint login domain
  const loginBaseUrl = buildSailPointUrl(SERVER_CONFIG.tenantUrl, 'login');
  const authUrl = `${loginBaseUrl}/oauth/authorize?client_id=${SERVER_CONFIG.clientId}&response_type=code&redirect_uri=${encodeURIComponent(SERVER_CONFIG.redirectUri)}&scope=${encodeURIComponent(SERVER_CONFIG.scopes)}&state=${encodeURIComponent(state)}`;

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

  // Validate state parameter from storage
  let stateData: OAuthState | null = null;
  if (state) {
    stateData = await storage.getOAuthState(state as string);
  }

  if (!state || !stateData) {
    console.error('Invalid or missing OAuth state');
    const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:4200';
    return res.redirect(`${websiteUrl}/home?error=invalid_state`);
  }


  try {

    const apiBaseUrl = buildSailPointUrl(SERVER_CONFIG.tenantUrl, 'api');
    const tokenEndpoint = `${apiBaseUrl}/oauth/token`;

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

    // Store token data using client session ID from OAuth state
    if (stateData.clientSessionId) {
      await storage.setTokenData(stateData.clientSessionId, tokenData);
    }

    // Parse JWT to get user info
    const decodedToken = parseJWT(access_token);
    const username = decodedToken.user_name || 'User';

    // Store session auth
    if (stateData.clientSessionId) {
      await storage.setSessionAuth(stateData.clientSessionId, {
        isAuthenticated: true,
        username: username
      });
    }



    // Clear OAuth state from storage
    if (state) {
      await storage.deleteOAuthState(state as string);
    }

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
  let isAuthenticated = false;
  let username: string | undefined;

  if (req.sessionId) {
    const authData = await storage.getSessionAuth(req.sessionId);
    if (authData) {
      isAuthenticated = authData.isAuthenticated;
      username = authData.username;
    }
  }

  // Return current authentication status
  res.json({
    isLoggedIn: isAuthenticated,
    username: username
  });
});

// Check access token status and auto-refresh if needed
app.get('/api/auth/status/access/', rateLimiter, async (req: Request, res: Response) => {
  let isAuthenticated = false;

  if (req.sessionId) {
    const authData = await storage.getSessionAuth(req.sessionId);
    if (authData) {
      isAuthenticated = authData.isAuthenticated;
    }
  }

  if (!isAuthenticated) {
    return res.json({
      authtype: 'oauth' as const,
      accessTokenIsValid: false,
      needsRefresh: false
    });
  }

  // Get token data from storage
  if (!tokenData && req.sessionId) {
    tokenData = await storage.getTokenData(req.sessionId);
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

      // Update storage
      if (req.sessionId) {
        await storage.setTokenData(req.sessionId, tokenData);
      }

      // Parse JWT to update user info if needed
      const decodedToken = parseJWT(access_token);
      const username = decodedToken.user_name || 'User';

      // Update session auth with new username
      if (req.sessionId) {
        await storage.setSessionAuth(req.sessionId, {
          isAuthenticated: true,
          username: username
        });
      }

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
  // Clear token data, CSRF secret, and session auth from memory and storage
  tokenData = null;
  if (req.sessionId) {
    await storage.deleteTokenData(req.sessionId);
    await storage.deleteCsrfSecret(req.sessionId);
    await storage.deleteSessionAuth(req.sessionId);
  }

  res.json({ success: true });
});

// CSRF token endpoint
app.get('/api/auth/csrf-token', rateLimiter, async (req: Request, res: Response) => {
  if (!req.sessionId) {
    return res.status(400).json({ error: 'No session ID found' });
  }

  // Get or create CSRF secret
  let csrfSecret = await storage.getCsrfSecret(req.sessionId);

  if (!csrfSecret) {
    csrfSecret = tokens.secretSync();
    await storage.setCsrfSecret(req.sessionId, csrfSecret);
  }

  // Generate CSRF token
  const csrfToken = tokens.create(csrfSecret);
  res.json({ csrfToken });
});

// SDK API proxy endpoint
app.post('/api/sdk/:methodName', rateLimiter, csrfProtection, async (req: Request, res: Response) => {
  const { methodName } = req.params;
  const { args } = req.body;

  // Check if user is authenticated
  let isAuthenticated = false;

  if (req.sessionId) {
    const authData = await storage.getSessionAuth(req.sessionId);
    if (authData) {
      isAuthenticated = authData.isAuthenticated;
    }
  }

  if (!isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Get token data from storage
  let currentTokenData = tokenData;
  if (!currentTokenData && req.sessionId) {
    currentTokenData = await storage.getTokenData(req.sessionId);
    if (currentTokenData) {
      tokenData = currentTokenData; // Update global for local development
    }
  }

  if (!currentTokenData) {
    return res.status(401).json({ error: 'No token data found' });
  }

  const now = new Date();
  if (currentTokenData.accessExpiry <= now) {
    return res.status(401).json({ error: 'Access token expired' });
  }

  try {
    const { executeSdkMethod } = require('./sailpoint-sdk-web');

    // Build API base path
    let basePath = '';
    try {
      basePath = buildSailPointUrl(SERVER_CONFIG.tenantUrl, 'api');
    } catch (error) {
      console.error('Failed to construct API base path:', error);
    }

    // Execute the SDK method
    const result = await executeSdkMethod(
      methodName,
      args || {},
      currentTokenData.accessToken,
      basePath
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'SDK method execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Config endpoint
app.get('/api/config', rateLimiter, (req: Request, res: Response) => {
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
  })
};