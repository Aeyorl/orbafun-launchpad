/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      ...['/agents', '/leaderboard', '/fees', '/watchlist'].map((source) => ({ source, destination: '/near-demo', permanent: false })),
      { source: '/coin/:path*', destination: '/near-demo', permanent: false },
      { source: '/trade/:path*', destination: '/near-demo', permanent: false },
      { source: '/profile/:path*', destination: '/near-demo', permanent: false },
    ];
  },
};
module.exports = nextConfig;
