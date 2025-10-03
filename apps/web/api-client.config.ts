import type { CreateClientConfig } from "./api-client/client.gen";

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: "http://localhost:3000",
});
