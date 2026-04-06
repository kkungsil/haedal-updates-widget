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

export type ExcludeSet = { dbIds: Set<string>; pageIds: Set<string> };

function parseEmojiIcon(icon: any): string | undefined {
  if (!icon) return undefined;
  if (typeof icon === "string") return icon;
  if (typeof icon.emoji === "string") return icon.emoji;
  if (typeof icon.value === "string") return icon.value;
  return undefined;
}

function extractItemTitle(page: any): string {
  const props = page?.properties || {};
  // typed format (from search API)
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === "title") {
      return (p.title || []).map((x: any) => x.plain_text).join("") || "";
    }
  }
  // flat format (from dataSources.query / pages.retrieve)
  for (const key of Object.keys(props)) {
    const val = props[key];
    if (
      typeof val === "string" &&
      val &&
      !val.startsWith("__") &&
      key !== "url" &&
      !key.startsWith("date:")
    ) {
      return val;
    }
  }
  return "";
}

function extractDbTitle(db: any): string {
  return (db.title || []).map((t: any) => t.plain_text).join("") || "(DB)";
}

function readFlatProp(row: any, key: string): string {
  const val = row?.properties?.[key];
  if (typeof val === "string") return val;
  // typed rich_text format
  if (Array.isArray(val?.rich_text)) {
    return val.rich_text.map((t: any) => t.plain_text || "").join("");
  }
  if (Array.isArray(val)) {
    return val.map((t: any) => t.plain_text || "").join("");
  }
  return "";
}

function isFlatCheckboxTrue(row: any, key: string): boolean {
  const val = row?.properties?.[key];
  return val === "__YES__" || val === true || val?.checkbox === true;
}

export async function fetchExcludedDbIds(excludeDbId: string): Promise<ExcludeSet> {
  const dbIds = new Set<string>();
  const pageIds = new Set<string>();
  if (!excludeDbId) return { dbIds, pageIds };
  try {
    const db: any = await (notion as any).databases.retrieve({ database_id: excludeDbId });
    const dataSourceId = db?.data_sources?.[0]?.id || db?.data_sources?.[0]?.data_source?.id;
    if (!dataSourceId) return { dbIds, pageIds };
    const resp: any = await (notion as any).dataSources.query({ data_source_id: dataSourceId, page_size: 100 });
    for (const row of resp.results || []) {
      if (!isFlatCheckboxTrue(row, "제외 활성")) continue;
      const raw = readFlatProp(row, "DB ID").replace(/-/g, "");
      if (raw.length === 32) dbIds.add(raw);
    }
  } catch (e) { console.error("Failed to load exclude list:", e); }

  // 제외 DB 안의 페이지 ID도 수집 (하위 페이지 제외용)
  await Promise.allSettled(
    Array.from(dbIds).map(async (dbId) => {
      try {
        const db: any = await (notion as any).databases.retrieve({ database_id: dbId });
        const dsId = db?.data_sources?.[0]?.id || db?.data_sources?.[0]?.data_source?.id;
        if (!dsId) return;
        const resp: any = await (notion as any).dataSources.query({ data_source_id: dsId, page_size: 100 });
        for (const page of resp.results || []) {
          const id = (page.id || "").replace(/-/g, "");
          if (id.length === 32) pageIds.add(id);
        }
      } catch (_) {}
    })
  );

  return { dbIds, pageIds };
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
      const dbId = readFlatProp(row, "DB ID").replace(/-/g, "");
      const icon = readFlatProp(row, "아이콘").trim();
      if (dbId.length === 32 && icon) map.set(dbId, icon);
    }
  } catch (e) { console.error("Failed to load icon map:", e); }
  return map;
}

export async function fetchAllDbUpdates(
  excludedIds: ExcludeSet,
  iconMap: Map<string, string>
): Promise<UpdateItem[]> {
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
    if (excludedIds.dbIds.has(dbId)) continue;
    const pageParentId = (parent?.page_id || "").replace(/-/g, "");
    if (pageParentId && excludedIds.pageIds.has(pageParentId)) continue;
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

export async function fetchHiddenDbUpdates(
  excludedIds: ExcludeSet,
  iconMap: Map<string, string>
): Promise<UpdateItem[]> {
  if (excludedIds.dbIds.size === 0) return [];

  const results: UpdateItem[] = [];
  await Promise.allSettled(
    Array.from(excludedIds.dbIds).map(async (dbId) => {
      try {
        const db: any = await (notion as any).databases.retrieve({ database_id: dbId });
        const dsId = db?.data_sources?.[0]?.id || db?.data_sources?.[0]?.data_source?.id;
        if (!dsId) return;
        const resp: any = await (notion as any).dataSources.query({ data_source_id: dsId, page_size: 5 });
        for (const page of resp.results || []) {
          const itemTitle = extractItemTitle(page);
          const isNew = page.created_time === page.last_edited_time;
          const action = itemTitle ? `${itemTitle} ${isNew ? "작성" : "수정"}` : "내용 업데이트";
          results.push({
            entityId: (page.id || "").replace(/-/g, ""),
            entityType: "db",
            title: `${extractDbTitle(db)} - ${action}`,
            url: page.url,
            iconEmoji: iconMap.get(dbId) || parseEmojiIcon(db.icon),
            lastEditedTime: page.last_edited_time,
          });
        }
      } catch (_) {}
    })
  );
  return results.sort((a, b) => (a.lastEditedTime < b.lastEditedTime ? 1 : -1));
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
  return settled.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled").map((r) => r.value);
}