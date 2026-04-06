"use client";

import { useState } from "react";
import useSWR from "swr";

type UpdateItem = {
  entityId: string;
  entityType: "db" | "page";
  title: string;
  url: string;
  iconEmoji?: string;
  lastEditedTime: string;
};

type ApiResponse = {
  ok: boolean;
  items?: UpdateItem[];
  hiddenItems?: UpdateItem[];
  refreshedAt?: string;
  sources?: { db: number; snapshot: number; hidden: number };
  error?: { message?: string };
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function formatKoreanTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todaySeoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const itemSeoul = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const isToday =
    todaySeoul.getFullYear() === itemSeoul.getFullYear() &&
    todaySeoul.getMonth() === itemSeoul.getMonth() &&
    todaySeoul.getDate() === itemSeoul.getDate();
  if (isToday) {
    return d.toLocaleTimeString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}

function isTodaySeoul(iso: string): boolean {
  const now = new Date();
  const todaySeoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const itemSeoul = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return (
    todaySeoul.getFullYear() === itemSeoul.getFullYear() &&
    todaySeoul.getMonth() === itemSeoul.getMonth() &&
    todaySeoul.getDate() === itemSeoul.getDate()
  );
}

const S: Record<string, React.CSSProperties> = {
  main: { padding: 16, fontFamily: "ui-sans-serif, system-ui, -apple-system" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 600 },
  refreshBtn: { fontSize: 12, color: "#888", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4 },
  tabs: { display: "flex", gap: 4, marginBottom: 12 },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  empty: { color: "#888", fontSize: 13 },
  error: { color: "#b42318", fontSize: 13 },
  refreshedAt: { marginTop: 10, fontSize: 11, color: "#bbb", textAlign: "right" },
  itemBase: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 10px", borderRadius: 8, textDecoration: "none", color: "#222", border: "1px solid #eee" },
  itemLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  itemIcon: { width: 22, textAlign: "center" },
  itemTitle: { fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  itemDate: { fontSize: 12, color: "#777", flexShrink: 0 },
};

function ItemRow({ it }: { it: UpdateItem }) {
  const isToday = isTodaySeoul(it.lastEditedTime);
  const normalBg = isToday ? "#fff9db" : "#fff";
  const hoverBg = isToday ? "#fff3bf" : "#f7f7f7";
  const rowStyle: React.CSSProperties = { ...S.itemBase, background: normalBg };

  return (
    <a
      href={it.url}
      target="_blank"
      rel="noreferrer"
      style={rowStyle}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = normalBg; }}
    >
      <div style={S.itemLeft}>
        <div style={S.itemIcon}>{it.iconEmoji || "🦤"}</div>
        <div style={S.itemTitle}>{it.title}</div>
      </div>
      <div style={S.itemDate}>{formatKoreanTime(it.lastEditedTime)}</div>
    </a>
  );
}

function ItemList({ items }: { items: UpdateItem[] }) {
  if (items.length === 0) return <div style={S.empty}>조용해… 🦦</div>;
  return (
    <div style={S.list}>
      {items.map((it) => (
        <ItemRow key={it.entityId + it.lastEditedTime} it={it} />
      ))}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<"main" | "hidden">("main");
  const { data, isLoading, mutate } = useSWR<ApiResponse>("/api/updates", fetcher, {
    refreshInterval: 60_000,
  });

  const handleRefresh = () =>
    mutate(fetch("/api/updates?force=1").then((r) => r.json()));

  const activeTab: React.CSSProperties = { fontSize: 13, padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#222", color: "#fff", fontWeight: 600 };
  const inactiveTab: React.CSSProperties = { fontSize: 13, padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", color: "#555", fontWeight: 400 };

  const hiddenCount = data?.hiddenItems?.length || 0;

  return (
    <main style={S.main}>
      <div style={S.header}>
        <div style={S.title}>🦦 최근 업데이트된 해달집</div>
        <button style={S.refreshBtn} onClick={handleRefresh}>↺ 새로고침</button>
      </div>

      <div style={S.tabs}>
        <button style={tab === "main" ? activeTab : inactiveTab} onClick={() => setTab("main")}>
          🏠 업데이트
        </button>
        <button style={tab === "hidden" ? activeTab : inactiveTab} onClick={() => setTab("hidden")}>
          🙈 숨김된 기록{hiddenCount > 0 ? " (" + hiddenCount + ")" : ""}
        </button>
      </div>

      {isLoading && <div style={S.empty}>불러오는 중…</div>}
      {!isLoading && data?.ok === false && (
        <div style={S.error}>오류: {data?.error?.message || "알 수 없는 오류"}</div>
      )}
      {!isLoading && data?.ok && (
        tab === "main"
          ? <ItemList items={data.items || []} />
          : <ItemList items={data.hiddenItems || []} />
      )}

      {data?.refreshedAt && (
        <div style={S.refreshedAt}>최근 갱신: {formatKoreanTime(data.refreshedAt)}</div>
      )}
    </main>
  );
}