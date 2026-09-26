export function formatDuration(clockIn: string, clockOut: string | null): string {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  const minutes = Math.max(0, Math.floor((end - new Date(clockIn).getTime()) / 60000));
  return formatMinutes(minutes);
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}
