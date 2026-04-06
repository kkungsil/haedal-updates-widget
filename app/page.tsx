"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatKoreanMonthDayTime } from "../lib/date";

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
  sources?: { db: number; snapshot: number };
  refreshedAt?: string;
  cached?: boolean;
  error?: { message?: string };
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function isTodayInSeoul(iso: string) {
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()) === fmt.format(new Date(iso));
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    padding: 16,
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#fff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
  },
  refreshBtn: {
    fontSize: 11,
    color: "#888",
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: "2px 8px",
    cursor: "pointer",
  },
  meta: {
    fontSize: 11,
    color: "#aaa",
    marginBottom: 10,
  },
  hint: {
    color: "#888",
    fontSize: 13,
  },
  error: {
    color: "#b42318",
    fontSize: 13,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 10px",
    borderRadius: 8,
    textDecoration: "none",
    color: "#222",
    border: "1px solid #eee",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  icon: {
    width: 22,
    textAlign: "center",
    flexShrink: 0,
  },
  text: {
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  date: {
    fontSize: 12,
    color: "#777",
    flexShrink: 0,
  },
};

export default function Home() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, mutate } = useSWR<ApiResponse>("/api/updates", fetcher, {
    refreshInterval: 60_000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetch("/api/updates?force=1").then((r) => r.json());
      mutate(fresh, false);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main style={styles.main}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.title}>🦦 최근 업데이트된 해달집</div>
          <div style={styles.subtitle}>TOP 10</div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          style={styles.refreshBtn}
        >
          {refreshing ? "갱신 중…" : "↺ 새로고침"}
        </button>
      </div>

      <div style={styles.meta}>
        {data?.refreshedAt
          ? `최근 갱신: ${formatKoreanMonthDayTime(data.refreshedAt)}`
          : " "}
      </div>

      {isLoading && <div style={styles.hint}>불러오는 중…</div>}

      {!isLoading && data?.ok === false && (
        <div style={styles.error}>
          오류: {data?.error?.message || "알 수 없는 오류"}
        </div>
      )}

      {data?.ok && (data.items?.length || 0) === 0 && (
        <div style={styles.hint}>아직 조용해… 🦦</div>
      )}

      <div style={styles.list}>
        {(data?.items || []).map((it) => {
          const today = isTodayInSeoul(it.lastEditedTime);
          const rowStyle: React.CSSProperties = {
            ...styles.row,
            background: today ? "#fff9db" : "#fff",
          };
          return (
            <a
              key={it.entityId}
              href={it.url}
              target="_blank"
              rel="noreferrer"
              style={rowStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background =
                  today ? "#fff3bf" : "#f7f7f7";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background =
                  today ? "#fff9db" : "#fff";
              }}
            >
              <div style={styles.left}>
                <div style={styles.icon}>
                  {it.iconEmoji || "🦤"}
                </div>
                <div style={styles.text}>{it.title}</div>
              </div>
              <div style={styles.date}>
                {formatKoreanMonthDayTime(it.lastEditedTime)}
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}