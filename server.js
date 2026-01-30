const express = require('express');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const zlib = require('zlib');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// 速率限制
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: '⏱️ 请稍后再试',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.static('public'));
app.use(express.json());

// 加载车站数据
const stations = require('./stations.json');

// User-Agent 池
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// 原生 HTTP/HTTPS 请求函数（替代 axios）
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': options.userAgent || getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        ...options.headers
      },
      timeout: options.timeout || 30000,
    };

    const req = lib.request(requestOptions, (res) => {
      const chunks = [];
      let stream = res;
      
      // 处理压缩编码
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }
      
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const data = buffer.toString('utf8');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// 带重试的请求
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

// 瑞士 SBB JSON 格式化
function formatSwissBoard(jsonData) {
  const stationboard = jsonData.stationboard || [];
  
  let html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; background: linear-gradient(135deg, #E5007D 0%, #C90065 100%); min-height: 100vh;">
      <div style="max-width: 1200px; margin: 0 auto;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
          <h1 style="color: #E5007D; margin-bottom: 30px; font-size: 28px;">
            🇨🇭 ${jsonData.station?.name || 'Swiss Station'} - 实时出发
          </h1>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: linear-gradient(135deg, #E5007D 0%, #C90065 100%); color: white;">
                <th style="padding: 15px; text-align: left;">时间</th>
                <th style="padding: 15px; text-align: left;">列车</th>
                <th style="padding: 15px; text-align: left;">终点站</th>
                <th style="padding: 15px; text-align: left;">站台</th>
              </tr>
            </thead>
            <tbody>
  `;
  
  stationboard.forEach((train, index) => {
    const time = train.stop?.departure ? new Date(train.stop.departure).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const category = train.category || '';
    const number = train.number || '';
    const to = train.to || 'Unknown';
    const platform = train.stop?.platform || '-';
    
    const bgColor = index % 2 === 0 ? '#f8f9fa' : 'white';
    
    html += `
      <tr style="background: ${bgColor}; border-bottom: 1px solid #dee2e6;">
        <td style="padding: 15px; font-weight: bold;">${time}</td>
        <td style="padding: 15px; color: #E5007D;">${category} ${number}</td>
        <td style="padding: 15px;">${to}</td>
        <td style="padding: 15px; text-align: center; background: #E5007D; color: white; border-radius: 6px;">${platform}</td>
      </tr>
    `;
  });
  
  html += `
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  
  return html;
}

// 看板路由
app.get('/board', async (req, res) => {
  const stationSlug = req.query.station;
  
  if (!stationSlug) {
    return res.status(400).send('<h1>错误: 缺少车站参数</h1>');
  }

  const station = stations.find(s => s.slug === stationSlug);
  
  if (!station) {
    return res.status(404).send('<h1>车站未找到</h1>');
  }

  console.log(`[${new Date().toISOString()}] 请求车站: ${station.name} (${station.type})`);

  try {
    // 瑞士 SBB
    if (station.type === 'SBB') {
      const response = await fetchWithRetry(station.url, {
        headers: { 'Accept': 'application/json' }
      });
      const jsonData = JSON.parse(response.data);
      const html = formatSwissBoard(jsonData);
      return res.send(html);
    }

    // 法国 SNCF（暂不可用）
    if (station.type === 'SNCF') {
      return res.send(`
        <html>
          <head>
            <meta charset="UTF-8">
            <title>${station.name} - 功能开发中</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #E5007D 0%, #C90065 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 20px;
              }
              .container {
                background: white;
                border-radius: 12px;
                padding: 40px;
                text-align: center;
                max-width: 600px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
              }
              h1 {
                color: #E5007D;
                margin-bottom: 20px;
              }
              .info {
                color: #666;
                line-height: 1.6;
                margin: 20px 0;
              }
              .link {
                display: inline-block;
                background: linear-gradient(135deg, #E5007D 0%, #C90065 100%);
                color: white;
                padding: 12px 24px;
                border-radius: 6px;
                text-decoration: none;
                margin: 10px;
                transition: transform 0.2s;
              }
              .link:hover {
                transform: translateY(-2px);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🇫🇷 ${station.name}</h1>
              <p class="info">
                <strong>功能开发中</strong><br><br>
                SNCF Connect 官方看板暂不提供公开 API，我们正在研究替代方案。<br>
                请访问官方网站查看实时信息：
              </p>
              <a href="${station.url}" target="_blank" class="link">访问 SNCF Connect 官方网站</a>
              <a href="/" class="link">返回首页</a>
            </div>
          </body>
        </html>
      `);
    }

    // 其他类型（德国、奥地利、意大利、荷兰、英国）
    const response = await fetchWithRetry(station.url);
    const $ = cheerio.load(response.data);
    
    // 简单处理
    $('header, footer, nav').remove();
    
    return res.send($.html());

  } catch (error) {
    console.error(`错误: ${station.name}:`, error.message);
    
    res.status(500).send(`
      <html>
        <head><meta charset="UTF-8"><title>错误</title></head>
        <body style="text-align: center; padding: 50px;">
          <h1>数据暂时不可用</h1>
          <p>车站: ${station.name}</p>
          <a href="/">返回首页</a>
        </body>
      </html>
    `);
  }
});

// API
app.get('/stations/list', (req, res) => {
  res.json(stations);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    stations: stations.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚂 Train Board Server running on port ${PORT}`);
  console.log(`📊 Loaded ${stations.length} stations`);
});
