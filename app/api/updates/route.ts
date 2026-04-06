import { NextResponse } from "next/server";
import { HAEDAL_SNAPSHOT_PAGE_URLS } from "../../../data/haedalSnapshot";
import { fetchGeneratorDbUpdates, fetchSnapshotUpdates } from "../../../lib/notion";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const startedAt = new Date().toISOString();

  try {
    const [generatorItems, snapshotItems] = await Promise.all([
      fetchGeneratorDbUpdates(),
      fetchSnapshotUpdates(HAEDAL_SNAPSHOT_PAGE_URLS),
    ]);

    const combined = [...generatorItems, ...snapshotItems]
      .sort((x, y) => (x.lastEditedTime < y.lastEditedTime ? 1 : -1))
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      startedAt,
      count: combined.length,
      sources: { generatorDb: generatorItems.length, snapshot: snapshotItems.length },
      items: combined,
      ...(debug ? { debug: { notionTokenSet: !!process.env.NOTION_TOKEN } } : {}),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        startedAt,
        error: {
          message: e?.message || String(e),
          name: e?.name,
        },
        debug: {
          notionTokenSet: !!process.env.NOTION_TOKEN,
        },
      },
      { status: 500 },
    );
  }
}