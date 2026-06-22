#!/usr/bin/env node

/**
 * Namecheap MCP Server
 *
 * Read + safe-write access to a Namecheap account via the official API.
 *
 *   Reads:   domain list/info, availability check, contacts, registrar lock,
 *            DNS hosts/nameservers, email forwarding, pricing, account balance,
 *            SSL certificate list.
 *   Writes:  DNS host records, default/custom nameservers, email forwarding,
 *            registrar lock. (Configuration changes only — reversible.)
 *
 * Deliberately EXCLUDED: anything that spends money or is irreversible —
 * domain register/renew/reactivate, transfers, SSL purchase/activate, add-funds,
 * privacy renewal, account/address mutation. Add those separately if needed.
 *
 * Part of The SEO Engine toolkit by Lantern Row. https://lanternrow.com
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getConfig } from "./config.js";
import { ncRequest, asArray } from "./client.js";

const server = new McpServer({ name: "namecheap-mcp", version: "1.0.0" });

// ─── Helpers ──────────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

/** Split "example.co.uk" → { sld: "example", tld: "co.uk" }. */
function splitDomain(domain: string): { sld: string; tld: string } {
  const trimmed = domain.trim().toLowerCase();
  const dot = trimmed.indexOf(".");
  if (dot < 1 || dot === trimmed.length - 1) {
    throw new Error(`Invalid domain name: "${domain}"`);
  }
  return { sld: trimmed.slice(0, dot), tld: trimmed.slice(dot + 1) };
}

// ─── Read tools ───────────────────────────────────────────────────

