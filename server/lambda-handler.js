const serverlessExpress = require('@vendia/serverless-express');

// Import the compiled JavaScript version of web-api.ts
// This will be the compiled output from TypeScript
let app;
try {
  // Try to import the compiled JS file first
  app = require('./web-api.js').default || require('./web-api.js');
} catch (error) {
  console.error('Failed to import web-api.js, falling back to TypeScript require');
  // Fallback to TypeScript if available (requires ts-node)
  app = require('./web-api.ts').default || require('./web-api.ts');
}

if (!app) {
  throw new Error('Failed to import Express app from web-api module');
}

// The web-api.ts file exports an Express app that we can wrap for Lambda
// This keeps all the business logic in one place

// Export the Lambda handler
exports.handler = serverlessExpress(app);