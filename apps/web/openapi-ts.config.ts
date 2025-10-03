import { defineConfig } from "@hey-api/openapi-ts";

// Generate client/types directly inside this web package.
// Prerequisite: run `pnpm openapi:api` at root (or have the API generate apps/api/openapi.json).
export default defineConfig({
  input: "../api/openapi.json", // relative to this config file
  output: "./api-client",
  plugins: [
    {
      name: "@hey-api/client-fetch",
      runtimeConfigPath: "../api-client.config",
    },
  ],
});
