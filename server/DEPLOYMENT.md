# Deployment Configuration

This server supports both local development and AWS Lambda deployment with automatic environment detection.

## Environment Variables

### Required for all environments:
- `JWT_SECRET` or `SESSION_SECRET`: Secret key for JWT token signing
- `TENANT_URL`: SailPoint tenant URL
- `CLIENT_ID`: OAuth client ID
- `CLIENT_SECRET`: OAuth client secret
- `REDIRECT_URI`: OAuth redirect URI

### Required for Lambda deployment:
- `AWS_LAMBDA_FUNCTION_NAME`: Automatically set by AWS Lambda
- `AWS_REGION`: AWS region (defaults to us-east-1)
- `DYNAMO_TABLE_NAME`: DynamoDB table name (defaults to ui-dev-kit-tokens)

### Optional:
- `NODE_ENV`: Set to 'production' for secure cookies in production
- `OAUTH_SCOPES`: OAuth scopes to request (defaults to sp:scopes:all)

## DynamoDB Table Structure

When deployed to Lambda, the server uses DynamoDB for storing OAuth tokens and state data that can't be stored in regular sessions. The table uses a composite key structure:

### Table Configuration:
- **Table Name**: `ui-dev-kit-sessions` (or value of `DYNAMO_TABLE_NAME`)
- **Partition Key**: `pk` (String) - Primary key with prefixes like `token#sessionId` or `oauth#stateKey`
- **Sort Key**: `sk` (String) - Sort key like `data` or `state`
- **TTL Attribute**: `ttl` (Number, represents Unix timestamp)

### Example CloudFormation/CDK Table Definition:
```yaml
SessionsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: ui-dev-kit-sessions
    AttributeDefinitions:
      - AttributeName: pk
        AttributeType: S
      - AttributeName: sk
        AttributeType: S
    KeySchema:
      - AttributeName: pk
        KeyType: HASH
      - AttributeName: sk
        KeyType: RANGE
    BillingMode: PAY_PER_REQUEST
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
```

## Local Development

For local development, the server automatically uses in-memory storage for OAuth tokens. No DynamoDB setup is required. Session data is always stored in JWT cookies regardless of environment.

## Stateless CSRF Protection

The server uses double-submit cookie CSRF protection, which is stateless and works in both environments:

1. Client requests CSRF token from `/api/auth/csrf-token`
2. Server generates token and sets it in a cookie
3. Client includes token in `X-CSRF-Token` header for protected requests
4. Server validates that header token matches cookie token

## Authentication Flow

1. **Login**: Client calls `/api/auth/web-login` → Server returns OAuth URL
2. **OAuth Callback**: OAuth provider redirects to `/oauth/callback`
3. **Token Exchange**: Server exchanges code for access/refresh tokens
4. **Session Creation**: Server creates JWT session cookie and stores tokens separately
5. **API Calls**: Client uses JWT session cookie, server retrieves tokens using tokenId from JWT

## Architecture Benefits

- **Stateless Sessions**: JWT tokens contain all session data (username, tokenId, expiry)
- **Secure Token Storage**: Large OAuth tokens stored separately in DynamoDB/memory
- **No Session Stickiness**: Lambda instances can handle any request
- **Automatic Cleanup**: TTL removes expired tokens automatically
- **Development Friendly**: No AWS dependencies for local development