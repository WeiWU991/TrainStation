const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 速率限制：每个 IP 每分钟最多 20 次请求
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: '⏱️ 请稍后再试 (Too many requests)',
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
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// 随机延迟
function randomDelay() {
  const delay = Math.floor(Math.random() * 1000) + 500; // 500-1500ms
  return new Promise(resolve => setTimeout(resolve, delay));
}

// 带重试的请求函数
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await randomDelay();
      
      const response = await axios({
        ...options,
        url,
        timeout: 30000,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
          ...options.headers
        }
      });
      
      return response;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // 指数退避
    }
  }
}

// 处理瑞士 SBB JSON API
function formatSwissBoard(jsonData) {
  const stationboard = jsonData.stationboard || [];
  
  let html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh;">
      <div style="max-width: 1200px; margin: 0 auto;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
          <h1 style="color: #667eea; margin-bottom: 30px; font-size: 28px;">
            🇨🇭 ${jsonData.station?.name || 'Swiss Station'} - 实时出发
          </h1>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <th style="padding: 15px; text-align: left;">时间</th>
                <th style="padding: 15px; text-align: left;">列车</th>
                <th style="padding: 15px; text-align: left;">终点站</th>
                <th style="padding: 15px; text-align: left;">站台</th>
                <th style="padding: 15px; text-align: left;">状态</th>
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
    
    // 延误信息
    let delay = '';
    if (train.stop?.delay) {
      delay = `<span style="color: #e74c3c;">+${train.stop.delay}'</span>`;
    }
    
    const bgColor = index % 2 === 0 ? '#f8f9fa' : 'white';
    
    html += `
      <tr style="background: ${bgColor}; border-bottom: 1px solid #dee2e6;">
        <td style="padding: 15px; font-weight: bold; color: #2c3e50;">${time}</td>
        <td style="padding: 15px; color: #667eea; font-weight: 600;">${category} ${number}</td>
        <td style="padding: 15px; color: #34495e;">${to}</td>
        <td style="padding: 15px; text-align: center; background: #667eea; color: white; font-weight: bold; border-radius: 6px;">${platform}</td>
        <td style="padding: 15px; color: #27ae60; font-weight: 600;">${delay || 'On time'}</td>
      </tr>
    `;
  });
  
  html += `
            </tbody>
          </table>
          <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
            <p style="color: #7f8c8d; margin: 0;">
              📊 数据来源: <a href="https://transport.opendata.ch" style="color: #667eea; text-decoration: none;">Swiss Open Transport Data</a>
            </p>
            <button onclick="location.reload()" style="margin-top: 15px; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600;">
              🔄 刷新
            </button>
          </div>
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
    return res.status(400).send(`
      <html>
        <head><meta charset="UTF-8"><title>错误</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ 缺少车站参数</h1>
          <p>请在 URL 中指定车站，例如: /board?station=zurich-hauptbahnhof</p>
          <a href="/" style="color: #3498db;">返回首页</a>
        </body>
      </html>
    `);
  }

  const station = stations.find(s => s.slug === stationSlug);
  
  if (!station) {
    return res.status(404).send(`
      <html>
        <head><meta charset="UTF-8"><title>车站未找到</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <h1 style="color: #e74c3c;">🚫 车站未找到</h1>
          <p>车站 "${stationSlug}" 不存在</p>
          <a href="/" style="color: #3498db;">返回首页</a>
        </body>
      </html>
    `);
  }

  console.log(`[${new Date().toISOString()}] 请求车站: ${station.name} (${station.type})`);
  console.log(`[${new Date().toISOString()}] URL: ${station.url}`);

  try {
    // 瑞士 SBB - JSON API
    if (station.type === 'SBB') {
      console.log('[SBB] 使用瑞士开放数据 API');
      const response = await fetchWithRetry(station.url, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const html = formatSwissBoard(response.data);
      return res.send(html);
    }

    // 德国 DB - bahn.expert
    if (station.type === 'DB') {
      console.log('[DB] 使用 bahn.expert');
      const response = await fetchWithRetry(station.url);
      
      // bahn.expert 已经是完整的网页，直接返回
      let html = response.data;
      
      // 注入自动刷新和样式
      html = html.replace('</head>', `
        <script>
          setTimeout(() => location.reload(), 60000); // 60秒自动刷新
        </script>
        <style>
          body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; }
        </style>
        </head>
      `);
      
      return res.send(html);
    }

    // 奥地利 OBB
    if (station.type === 'OBB') {
      console.log('[OBB] 使用 ÖBB 官方');
      const response = await fetchWithRetry(station.url);
      
      const $ = cheerio.load(response.data);
      
      // 移除不需要的元素
      $('header, footer, nav, .cookie-banner, .advertisement').remove();
      
      // 注入样式
      $('head').append(`
        <style>
          body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            padding: 20px !important;
          }
          .content {
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 1200px;
            margin: 0 auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
        </style>
        <script>
          setTimeout(() => location.reload(), 60000);
        </script>
      `);
      
      $('body').wrapInner('<div class="content"></div>');
      
      return res.send($.html());
    }

    // 意大利 RFI
    if (station.type === 'RFI') {
      console.log('[RFI] 使用意大利 RFI 官方');
      const response = await fetchWithRetry(station.url);
      
      const $ = cheerio.load(response.data);
      $('header, footer, nav, .cookie-banner').remove();
      
      $('head').append(`
        <style>
          body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            padding: 20px !important;
          }
        </style>
        <script>
          setTimeout(() => location.reload(), 60000);
        </script>
      `);
      
      return res.send($.html());
    }

    // 荷兰 NS
    if (station.type === 'NS') {
      console.log('[NS] 使用荷兰 NS 官方');
      const response = await fetchWithRetry(station.url);
      
      const $ = cheerio.load(response.data);
      $('header, nav').remove();
      
      $('head').append(`
        <style>
          body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            padding: 20px !important;
          }
        </style>
        <script>
          setTimeout(() => location.reload(), 60000);
        </script>
      `);
      
      return res.send($.html());
    }

    // 法国 SNCF (暂时不可用)
    if (station.type === 'SNCF') {
      console.log('[SNCF] 法国 SNCF 暂时不可用');
      return res.status(503).send(`
        <html>
          <head>
            <meta charset="UTF-8">
            <title>功能开发中</title>
          </head>
          <body style="font-family: Arial; padding: 50px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <div style="background: white; border-radius: 12px; padding: 40px; max-width: 600px; margin: 0 auto; box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
              <h1 style="color: #f39c12; margin-bottom: 20px;">🚧 功能开发中</h1>
              <p style="color: #7f8c8d; font-size: 16px; line-height: 1.6;">
                车站: <strong>${station.name}</strong><br>
                国家: <strong>法国 🇫🇷</strong>
              </p>
              <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-radius: 8px; text-align: left;">
                <strong style="color: #856404;">📋 说明:</strong>
                <ul style="color: #856404; margin: 10px 0 0 20px; text-align: left;">
                  <li>法国 SNCF 没有提供公开的实时看板 API</li>
                  <li>我们正在寻找替代解决方案</li>
                  <li>暂时请使用 <a href="https://www.sncf-connect.com" target="_blank" style="color: #3498db;">SNCF Connect 官方网站</a></li>
                </ul>
              </div>
              <div style="margin-top: 20px;">
                <a href="/" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  🏠 返回首页
                </a>
              </div>
            </div>
          </body>
        </html>
      `);
    }

    // 英国 National Rail
    if (station.type === 'NationalRail') {
      console.log('[NationalRail] 使用英国 National Rail');
      const response = await fetchWithRetry(station.url);
      
      const $ = cheerio.load(response.data);
      
      // 检测是否显示了搜索表单（说明 URL 格式不对）
      if ($('form').length > 0 && $('input[name="station"]').length > 0) {
        console.log('[NationalRail] 检测到搜索表单，切换到备用 URL');
        const alternateUrl = `https://ojp.nationalrail.co.uk/service/ldbboard/dep/${station.code}`;
        const altResponse = await fetchWithRetry(alternateUrl);
        return res.send(altResponse.data);
      }
      
      return res.send(response.data);
    }

    // 未知类型
    throw new Error(`不支持的车站类型: ${station.type}`);

  } catch (error) {
    console.error(`[错误] ${station.name}:`, error.message);
    
    res.status(500).send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>数据加载失败</title>
          <meta http-equiv="refresh" content="10">
        </head>
        <body style="font-family: Arial; padding: 50px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <div style="background: white; border-radius: 12px; padding: 40px; max-width: 600px; margin: 0 auto; box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
            <h1 style="color: #e74c3c; margin-bottom: 20px;">⚠️ 数据暂时不可用</h1>
            <p style="color: #7f8c8d; font-size: 16px; line-height: 1.6;">
              车站: <strong>${station.name}</strong><br>
              类型: <strong>${station.type}</strong><br>
              错误: ${error.message}
            </p>
            <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
              <p style="color: #3498db; margin: 0;">⏱️ 页面将在 10 秒后自动刷新...</p>
            </div>
            <div style="margin-top: 20px;">
              <button onclick="location.reload()" style="padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600; margin-right: 10px;">
                🔄 立即刷新
              </button>
              <a href="/" style="display: inline-block; padding: 12px 30px; background: #95a5a6; color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                🏠 返回首页
              </a>
            </div>
            <div style="margin-top: 30px; padding: 15px; background: #fff3cd; border-radius: 8px; text-align: left;">
              <strong style="color: #856404;">🔍 可能原因:</strong>
              <ul style="color: #856404; margin: 10px 0 0 20px;">
                <li>车站网站暂时维护</li>
                <li>网络连接问题</li>
                <li>请求频率过高（请稍后重试）</li>
              </ul>
            </div>
            <p style="margin-top: 20px; color: #95a5a6; font-size: 14px;">
              📊 数据源: ${station.url}
            </p>
          </div>
        </body>
      </html>
    `);
  }
});

// 车站列表 API
app.get('/stations/list', (req, res) => {
  res.json(stations);
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    stations: stations.length,
    timestamp: new Date().toISOString()
  });
});

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚂 Train Board Server running on port ${PORT}`);
  console.log(`📊 Loaded ${stations.length} stations`);
  
  // 统计车站类型
  const types = {};
  stations.forEach(s => {
    types[s.type] = (types[s.type] || 0) + 1;
  });
  console.log('📍 Station types:', types);
});
