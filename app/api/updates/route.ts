import { NextResponse } from "next/server";
import {
  fetchAllUpdates,
  fetchExcludedDbIds,
  fetchIconMap,
} from "../../../lib/notion";

const EXCLUDE_DB_ID = process.env.WIDGET_EXCLUDE_DB_ID || "";
const ICON_MAP_DB_ID = process.env.WIDGET_ICON_MAP_DB_ID || "";

let cache: { data: object; expiresAt: number } | null = null;

async function fetchFresh() {
  const [excludedIds, iconMap] = await Promise.all([
    fetchExcludedDbIds(EXCLUDE_DB_ID),
    fetchIconMap(ICON_MAP_DB_ID),
  ]);

  // 관리용 DB는 항상 제외
  if (EXCLUDE_DB_ID) excludedIds.dbIds.add(EXCLUDE_DB_ID.replace(/-/g, ""));
  if (ICON_MAP_DB_ID) excludedIds.dbIds.add(ICON_MAP_DB_ID.replace(/-/g, ""));

  const { items, hiddenItems } = await fetchAllUpdates(excludedIds, iconMap);

  return {
    ok: true,
    refreshedAt: new Date().toISOString(),
    count: items.length,
    sources: { total: items.length, hidden: hiddenItems.length },
    items,
    hiddenItems,
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