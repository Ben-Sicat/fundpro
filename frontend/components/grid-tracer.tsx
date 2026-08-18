/**
 * Lights running along the background grid.
 *
 * Each one is an actual travelling light — a bright head with a tail streaming
 * behind it — not a gradient swept across the page. They follow orthogonal
 * routes on the same 32px lattice the grid is drawn on, turning at
 * intersections, so they read as current in a trace rather than decoration
 * floating over it.
 *
 * Built on CSS motion paths (`offset-path`), which is what makes the tail work:
 * with `offset-rotate: auto` the element turns to face its direction of travel,
 * so an elongated gradient anchored at its leading edge trails correctly and
 * swings around every corner. A stroke-dash animation cannot do that — the dash
 * has no orientation, which is why the first attempt read as a bar rather than
 * a light.
 *
 * Pure CSS: no JS, no canvas, no per-frame work. Coordinates are viewport
 * pixels because `.grid-lights` is a viewport-sized containing block, so the
 * routes land on the same lattice as the painted rules.
 */

/** Grid pitch, in px. Must match the 32px weave in globals.css. */
const CELL = 32

const c = (n: number) => n * CELL

interface Route {
  /** Orthogonal path on the lattice. Every turn lands on an intersection. */
  d: string
  /** Seconds for one traversal. Varied so the lights never form a pattern. */
  dur: number
  delay: number
  /** Tail length in px. Longer reads as faster. */
  tail: number
  /** Dimmer runs give depth — not every light is in the foreground. */
  dim?: boolean
}

const ROUTES: Route[] = [
  // Down the left column, then out across the field.
  { d: `M ${c(3)} ${c(-8)} V ${c(15)} H ${c(9)} V ${c(38)}`, dur: 14, delay: 0, tail: 190 },
  // Long horizontal run through the middle, stepping down twice.
  { d: `M ${c(-8)} ${c(7)} H ${c(20)} V ${c(20)} H ${c(45)} V ${c(34)}`, dur: 19, delay: 3, tail: 240 },
  // Enters top-right, cuts back left.
  { d: `M ${c(48)} ${c(-8)} V ${c(11)} H ${c(38)} V ${c(28)}`, dur: 12, delay: 7, tail: 160, dim: true },
  // Slow low sweep.
  { d: `M ${c(-8)} ${c(22)} H ${c(11)} V ${c(31)} H ${c(30)}`, dur: 23, delay: 1.5, tail: 210, dim: true },
  // Rises up the right-hand margin.
  { d: `M ${c(40)} ${c(38)} V ${c(13)} H ${c(50)}`, dur: 17, delay: 9.5, tail: 175 },
  // Counter-run, bottom-left to top-right.
  { d: `M ${c(14)} ${c(38)} V ${c(25)} H ${c(32)} V ${c(9)} H ${c(50)}`, dur: 26, delay: 5, tail: 200, dim: true },
]

export function GridTracer() {
  return (
    <div className="grid-lights" aria-hidden>
      {ROUTES.map((r, i) => (
        <span
          key={i}
          className={r.dim ? 'grid-light grid-light--dim' : 'grid-light'}
          style={
            {
              offsetPath: `path("${r.d}")`,
              width: `${r.tail}px`,
              animationDuration: `${r.dur}s`,
              animationDelay: `${r.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
