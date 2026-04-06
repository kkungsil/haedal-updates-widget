import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

export const HAEDAL_GENERATOR_DB_ID =
  process.env.HAEDAL_GENERATOR_DB_ID || "9ffed1ec637d4581a0fed495c17d05fc";

export type UpdateItem = {
  source: "generator_db" | "snapshot";
  title: string;
  url: string;
  iconEmoji?: string;
  lastEditedTime: string; // ISO
};

function parseEmojiIcon(icon: any): string | undefined {
  if (!icon) return undefined;
  if (icon.type === "emoji" && typeof icon.emoji === "string") return icon.emoji;
  return undefined;
}

function titleFromTitleProp(titleProp: any): string {
  if (titleProp?.type !== "title") return "(제목 없음)";
  const t = (titleProp.title || []).map((x: any) => x.plain_text).join("");
  return t || "(제목 없음)";
}

function extractTitle(page: any): string {
  if (page?.properties?.["제목"]) return titleFromTitleProp(page.properties["제목"]);
  if (page?.properties?.title) return titleFromTitleProp(page.properties.title);
  if (page?.properties?.["이름"]) return titleFromTitleProp(page.properties["이름"]);
  return "(제목 없음)";
}

export async function fetchGeneratorDbUpdates(): Promise<UpdateItem[]> {
  const dbId = HAEDAL_GENERATOR_DB_ID;

  const db: any = await (notion as any).databases.retrieve({
    database_id: dbId,
  });

  const dataSourceId =
    db?.data_sources?.[0]?.id || db?.data_sources?.[0]?.data_source?.id;

  if (!dataSourceId) {
    throw new Error("Could not find data_source_id from database.");
  }

  const results: UpdateItem[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const resp: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of resp.results || []) {
      results.push({
        source: "generator_db",
        title: extractTitle(page),
        url: page.url,
        iconEmoji: parseEmojiIcon(page.icon),
        lastEditedTime: page.last_edited_time,
      });
    }

    if (!resp.has_more) break;
    cursor = resp.next_cursor;
  }

  return results;
}

export async function fetchSnapshotUpdates(
  pageIdsOrUrls: string[],
): Promise<UpdateItem[]> {
  const pages = await Promise.all(
    pageIdsOrUrls.map(async (page_id) => {
      const page: any = await (notion as any).pages.retrieve({ page_id });

      return {
        source: "snapshot" as const,
        title: extractTitle(page),
        url: page.url,
        iconEmoji: parseEmojiIcon(page.icon),
        lastEditedTime: page.last_edited_time,
      };
    }),
  );

  return pages;
}