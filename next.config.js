/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['@react-pdf/renderer'] },
  images: { domains: ['lh3.googleusercontent.com'] }
}
module.exports = nextConfig