server.tool(
  "check_connection",
  "Verify the Namecheap API connection and credentials. Returns the account balance summary — a lightweight call that confirms the API user, key, and IP whitelist are all working.",
  {},
  async () => {
    try {
      const cfg = getConfig();
      const res = await ncRequest("namecheap.users.getBalances");
      return ok({
        connected: true,
        environment: cfg.environment,
        apiUser: cfg.apiUser,
        balances: res.UserGetBalancesResult ?? res,
      });
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "list_domains",
  "List domains in the account, with creation/expiry dates, lock status, auto-renew, and WhoisGuard status. Supports paging and search.",
  {
    list_type: z.enum(["ALL", "EXPIRING", "EXPIRED"]).default("ALL").describe("Filter by status. Default ALL."),
    search_term: z.string().optional().describe("Keyword to filter the domain list."),
    page: z.number().int().min(1).default(1).describe("Page number (default 1)."),
    page_size: z.number().int().min(10).max(100).default(20).describe("Domains per page, 10-100 (default 20)."),
    sort_by: z
      .enum(["NAME", "NAME_DESC", "EXPIREDATE", "EXPIREDATE_DESC", "CREATEDATE", "CREATEDATE_DESC"])
      .optional()
      .describe("Sort order."),
  },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.domains.getList", {
        ListType: args.list_type,
        SearchTerm: args.search_term,
        Page: args.page,
        PageSize: args.page_size,
        SortBy: args.sort_by,
      });
      const domains = asArray(res.DomainGetListResult?.Domain);
      return ok({ domains, paging: res.Paging });
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_domain_info",
  "Get detailed info for one domain: status, created/expiry dates, WhoisGuard, DNS provider, and modification rights.",
  { domain: z.string().describe("Full domain name, e.g. example.com") },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.domains.getInfo", { DomainName: args.domain.trim() });
      return ok(res.DomainGetInfoResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "check_domains",
  "Check availability (and premium pricing) for one or more domains. Max 50 per call.",
  { domains: z.array(z.string()).min(1).max(50).describe("Domain names to check, e.g. ['foo.com','bar.io']") },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.domains.check", {
        DomainList: args.domains.map((d) => d.trim()).join(","),
      });
      return ok({ results: asArray(res.DomainCheckResult) });
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_domain_contacts",
  "Get the Registrant, Tech, Admin, and AuxBilling contact details for a domain.",
  { domain: z.string().describe("Full domain name, e.g. example.com") },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.domains.getContacts", { DomainName: args.domain.trim() });
      return ok(res.DomainContactsResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_registrar_lock",
  "Get the registrar lock status for a domain.",
  { domain: z.string().describe("Full domain name, e.g. example.com") },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.domains.getRegistrarLock", { DomainName: args.domain.trim() });
      return ok(res.DomainGetRegistrarLockResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_dns_hosts",
  "Get all DNS host records (A, AAAA, CNAME, MX, TXT, URL, etc.) for a domain.",
  { domain: z.string().describe("Full domain name, e.g. example.com") },
  async (args) => {
    try {
      const { sld, tld } = splitDomain(args.domain);
      const res = await ncRequest("namecheap.domains.dns.getHosts", { SLD: sld, TLD: tld });
      const result = res.DomainDNSGetHostsResult ?? {};
      return ok({
        domain: result.Domain,
        usingNamecheapDNS: result.IsUsingOurDNS,
        hosts: asArray(result.host ?? result.Host),
      });
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_nameservers",
  "Get the nameservers associated with a domain, and whether it uses Namecheap's default DNS.",
  { domain: z.string().describe("Full domain name, e.g. example.com") },
  async (args) => {
    try {
      const { sld, tld } = splitDomain(args.domain);
      const res = await ncRequest("namecheap.domains.dns.getList", { SLD: sld, TLD: tld });
      const result = res.DomainDNSGetListResult ?? {};
      return ok({
        domain: result.Domain,
        usingNamecheapDNS: result.IsUsingOurDNS,
        nameservers: asArray(result.Nameserver),
      });
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_email_forwarding",
  "Get email forwarding settings (mailbox → forward-to) for a domain.",
  { domain: z.string().describe("Full domain name, e.g. example.com") },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.domains.dns.getEmailForwarding", {
        DomainName: args.domain.trim(),
      });
      return ok(res.DomainDNSGetEmailForwardingResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_pricing",
  "Get Namecheap pricing for a product type (e.g. DOMAIN register/renew/transfer). Cache results — this is a heavy endpoint.",
  {
    product_type: z.string().default("DOMAIN").describe("ProductType, e.g. DOMAIN, SSLCERTIFICATE, WHOISGUARD."),
    product_category: z.string().optional().describe("e.g. DOMAINS, REGISTER, RENEW, TRANSFER."),
    action_name: z.string().optional().describe("e.g. REGISTER, RENEW, TRANSFER, REACTIVATE."),
    product_name: z.string().optional().describe("e.g. com, net, io — a specific TLD."),
  },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.users.getPricing", {
        ProductType: args.product_type,
        ProductCategory: args.product_category,
        ActionName: args.action_name,
        ProductName: args.product_name,
      });
      return ok(res.UserGetPricingResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "list_ssl_certificates",
  "List SSL certificates in the account, with type, host name, status, and expiry.",
  {
    list_type: z.string().optional().describe("ALL, Processing, Active, Completed, Cancelled, etc. Default ALL."),
    search_term: z.string().optional().describe("Keyword filter."),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(10).max(100).default(20),
  },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.ssl.getList", {
        ListType: args.list_type,
        SearchTerm: args.search_term,
        Page: args.page,
        PageSize: args.page_size,
      });
      return ok({ certificates: asArray(res.SSLListResult?.SSL ?? res.SSLGetListResult?.SSL), paging: res.Paging });
    } catch (err) {
      return fail(err);
    }
  }
);

// ─── Safe-write tools (configuration only; no charges) ────────────

