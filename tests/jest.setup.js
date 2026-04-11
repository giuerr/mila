// Set test port to 0 (OS assigns random port) to avoid conflicts
process.env.PORT = '0';
// Set JWT secret so auth.js and routes/auth.js use the same key
process.env.JWT_SECRET = 'test-secret-for-integration-tests';
