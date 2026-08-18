/**
 * The title block every page opens with: an h1 and a one-line description, with
 * an optional action cluster on the right.
 *
 * Sized from the real headers: a `text-xl` h1 (28px line box) over a `text-sm`
 * subtitle with `mt-1` (20px), and a 36px button row — so the content below does
 * not shift when the page resolves.
 */
export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span
          aria-hidden
          className="block h-7 w-56 animate-pulse rounded-[var(--r-sm)] bg-surface-3"
        />
        <span
          aria-hidden
          className="mt-2 block h-5 w-72 animate-pulse rounded-[var(--r-sm)] bg-surface-3"
        />
      </div>
      {withAction ? (
        <span
          aria-hidden
          className="block h-9 w-44 animate-pulse rounded-[var(--r-sm)] bg-surface-3"
        />
      ) : null}
    </div>
  )
}
