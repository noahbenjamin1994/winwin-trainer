/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许前端直接代理到本地后端（开发环境）
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
}

module.exports = nextConfig
