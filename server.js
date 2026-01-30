const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced User-Agent pool
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Enhanced headers factory
function getBrowserHeaders(url) {
  const urlObj = new URL(url);
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,it;q=0.8,nl;q=0.7,de;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'Referer': `${urlObj.protocol}//${urlObj.hostname}/`
  };
}

// Load stations data
let stationsData = [];
try {
  stationsData = require('./stations.json');
  console.log(`✓ Loaded ${stationsData.length} stations from stations.json`);
} catch (error) {
  console.log('⚠ stations.json not found');
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.static(__dirname, { index: false }));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stations: stationsData.length,
    version: '2.1',
    features: {
      stationSelector: true,
      enhancedProxy: true,
      retryMechanism: true,
      rateLimiting: true
    }
  });
});

// Get all stations
app.get('/stations/list', (req, res) => {
  res.json(stationsData);
});

// Search stations
app.get('/stations/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  
  if (!query) {
    return res.json([]);
  }

  const results = stationsData.filter(station => {
    return station.name.toLowerCase().includes(query) ||
           station.city.toLowerCase().includes(query) ||
           (station.code && station.code.toLowerCase().includes(query)) ||
           station.slug.toLowerCase().includes(query);
  }).slice(0, 10);

  res.json(results);
});

// Rate limiting - simple in-memory store
const requestLog = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = requestLog.get(ip) || [];
  
  // Clean old requests
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  recentRequests.push(now);
  requestLog.set(ip, recentRequests);
  return true;
}

