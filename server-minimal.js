// 最小化测试服务器 - 用于诊断
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting minimal server...');
console.log('📍 PORT:', PORT);
console.log('📍 NODE_ENV:', process.env.NODE_ENV || 'not set');

// 基础路由
app.get('/', (req, res) => {
  res.send(`
    <h1>✅ Server is Running!</h1>
    <p>Time: ${new Date().toISOString()}</p>
    <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    <p>Port: ${PORT}</p>
    <ul>
      <li><a href="/health">Health Check</a></li>
      <li><a href="/test">Test Page</a></li>
    </ul>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'not set'
  });
});

app.get('/test', (req, res) => {
  res.send('<h1>Test Page Works!</h1>');
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Internal Server Error');
});

// 启动服务器 - 明确监听 0.0.0.0
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Minimal server running on port ${PORT}`);
  console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
  console.log(`📅 Started at ${new Date().toISOString()}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('📥 SIGTERM received, closing server...');
  server.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📥 SIGINT received, closing server...');
  server.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});
