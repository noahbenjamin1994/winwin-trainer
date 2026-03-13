/** @type {import('next').NextConfig} */
const backendBase = (process.env.BACKEND_API_BASE || 'http://localhost:8000').replace(/\/$/, '')

const nextConfig = {
  // 生产环境通过 BACKEND_API_BASE 指向后端；本地默认 localhost:8000
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
