/** Tiny inline SVG sparkline for metric cards — no chart library overhead. */
export function Sparkline({
  points,
  width = 72,
  height = 24,
  stroke = "#16a34a",
  fill = "rgba(22,163,74,0.12)",
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (points.length - 1);
  const coords = points.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${(width - pad).toFixed(1)},${height - pad}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polygon points={area} fill={fill} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={coords[coords.length - 1]![0]} cy={coords[coords.length - 1]![1]} r="2" fill={stroke} />
    </svg>
  );
}

/** Small up/down trend chip, e.g. "+12% vs last month". */
export function TrendChip({ delta, label }: { delta: number | null; label: string }) {
  if (delta == null) return null;
  const up = delta >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums " +
        (up
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300")
      }
      title={label}
    >
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
      <span className="sr-only"> {label}</span>
    </span>
  );
}
