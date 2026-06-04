import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // 브라우저(클라이언트) 오류를 dev 터미널로 전달하는 기능 끔.
    // 브라우저의 sessionStorage 보안오류가 처리되지 않은 rejection이 되어
    // dev 서버를 종료시키는 문제 방지. (16.2.7: logging.browserToTerminal)
    browserToTerminal: false,
  },
  experimental: {
    serverActions: {
      // 상담 캡처 이미지 여러 장 업로드 허용 (기본 1MB → 확대)
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
