/**
 * Namecheap MCP configuration.
 *
 * Credentials are read from environment variables ONLY — never hard-coded,
 * never logged, never written to disk by this server.
 *
 * Required env vars:
 *   NAMECHEAP_API_USER   — your Namecheap account username (API user)
 *   NAMECHEAP_API_KEY    — the API key from Profile → Tools → API Access
 *   NAMECHEAP_CLIENT_IP  — the whitelisted public IPv4 of THIS machine
 *
 * Optional:
 *   NAMECHEAP_USERNAME    — defaults to NAMECHEAP_API_USER (differs only for resellers)
 *   NAMECHEAP_ENVIRONMENT — "production" (default) or "sandbox"
 */

export interface NamecheapConfig {
  apiUser: string;
  apiKey: string;
  userName: string;
  clientIp: string;
  baseUrl: string;
  environment: "production" | "sandbox";
}

const PRODUCTION_URL = "https://api.namecheap.com/xml.response";
const SANDBOX_URL = "https://api.sandbox.namecheap.com/xml.response";

let cached: NamecheapConfig | null = null;

export function getConfig(): NamecheapConfig {
  if (cached) return cached;

  const apiUser = process.env.NAMECHEAP_API_USER?.trim();
  const apiKey = process.env.NAMECHEAP_API_KEY?.trim();
  const clientIp = process.env.NAMECHEAP_CLIENT_IP?.trim();
  const userName = process.env.NAMECHEAP_USERNAME?.trim() || apiUser;
  const env = (process.env.NAMECHEAP_ENVIRONMENT?.trim() || "production").toLowerCase();

  const missing: string[] = [];
  if (!apiUser) missing.push("NAMECHEAP_API_USER");
  if (!apiKey) missing.push("NAMECHEAP_API_KEY");
  if (!clientIp) missing.push("NAMECHEAP_CLIENT_IP");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them in the MCP server's env config. ` +
        `NAMECHEAP_CLIENT_IP must be the public IPv4 of this machine, whitelisted in your Namecheap account.`
    );
  }

  if (env !== "production" && env !== "sandbox") {
    throw new Error(
      `NAMECHEAP_ENVIRONMENT must be "production" or "sandbox" (got "${env}").`
    );
  }

  cached = {
    apiUser: apiUser!,
    apiKey: apiKey!,
    userName: userName!,
    clientIp: clientIp!,
    baseUrl: env === "sandbox" ? SANDBOX_URL : PRODUCTION_URL,
    environment: env,
  };

  return cached;
}
