/**
 * Namecheap API HTTP client.
 *
 * The Namecheap API is XML-over-HTTP. Every call is a GET (or POST for large
 * payloads) to a single endpoint with the command and parameters in the query
 * string. Responses are XML with Status="OK"|"ERROR"; errors come back with
 * HTTP 200, so we must inspect the parsed body, not the HTTP status.
 *
 * SECURITY: the ApiKey travels in the query string. We never log the full URL
 * or the key. Error messages surface only the Namecheap error number + text.
 */

import { XMLParser } from "fast-xml-parser";
import { getConfig } from "./config.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "_text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

/** Coerce a Namecheap node's repeated child into an array (XML gives object|array|undefined). */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractErrors(apiResponse: any): string {
  const errorsNode = apiResponse?.Errors;
  const errs = asArray(errorsNode?.Error);
  if (errs.length === 0) return "Unknown Namecheap API error";
  return errs
    .map((e: any) => {
      const num = e?.Number ?? "?";
      const text = typeof e === "object" ? e?._text ?? "" : String(e);
      return `[${num}] ${text}`.trim();
    })
    .join("; ");
}

/**
 * Execute a Namecheap API command.
 * @param command  e.g. "namecheap.domains.getList"
 * @param params   command-specific parameters (global params are added here)
 * @param method   "GET" (default) or "POST" (form-encoded; for large param sets)
 * @returns the parsed CommandResponse object
 */
export async function ncRequest(
  command: string,
  params: Record<string, string | number | undefined> = {},
  method: "GET" | "POST" = "GET"
): Promise<any> {
  const cfg = getConfig();

  const search = new URLSearchParams({
    ApiUser: cfg.apiUser,
    ApiKey: cfg.apiKey,
    UserName: cfg.userName,
    ClientIp: cfg.clientIp,
    Command: command,
  });

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }

  let res: Response;
  try {
    if (method === "POST") {
      res = await fetch(cfg.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: search.toString(),
      });
    } else {
      res = await fetch(`${cfg.baseUrl}?${search.toString()}`, { method: "GET" });
    }
  } catch (err) {
    // Network-level failure — do not leak the URL (contains the key).
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error calling Namecheap (${command}): ${msg}`);
  }

  const body = await res.text();

  if (!res.ok) {
    throw new Error(`Namecheap HTTP ${res.status} for ${command}`);
  }

  let parsed: any;
  try {
    parsed = parser.parse(body);
  } catch {
    throw new Error(`Failed to parse Namecheap XML response for ${command}`);
  }

  const apiResponse = parsed?.ApiResponse;
  if (!apiResponse) {
    throw new Error(`Unexpected Namecheap response shape for ${command}`);
  }

  if (apiResponse.Status === "ERROR") {
    throw new Error(`Namecheap API error (${command}): ${extractErrors(apiResponse)}`);
  }

  return apiResponse.CommandResponse ?? {};
}
