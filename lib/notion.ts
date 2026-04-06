import { Client } from "@notionhq/client"; 
export const notion = new Client({ auth: process.env.NOTION_TOKEN });

export type UpdateItem = {
  entityId: string;
  entityType: "db" | "page";
  title: string;
  url: string;
  iconEmoji?: string;
  lastEditedTime: string;
};

function parseEmojiIcon(icon: any): string | undefined {
  if (!icon) return undefined;
  if (typeof icon === "string") return icon;
  if (typeof icon.emoji === "string") return icon.emoji;
  if (typeof icon.value === "string") return icon.value;
  return undefined;
}

function extractItemTitle(page: any): string {
  const props = page?.properties || {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === "title") {
      return (p.title || []).map((x: any) => x.plain_text).join("") || "";
    }
  }
  return "";
}

function extractDbTitle(db: any): string {
  return (db.title || []).map((t: any) => t.plain_text).join("") || "(DB)";
}

export async function fetchExcludedDbIds(excludeDbId: string): Promise<Set<string>> {
  const excluded = new Set<string>();
  if (!excludeDbId) return excluded;
  try {
    const db: any = await (notion as any).databases.retrieve({ database_id: excludeDbId });
    const dataSourceId = db?.data_sources?.[0]?.id || db?.data_sources?.[0]?.data_source?.id;
    if (!dataSourceId) return excluded;
    const resp: any = await (notion as any).dataSources.query({ data_source_id: dataSourceId, page_size: 100 });
    for (const row of resp.results || []) {
      const active = row.properties?.["제외 활성"]?.checkbox;
      if (!active) continue;
      const raw = row.properties?.["DB ID"]?.rich_text?.[0]?.plain_text?.trim() || "";
      const id = raw.replace(/-/g, "");
      if (id.length === 32) excluded.add(id);
    }
  } catch (e) { console.error("Failed to load exclude list:", e); }
  return excluded;
}

export async function fetchIconMap(iconMapDbId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!iconMapDbId) return map;
  try {
    const db: any = await (notion as any).databases.retrieve({ database_id: iconMapDbId });
    const dataSourceId = db?.data_sources?.[0]?.id || db?.data_sources?.[0]?.data_source?.id;
    if (!dataSourceId) return map;
    const resp: any = await (notion as any).dataSources.query({ data_source_id: dataSourceId, page_size: 100 });
    for (const row of resp.results || []) {
      const dbId = row.properties?.["DB ID"]?.rich_text?.[0]?.plain_text?.trim().replace(/-/g, "") || "";
      const icon = row.properties?.["아이콘"]?.rich_text?.[0]?.plain_text?.trim() || "";
      if (dbId.length === 32 && icon) map.set(dbId, icon);
    }
  } catch (e) { console.error("Failed to load icon map:", e); }
  return map;
}

export async function fetchAllDbUpdates(excludedIds: Set<string>, iconMap: Map<string, string>): Promise<UpdateItem[]> {
  const resp: any = await (notion as any).search({
    filter: { value: "page", property: "object" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: 100,
  });

  const dbMap = new Map<string, any>();
  for (const page of resp.results || []) {
    const parent = page.parent;
    let dbId: string | null = null;
    if (parent?.type === "database_id") {
      dbId = (parent.database_id || "").replace(/-/g, "");
    } else if (parent?.type === "data_source" || parent?.type === "data_source_id") {
      dbId = (parent.database_id || parent.data_source_id || "").replace(/-/g, "");
    }
    if (!dbId || dbId.length < 32) continue;
    if (excludedIds.has(dbId)) continue;
    if (!dbMap.has(dbId)) dbMap.set(dbId, page);
  }

  const results: UpdateItem[] = [];
  await Promise.allSettled(
    Array.from(dbMap.entries()).map(async ([dbId, page]) => {
      try {
        const db: any = await (notion as any).databases.retrieve({ database_id: dbId });
        const itemTitle = extractItemTitle(page);
        const isNew = page.created_time === page.last_edited_time;
        const action = itemTitle ? `${itemTitle} ${isNew ? "작성" : "수정"}` : "내용 업데이트";
        results.push({
          entityId: dbId,
          entityType: "db",
          title: `${extractDbTitle(db)} - ${action}`,
          url: page.url,
          iconEmoji: iconMap.get(dbId) || parseEmojiIcon(db.icon),
          lastEditedTime: page.last_edited_time,
        });
      } catch (_) {}
    })
  );
  return results;
}

export async function fetchSnapshotUpdates(pageIds: string[]): Promise<UpdateItem[]> {
  const settled = await Promise.allSettled(
    pageIds.map(async (page_id) => {
      const page: any = await (notion as any).pages.retrieve({ page_id });
      const itemTitle = extractItemTitle(page);
      const isNew = page.created_time === page.last_edited_time;
      return {
        entityId: (page.id || "").replace(/-/g, ""),
        entityType: "page" as const,
        title: `${itemTitle || "(페이지)"} - ${isNew ? "페이지 추가" : "페이지 수정"}`,
        url: page.url,
        iconEmoji: parseEmojiIcon(page.icon),
        lastEditedTime: page.last_edited_time,
      };
    })
  );
  return settled.filter((r): r is PromiseFulfilledResult<UpdateItem> => r.status === "fulfilled").map((r) => r.value);
}
