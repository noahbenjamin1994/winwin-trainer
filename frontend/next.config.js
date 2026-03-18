/** @type {import('next').NextConfig} */
const backendBase = (process.env.BACKEND_API_BASE || 'http://localhost:28761').replace(/\/$/, '')
const isCapacitor = process.env.CAPACITOR_BUILD === '1'

const nextConfig = isCapacitor
  ? { output: 'export' }
  : {
      async rewrites() {
        return [
          {
            source: '/api/:path*',
            destination: `${backendBase}/api/:path*`,
          },
        ]
      },
    }

module.exports = nextConfig
