/** @type {import('next').NextConfig} */
const backendBase = (process.env.BACKEND_API_BASE || 'http://localhost:28761').replace(/\/$/, '')

const nextConfig = {

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
