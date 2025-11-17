/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Ensure Next compiles our shared watchlist package */
  transpilePackages: ['@fin/watchlist']
}

module.exports = nextConfig
