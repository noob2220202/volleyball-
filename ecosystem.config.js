// pm2 설정 : pm2 start ecosystem.config.js
// 게임 서버(게임 파일 + 온라인 대전)를 실행합니다.
module.exports = {
  apps: [
    {
      name: 'mallang-volley',
      script: 'server/server.js',
      cwd: __dirname,
      env: { PORT: 8080 },
    },
  ],
};
