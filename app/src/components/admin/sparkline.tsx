/**
 * Спарклайн регистраций (§4.10).
 *
 * Инлайновый SVG вместо графической библиотеки: на дашборде нужен один
 * график из тридцати точек, а любой пакет чартов весит больше всей админки.
 * Серверный компонент — интерактивности здесь нет.
 */
export function Sparkline({
  points,
  emptyLabel,
  locale,
}: {
  points: { date: string; count: number }[];
  emptyLabel: string;
  locale: string;
}) {
  if (points.length < 2) {
    return <p className="text-sm text-fg-muted">{emptyLabel}</p>;
  }

  const width = 600;
  const height = 120;
  const max = Math.max(...points.map((point) => point.count), 1);

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - (point.count / max) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const total = points.reduce((sum, point) => sum + point.count, 0);

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-28 w-full"
        role="img"
        aria-label={`${total}`}
        preserveAspectRatio="none"
      >
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="var(--pf-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <figcaption className="flex justify-between text-xs text-fg-muted">
        <span>{points[0]?.date}</span>
        <span className="font-mono">{total.toLocaleString(locale)}</span>
        <span>{points.at(-1)?.date}</span>
      </figcaption>
    </figure>
  );
}
