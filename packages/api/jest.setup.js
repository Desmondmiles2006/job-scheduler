// Point the app's db pool at the test database for the whole test run.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
