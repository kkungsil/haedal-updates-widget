"use client";

import useSWR from "swr";
import { formatKoreanMonthDay } from "../lib/date";

type UpdateItem = {
  title: string;
  url: string;
  iconEmoji?: string;
  lastEditedTime: string;
};

type ApiResponse = {
  ok: boolean;
  items?: UpdateItem[];
  sources?: { generatorDb: number; snapshot: number };
  error?: { message?: string };
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function Home() {
  const { data, isLoading } = useSWR<ApiResponse>("/api/updates", fetcher, {
    refreshInterval: 60_000,
  });

  const styles: Record<string, React.CSSProperties> = {
    main: {
      padding: 16,
      fontFamily:
        'system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      background: "#fff",
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
    },
    subtitle: {
      fontSize: 12,
      color: "#888",
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
      background: "#fff",
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

  return (
    <main style={styles.main}>
      <div style={styles.header}>
        <div style={styles.title}>🦦 해달집 최근 업데이트</div>
        <div style={styles.subtitle}>TOP 10</div>
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
        {(data?.items || []).map((it) => (
          <a
            key={it.url}
            href={it.url}
            target="_blank"
            rel="noreferrer"
            style={styles.row}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#f7f7f7";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#fff";
            }}
          >
            <div style={styles.left}>
              <div style={styles.icon}>{it.iconEmoji || "📄"}</div>
              <div style={styles.text}>{it.title}</div>
            </div>

            <div style={styles.date}>
              {formatKoreanMonthDay(it.lastEditedTime)}
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}