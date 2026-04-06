import { NextResponse } from "next/server";
import { HAEDAL_SNAPSHOT_PAGE_URLS } from "../../../data/haedalSnapshot";
import {
  fetchAllDbUpdates,
  fetchSnapshotUpdates,
  fetchExcludedDbIds,
  fetchIconMap,
  UpdateItem,
} from "../../../lib/notion";

const EXCLUDE_DB_ID = process.env.WIDGET_EXCLUDE_DB_ID || "";
const ICON_MAP_DB_ID = process.env.WIDGET_ICON_MAP_DB_ID || "";

let cache: { data: object; expiresAt: number } | null = null;

async function fetchFresh() {
  const [excludedIds, iconMap] = await Promise.all([
    fetchExcludedDbIds(EXCLUDE_DB_ID),
    fetchIconMap(ICON_MAP_DB_ID),
  ]);

  const [dbItems, snapshotItems] = await Promise.all([
    fetchAllDbUpdates(excludedIds, iconMap),
    fetchSnapshotUpdates(HAEDAL_SNAPSHOT_PAGE_URLS),
  ]);

  const combined: UpdateItem[] = [...dbItems, ...snapshotItems].sort(
    (a, b) => (a.lastEditedTime < b.lastEditedTime ? 1 : -1)
  );

  return {
    ok: true,
    refreshedAt: new Date().toISOString(),
    count: combined.length,
    sources: { db: dbItems.length, snapshot: snapshotItems.length },
    items: combined,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchFresh();
    cache = { data, expiresAt: now + 30 * 60 * 1000 };
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: { message: e?.message || String(e), name: e?.name },
        debug: { notionTokenSet: !!process.env.NOTION_TOKEN },
      },
      { status: 500 }
    );
  }
}