server.tool(
  "set_dns_hosts",
  "Replace ALL DNS host records for a domain. WARNING: this is destructive — Namecheap deletes any record not included here, so you must pass the COMPLETE desired record set (call get_dns_hosts first, merge your changes, then send everything). Switches the domain to Namecheap DNS if needed.",
  {
    domain: z.string().describe("Full domain name, e.g. example.com"),
    records: z
      .array(
        z.object({
          host_name: z.string().describe("Subdomain/host, e.g. '@', 'www', 'mail'."),
          record_type: z
            .enum(["A", "AAAA", "ALIAS", "CAA", "CNAME", "MX", "MXE", "NS", "TXT", "URL", "URL301", "FRAME"])
            .describe("DNS record type."),
          address: z.string().describe("Record value: IP, hostname, URL, or text depending on type."),
          mx_pref: z.number().int().optional().describe("MX preference (MX records only)."),
          ttl: z.number().int().min(60).max(60000).optional().describe("TTL seconds, 60-60000 (default 1800)."),
        })
      )
      .min(1)
      .describe("The COMPLETE set of host records to apply. Omitted records are deleted."),
    email_type: z
      .enum(["MX", "MXE", "FWD", "OX", "NONE"])
      .optional()
      .describe("Email routing mode. Set MX when including MX records; leave unset otherwise."),
  },
  async (args) => {
    try {
      const { sld, tld } = splitDomain(args.domain);
      const params: Record<string, string | number | undefined> = { SLD: sld, TLD: tld };
      args.records.forEach((r, i) => {
        const n = i + 1;
        params[`HostName${n}`] = r.host_name;
        params[`RecordType${n}`] = r.record_type;
        params[`Address${n}`] = r.address;
        if (r.mx_pref !== undefined) params[`MXPref${n}`] = r.mx_pref;
        if (r.ttl !== undefined) params[`TTL${n}`] = r.ttl;
      });
      if (args.email_type) params.EmailType = args.email_type;
      // Namecheap recommends POST when sending many host records.
      const method = args.records.length > 10 ? "POST" : "GET";
      const res = await ncRequest("namecheap.domains.dns.setHosts", params, method);
      return ok(res.DomainDNSSetHostsResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "set_default_dns",
  "Switch a domain to Namecheap's default (BasicDNS) nameservers. Required for Namecheap host records, URL/email forwarding.",
  { domain: z.string().describe("Full domain name, e.g. example.com") },
  async (args) => {
    try {
      const { sld, tld } = splitDomain(args.domain);
      const res = await ncRequest("namecheap.domains.dns.setDefault", { SLD: sld, TLD: tld });
      return ok(res.DomainDNSSetDefaultResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "set_custom_nameservers",
  "Point a domain at custom nameservers. NOTE: Namecheap host records, URL/email forwarding stop working while custom nameservers are in use.",
  {
    domain: z.string().describe("Full domain name, e.g. example.com"),
    nameservers: z.array(z.string()).min(1).describe("Nameserver hostnames, e.g. ['dns1.p01.nsone.net','dns2.p01.nsone.net']"),
  },
  async (args) => {
    try {
      const { sld, tld } = splitDomain(args.domain);
      const res = await ncRequest("namecheap.domains.dns.setCustom", {
        SLD: sld,
        TLD: tld,
        Nameservers: args.nameservers.map((n) => n.trim()).join(","),
      });
      return ok(res.DomainDNSSetCustomResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "set_email_forwarding",
  "Set email forwarding rules for a domain. Replaces the full forwarding set (pass all rules you want to keep).",
  {
    domain: z.string().describe("Full domain name, e.g. example.com"),
    forwards: z
      .array(
        z.object({
          mailbox: z.string().describe("Local part, e.g. 'info' for info@domain."),
          forward_to: z.string().describe("Destination email, e.g. you@gmail.com."),
        })
      )
      .min(1)
      .describe("The complete set of mailbox → forward-to rules."),
  },
  async (args) => {
    try {
      const params: Record<string, string | number | undefined> = { DomainName: args.domain.trim() };
      args.forwards.forEach((f, i) => {
        const n = i + 1;
        params[`MailBox${n}`] = f.mailbox;
        params[`ForwardTo${n}`] = f.forward_to;
      });
      const res = await ncRequest("namecheap.domains.dns.setEmailForwarding", params);
      return ok(res.DomainDNSSetEmailForwardingResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "set_registrar_lock",
  "Lock or unlock a domain at the registrar (theft protection). Unlock before initiating an outbound transfer.",
  {
    domain: z.string().describe("Full domain name, e.g. example.com"),
    action: z.enum(["LOCK", "UNLOCK"]).default("LOCK").describe("LOCK or UNLOCK. Default LOCK."),
  },
  async (args) => {
    try {
      const res = await ncRequest("namecheap.domains.setRegistrarLock", {
        DomainName: args.domain.trim(),
        LockAction: args.action,
      });
      return ok(res.DomainSetRegistrarLockResult ?? res);
    } catch (err) {
      return fail(err);
    }
  }
);

// ─── Start ────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Namecheap MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
