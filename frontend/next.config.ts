import path from 'path'
import { fileURLToPath } from 'url'
import type { NextConfig } from 'next'

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  turbopack: {
    root: frontendRoot,
  },
}

export default nextConfig
