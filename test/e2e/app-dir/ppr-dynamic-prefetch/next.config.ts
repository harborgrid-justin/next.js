import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { dynamicIO: true, clientSegmentCache: true },
}

export default nextConfig
