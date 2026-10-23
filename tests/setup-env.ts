// Test database configuration. Integration tests run against a dedicated, disposable database.
process.env.APP_DB_PASSWORD ??= "local-dev-app-password-123";
process.env.APP_MODE = "test";
process.env.APP_URL ??= "http://localhost:3100";
process.env.TEST_DB_NAME ??= "vapp_test";
const host = process.env.TEST_DB_HOST ?? "localhost:5432";
process.env.DATABASE_URL = `postgres://vapp_app:${process.env.APP_DB_PASSWORD ?? "local-dev-app-password-123"}@${host}/${process.env.TEST_DB_NAME}`;
process.env.DATABASE_OWNER_URL = `postgres://${process.env.TEST_DB_OWNER ?? "postgres:postgres"}@${host}/${process.env.TEST_DB_NAME}`;
process.env.HMAC_SECRET ??= "test-only-hmac-secret-0123456789abcdef0123";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET ??= "test-cron-secret-0123456789";
export {};
