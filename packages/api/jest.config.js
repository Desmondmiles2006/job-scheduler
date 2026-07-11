/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFiles: ["dotenv/config", "<rootDir>/jest.setup.js"],
};
