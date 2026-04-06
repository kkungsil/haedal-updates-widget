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
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === "title") {
      return (p.title || []).map((x: any) => x.plain_text).join("") || "";
    }
  }
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

function isCreatedTodaySeoul(createdTime: string): boolean {
  const now = new Date();
  const todaySeoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const createdSeoul = new Date(new Date(createdTime).toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return (
    todaySeoul.getFullYear() === createdSeoul.getFullYear() &&
    todaySeoul.getMonth() === createdSeoul.getMonth() &&
    todaySeoul.getDate() === createdSeoul.getDate()
  );
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

export async function fetchAllUpdates(
  excludedIds: ExcludeSet,
  iconMap: Map<string, string>
): Promise<{ items: UpdateItem[]; hiddenItems: UpdateItem[] }> {
  const resp: any = await (notion as any).search({
    filter: { value: "page", property: "object" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: 100,
  });

  const dbMap = new Map<string, any>();
  const standalonePages: any[] = [];

 for (const page of resp.results || []) {
  const parent = page.parent;
  

  // DB 안 페이지
  let dbId: string | null = null;
    if (parent?.type === "database_id") {
      dbId = (parent.database_id || "").replace(/-/g, "");
    } else if (parent?.type === "data_source" || parent?.type === "data_source_id") {
      dbId = (parent.database_id || parent.data_source_id || "").replace(/-/g, "");
    }

    if (dbId && dbId.length >= 32) {
      if (!excludedIds.dbIds.has(dbId) && !dbMap.has(dbId)) {
        dbMap.set(dbId, page);
      }
      continue;
    }

    // 독립 페이지 (페이지 안 또는 워크스페이스 최상위)
    const parentType = parent?.type;
if (
  parentType === "page_id" ||
  parentType === "page" ||
  parentType === "block_id" ||
  parentType === "workspace"
) {
  const parentPageId = (parent?.page_id || parent?.block_id || parent?.id || "").replace(/-/g, "");
      if (parentPageId && excludedIds.pageIds.has(parentPageId)) continue;
      standalonePages.push(page);
    }
  }

  // DB 아이템 빌드
  const dbItems: UpdateItem[] = [];
  await Promise.allSettled(
    Array.from(dbMap.entries()).map(async ([dbId, page]) => {
      try {
        const db: any = await (notion as any).databases.retrieve({ database_id: dbId });
        const itemTitle = extractItemTitle(page);
        const isNew = page.created_time === page.last_edited_time;
        const action = itemTitle ? `${itemTitle} ${isNew ? "작성" : "수정"}` : "내용 업데이트";
        dbItems.push({
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

  // 독립 페이지 아이템 빌드 (오늘 생성이면 "새 페이지 등장")
  const pageItems: UpdateItem[] = standalonePages.map((page) => {
    const itemTitle = extractItemTitle(page);
    const createdToday = isCreatedTodaySeoul(page.created_time);
    const label = createdToday ? "새 페이지 등장" : "페이지 수정";
    const pageId = (page.id || "").replace(/-/g, "");
    return {
      entityId: pageId,
      entityType: "page" as const,
      title: `${itemTitle || "(페이지)"} - ${label}`,
      url: page.url,
      iconEmoji: parseEmojiIcon(page.icon),
      lastEditedTime: page.last_edited_time,
    };
  });

  // 숨김 아이템
  const hiddenItems: UpdateItem[] = [];
  if (excludedIds.dbIds.size > 0) {
    await Promise.allSettled(
      Array.from(excludedIds.dbIds).map(async (dbId) => {
        try {
          const db: any = await (notion as any).databases.retrieve({ database_id: dbId });
          const dsId = db?.data_sources?.[0]?.id || db?.data_sources?.[0]?.data_source?.id;
          if (!dsId) return;
          const resp2: any = await (notion as any).dataSources.query({ data_source_id: dsId, page_size: 5 });
          for (const page of resp2.results || []) {
            const itemTitle = extractItemTitle(page);
            const isNew = page.created_time === page.last_edited_time;
            const action = itemTitle ? `${itemTitle} ${isNew ? "작성" : "수정"}` : "내용 업데이트";
            hiddenItems.push({
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
  }

  const items = [...dbItems, ...pageItems].sort(
    (a, b) => (a.lastEditedTime < b.lastEditedTime ? 1 : -1)
  );
  hiddenItems.sort((a, b) => (a.lastEditedTime < b.lastEditedTime ? 1 : -1));

  return { items, hiddenItems };
}