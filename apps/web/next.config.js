/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/agents', destination: '/near-demo', permanent: false },
      { source: '/coin/:address', destination: '/token/:address', permanent: false },
      { source: '/trade/:address', destination: '/token/:address', permanent: false },
    ];
  },
};
module.exports = nextConfig;
