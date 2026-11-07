/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: '/api/near_api/:path*' },
    ];
  },
  async redirects() {
    return [
      ...['/launch', '/agents', '/leaderboard', '/fees', '/watchlist'].map((source) => ({ source, destination: '/near-demo', permanent: false })),
      { source: '/coin/:path*', destination: '/near-demo', permanent: false },
      { source: '/trade/:path*', destination: '/near-demo', permanent: false },
      { source: '/profile/:path*', destination: '/near-demo', permanent: false },
    ];
  },
};
module.exports = nextConfig;
