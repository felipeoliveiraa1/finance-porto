import { PluggyClient } from "pluggy-sdk";

let cached: PluggyClient | null = null;

export function getPluggyClient(): PluggyClient {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET must be set in .env. " +
        "Create an Application at https://dashboard.pluggy.ai/applications.",
    );
  }

  if (!cached) {
    cached = new PluggyClient({ clientId, clientSecret });
  }
  return cached;
}

export function hasPluggyCredentials(): boolean {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}
