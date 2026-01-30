const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 简单健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Minimal test server' });
});

app.get('/', (req, res) => {
  res.send('<h1>Test Server Running</h1>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Test server running on port ${PORT}`);
});
