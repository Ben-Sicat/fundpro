import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Do not reuse a prefetched page from the client Router Cache.
     *
     * Navigating to a page the router already has serves that copy without
     * asking the server, so numbers fetched a minute ago reappear as if
     * current. During an import that is exactly wrong: the Overview shows one
     * total, Applications shows another, and neither says which is stale.
     *
     * `dynamic: 0` makes every navigation re-render on the server.
     *
     * `static` is deliberately left at its default. Setting it to 0 as well
     * meant every auto-refresh invalidated the prefetches behind all thirteen
     * nav links, so the router re-fetched the lot — bursts of eight-plus
     * renders a second showed up in the logs. Nav links now opt out of
     * prefetching instead (see components/shell/sidebar.tsx), which gets the
     * freshness without the churn.
     */
    staleTimes: {
      dynamic: 0,
    },
  },
}

export default nextConfig
