const serverlessExpress = require('@vendia/serverless-express');

// Import the compiled JavaScript version from dist directory
const app = require('./dist/web-api.js').default;

if (!app) {
  throw new Error('Failed to import Express app from compiled web-api module');
}

console.log('Express app imported successfully for Lambda handler');

// Export the Lambda handler
exports.handler = serverlessExpress(app);