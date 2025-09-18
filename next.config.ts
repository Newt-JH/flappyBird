import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // iframe 임베딩 허용을 위한 헤더 설정
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' *.treasurecomics.com *.vercel.app *.amazonaws.com *.s3.amazonaws.com *.cloudfront.net localhost:* 127.0.0.1:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
