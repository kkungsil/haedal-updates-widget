export function formatKoreanMonthDayTime(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true, // "오후/오전" 붙는 게 싫으면 false로
  });
  // 예: "4월 6일 오후 3:07" 처럼 나올 수 있음
  return fmt.format(d).replace(":", "시 ") + "분";
}