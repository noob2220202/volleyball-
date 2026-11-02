// pm2 설정 : pm2 start ecosystem.config.js
// pm2 에 내장된 정적 파일 서버(serve)로 이 폴더를 띄웁니다.
module.exports = {
  apps: [
    {
      name: 'mallang-volley',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: __dirname,
        PM2_SERVE_PORT: 8080,
      },
    },
  ],
};
