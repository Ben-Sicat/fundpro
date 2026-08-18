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
     * `static: 0` covers the login and marketing routes for the same reason —
     * they are cheap, and a stale one is confusing rather than fast.
     *
     * The cost is a server render per navigation. That is the correct trade
     * for an operations console whose whole job is to show what is true now.
     */
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
}

export default nextConfig