// Enhanced fetch with retry and delay
async function fetchWithRetry(url, options, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add random delay between 500ms-1500ms to avoid rate limiting
      if (attempt > 1) {
        const randomDelay = 500 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }
      
      console.log(`[Attempt ${attempt}/${maxRetries}] Fetching: ${url}`);
      
      const response = await axios({
        ...options,
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });
      
      console.log(`✓ Success (${response.status}): ${url}`);
      return response;
      
    } catch (error) {
      lastError = error;
      console.log(`✗ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 5000);
        console.log(`  Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Main board proxy endpoint
app.get('/board', async (req, res) => {
  const stationSlug = req.query.station;
  const clientIp = req.ip || req.connection.remoteAddress;

  console.log(`\n🚂 Board request from ${clientIp}: station=${stationSlug}`);

  // Rate limiting check
  if (!checkRateLimit(clientIp)) {
    console.log(`⚠ Rate limit exceeded for ${clientIp}`);
    return res.status(429).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Too Many Requests</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
            text-align: center;
          }
          .warning-box {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #f39c12; font-size: 48px; margin: 0; }
          p { font-size: 18px; margin: 20px 0; }
          .tip { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="warning-box">
          <h1>⏱️</h1>
          <h2>请稍后再试</h2>
          <p>您的请求过于频繁，请等待1分钟后再试。</p>
          <div class="tip">
            <strong>提示</strong>: 为了保护铁路网站服务器，我们限制了请求频率。<br>
            每个IP每分钟最多 20 次请求。
          </div>
          <p><a href="/">← 返回首页</a></p>
        </div>
      </body>
      </html>
    `);
  }

  // Find station
  const station = stationsData.find(s => s.slug === stationSlug);

  if (!station) {
    console.log('✗ Station not found');
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Station Not Found</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .error-box {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #e74c3c; }
          a { color: #3498db; }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>🚫 Station Not Found</h1>
          <p>Cannot find station: <strong>${stationSlug || 'unknown'}</strong></p>
          <p><a href="/">← Back to station selector</a></p>
        </div>
      </body>
      </html>
    `);
  }

  console.log(`✓ Found station: ${station.name} (${station.type})`);
  console.log(`  URL: ${station.url}`);

  try {
    const headers = getBrowserHeaders(station.url);
    
    // Fetch with retry and delay
    const response = await fetchWithRetry(station.url, {
      method: 'GET',
      headers: headers,
      responseType: 'text'
    }, 3, 2000); // 3 retries, 2 second base delay

    let html = response.data;
    
    console.log(`✓ Received ${html.length} bytes`);

    // Process HTML
    if (station.type === 'RFI') {
      html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
      html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
      html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
      
    } else if (station.type === 'NS') {
      html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
      
    } else if (station.type === 'NationalRail') {
      if (html.includes('Show live trains') || html.includes('Station name or code')) {
        console.log('⚠ Received search form, trying alternative URL...');
        const altUrl = `https://ojp.nationalrail.co.uk/service/ldbboard/dep/${station.code}`;
        const altResponse = await fetchWithRetry(altUrl, {
          method: 'GET',
          headers: getBrowserHeaders(altUrl),
          responseType: 'text'
        }, 3, 2000);
        html = altResponse.data;
      }
      
      html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
      html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
      html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    }

    // Inject CSS
    const injectedCSS = `
      <style>
        header, footer, nav, 
        .header, .footer, .navigation,
        .cookie-banner, .gdpr-banner,
        .skiplink, .skip-link,
        [class*="cookie"], [class*="gdpr"],
        [id*="cookie"], [id*="gdpr"] {
          display: none !important;
        }
        body {
          margin: 0 !important;
          padding: 10px !important;
        }
      </style>
    `;

    if (html.includes('</head>')) {
      html = html.replace('</head>', `${injectedCSS}</head>`);
    } else {
      html = injectedCSS + html;
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
    console.log(`✓ Board served successfully for ${station.name}`);

  } catch (error) {
    console.error(`✗ Error fetching board for ${station.name}:`, error.message);
    
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Board Unavailable</title>
        <meta http-equiv="refresh" content="10">
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .error-box {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #e67e22; }
          .details {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
            font-family: monospace;
            font-size: 12px;
          }
          .auto-refresh {
            background: #d1ecf1;
            padding: 10px;
            border-radius: 5px;
            margin: 15px 0;
            color: #0c5460;
          }
          a { color: #3498db; }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>⚠️ Departure Board Temporarily Unavailable</h1>
          <p>Cannot load departure board for: <strong>${station.name}</strong></p>
          
          <div class="auto-refresh">
            ⏱️ 页面将在 10 秒后自动刷新重试...
          </div>
          
          <div class="details">
            <strong>Station:</strong> ${station.name} (${station.city}, ${station.country})<br>
            <strong>Type:</strong> ${station.type}<br>
            <strong>Error:</strong> ${error.message}<br>
            <strong>Source URL:</strong> ${station.url}
          </div>

          <p><strong>可能原因:</strong></p>
          <ul>
            <li>铁路网站临时维护或故障</li>
            <li>请求过于频繁触发了反爬虫保护</li>
            <li>网络连接问题</li>
          </ul>
          
          <p><strong>解决方法:</strong></p>
          <ul>
            <li><a href="javascript:location.reload()">立即刷新</a> (或等待自动刷新)</li>
            <li><a href="${station.url}" target="_blank">访问官方网站</a></li>
            <li><a href="/">尝试其他车站</a></li>
            <li>等待1-2分钟后再试</li>
          </ul>
        </div>
      </body>
      </html>
    `);
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚂 Train Station Departure Board Server v2.1`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`\n📍 Available endpoints:`);
  console.log(`   GET /                      → Station selector`);
  console.log(`   GET /health                → Health check`);
  console.log(`   GET /stations/list         → List stations`);
  console.log(`   GET /stations/search?q=    → Search`);
  console.log(`   GET /board?station=<slug>  → Departure board`);
  console.log(`\n✓ ${stationsData.length} stations loaded`);
  console.log(`✓ Enhanced proxy with rate limiting enabled`);
  console.log(`✓ Max 20 requests/minute per IP`);
  console.log(`✓ Auto-retry with delays\n`);
});
