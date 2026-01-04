import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseClient } from "../lib/newsVectors";

type LinkRow = {
  id: number;
  URL?: string | null;
  url?: string | null;
};

const LINK_TABLE = process.env.LINK_TABLE?.trim() || "link";

const DEDUPE_CONFIG = {
  apply: process.env.LINK_DEDUPE_APPLY === "1" || process.argv.includes("--apply"),
  deleteEmpty: process.env.LINK_DEDUPE_DELETE_EMPTY === "1",
  maxLinks: Number(process.env.LINK_DEDUPE_MAX) || 50000,
};

const log = (...args: unknown[]) => {
  console.log("[link-dedupe]", ...args);
};

const requireEnv = (name: string, value: string | undefined | null) => {
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
};

const isMissingColumnError = (error: { message?: string } | null) => {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    url.hash = "";
    const normalized = url.toString();
    if (normalized.endsWith("/") && normalized.length > url.origin.length + 1) {
      return normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return trimmed;
  }
};

const selectLinkRowsWithFallback = async (
  client: SupabaseClient,
  columnsList: string[],
) => {
  for (const columns of columnsList) {
    const { data, error } = await client
      .from(LINK_TABLE)
      .select(columns)
      .order("id", { ascending: true })
      .limit(DEDUPE_CONFIG.maxLinks);

    if (!error) {
      return data || [];
    }

    if (!isMissingColumnError(error)) {
      throw new Error(`Failed to load link rows: ${error.message}`);
    }
  }

  throw new Error("Failed to load link rows: no compatible column set found.");
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

async function fetchLinks(client: SupabaseClient): Promise<LinkRow[]> {
  const columnsList = ["id, URL", "id, url"];
  const data = await selectLinkRowsWithFallback(client, columnsList);
  return data as LinkRow[];
}

async function deleteLinks(client: SupabaseClient, ids: number[]) {
  if (ids.length === 0) return;
  const chunks = chunkArray(ids, 200);
  for (const chunk of chunks) {
    const { error } = await client.from(LINK_TABLE).delete().in("id", chunk);
    if (error) {
      throw new Error(`Failed to delete links: ${error.message}`);
    }
  }
}

async function main() {
  log(
    `Scanning up to ${DEDUPE_CONFIG.maxLinks} links in "${LINK_TABLE}" (apply=${
      DEDUPE_CONFIG.apply ? "yes" : "no"
    })`,
  );

  const supabaseUrl = requireEnv(
    "SUPABASE_URL",
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const supabaseKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  log(`Using SUPABASE_URL=${supabaseUrl}`);
  void supabaseKey;

  const client = getServiceSupabaseClient();
  const rows = await fetchLinks(client);
  if (rows.length === 0) {
    log("No links found.");
    return;
  }

  const groups = new Map<string, LinkRow[]>();
  const emptyRows: LinkRow[] = [];

  rows.forEach((row) => {
    const raw = row.URL ?? row.url ?? "";
    const normalized = normalizeUrl(raw);
    if (!normalized) {
      emptyRows.push(row);
      return;
    }
    const existing = groups.get(normalized) ?? [];
    existing.push(row);
    groups.set(normalized, existing);
  });

  const duplicates: LinkRow[] = [];
  groups.forEach((list) => {
    if (list.length <= 1) return;
    const sorted = [...list].sort((a, b) => a.id - b.id);
    duplicates.push(...sorted.slice(1));
  });

  log(
    `Loaded ${rows.length} links. Unique URLs=${groups.size}. Duplicate rows=${duplicates.length}. Empty URLs=${emptyRows.length}.`,
  );

  if (!DEDUPE_CONFIG.apply) {
    log("Dry-run only. Set LINK_DEDUPE_APPLY=1 or run with --apply to delete.");
    return;
  }

  const deleteIds = duplicates.map((row) => row.id);
  if (DEDUPE_CONFIG.deleteEmpty && emptyRows.length > 0) {
    deleteIds.push(...emptyRows.map((row) => row.id));
  }

  await deleteLinks(client, deleteIds);
  log(`Deleted ${deleteIds.length} link rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
