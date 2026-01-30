/**
 * Train Station Departure Board Proxy Server V2
 * 支持全欧洲所有主要车站
 * 
 * 新功能:
 * - 动态车站查询（支持模糊搜索）
 * - 8个国家支持
 * - 车站列表API
 * - 多语言搜索
 */

const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false
}));

// JSON 解析
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

/**
 * 加载车站数据
 */
let stationsData = null;

function loadStations() {
  try {
    const stationsPath = path.join(__dirname, 'stations.json');
    if (fs.existsSync(stationsPath)) {
      const data = fs.readFileSync(stationsPath, 'utf-8');
      stationsData = JSON.parse(data);
      console.log(`✅ 已加载 ${stationsData.totalStations} 个车站数据`);
    } else {
      console.warn('⚠️  stations.json 不存在，将使用备用数据');
      stationsData = getBackupStations();
    }
  } catch (error) {
    console.error('❌ 加载车站数据失败:', error.message);
    stationsData = getBackupStations();
  }
}

/**
 * 备用车站数据（如果JSON文件不存在）
 */
function getBackupStations() {
  return {
    lastUpdated: new Date().toISOString(),
    totalStations: 20,
    countries: { IT: 2, NL: 3, DE: 5, CH: 2, UK: 5, FR: 3 },
    stations: [
      // 意大利
      { country: 'IT', code: '1728', name: 'Milano Centrale', city: 'Milan', slug: 'milano-centrale', type: 'RFI',
        url: 'https://iechub.rfi.it/ArriviPartenze/en/ArrivalsDepartures/Monitor?Arrivals=False&PlaceId=1728' },
      { country: 'IT', code: '1802', name: 'Roma Termini', city: 'Rome', slug: 'roma-termini', type: 'RFI',
        url: 'https://iechub.rfi.it/ArriviPartenze/en/ArrivalsDepartures/Monitor?Arrivals=False&PlaceId=1802' },
      
      // 荷兰
      { country: 'NL', code: 'ASD', name: 'Amsterdam Centraal', city: 'Amsterdam', slug: 'amsterdam-centraal', type: 'NS',
        url: 'https://www.ns.nl/reisinformatie/externe-schermen/treinen/vertrektijden?stationId=ASD&columns=1' },
      { country: 'NL', code: 'RTD', name: 'Rotterdam Centraal', city: 'Rotterdam', slug: 'rotterdam-centraal', type: 'NS',
        url: 'https://www.ns.nl/reisinformatie/externe-schermen/treinen/vertrektijden?stationId=RTD&columns=1' },
      { country: 'NL', code: 'UT', name: 'Utrecht Centraal', city: 'Utrecht', slug: 'utrecht-centraal', type: 'NS',
        url: 'https://www.ns.nl/reisinformatie/externe-schermen/treinen/vertrektijden?stationId=UT&columns=1' },
      
      // 德国
      { country: 'DE', code: 'Berlin Hbf', name: 'Berlin Hauptbahnhof', city: 'Berlin', slug: 'berlin-hauptbahnhof', type: 'DB',
        url: 'https://reiseauskunft.bahn.de/bin/bhftafel.exe/dn?input=Berlin Hbf&boardType=dep&time=actual&start=yes' },
      { country: 'DE', code: 'München Hbf', name: 'München Hauptbahnhof', city: 'Munich', slug: 'munchen-hauptbahnhof', type: 'DB',
        url: 'https://reiseauskunft.bahn.de/bin/bhftafel.exe/dn?input=München Hbf&boardType=dep&time=actual&start=yes' },
      { country: 'DE', code: 'Frankfurt(Main)Hbf', name: 'Frankfurt Hauptbahnhof', city: 'Frankfurt', slug: 'frankfurt-hauptbahnhof', type: 'DB',
        url: 'https://reiseauskunft.bahn.de/bin/bhftafel.exe/dn?input=Frankfurt(Main)Hbf&boardType=dep&time=actual&start=yes' },
      { country: 'DE', code: 'Hamburg Hbf', name: 'Hamburg Hauptbahnhof', city: 'Hamburg', slug: 'hamburg-hauptbahnhof', type: 'DB',
        url: 'https://reiseauskunft.bahn.de/bin/bhftafel.exe/dn?input=Hamburg Hbf&boardType=dep&time=actual&start=yes' },
      { country: 'DE', code: 'Köln Hbf', name: 'Köln Hauptbahnhof', city: 'Cologne', slug: 'koln-hauptbahnhof', type: 'DB',
        url: 'https://reiseauskunft.bahn.de/bin/bhftafel.exe/dn?input=Köln Hbf&boardType=dep&time=actual&start=yes' },
      
      // 瑞士
      { country: 'CH', code: 'Zürich HB', name: 'Zürich HB', city: 'Zurich', slug: 'zurich-hb', type: 'SBB',
        url: 'https://mesdeparts.ch/Zürich HB' },
      { country: 'CH', code: 'Genève', name: 'Genève', city: 'Geneva', slug: 'geneve', type: 'SBB',
        url: 'https://mesdeparts.ch/Genève' },
      
      // 英国
      { country: 'UK', code: 'EUS', name: 'London Euston', city: 'London', slug: 'london-euston', type: 'NationalRail',
        url: 'https://ojp.nationalrail.co.uk/service/ldbboard/dep/EUS' },
      { country: 'UK', code: 'VIC', name: 'London Victoria', city: 'London', slug: 'london-victoria', type: 'NationalRail',
        url: 'https://ojp.nationalrail.co.uk/service/ldbboard/dep/VIC' },
      { country: 'UK', code: 'KGX', name: 'London Kings Cross', city: 'London', slug: 'london-kings-cross', type: 'NationalRail',
        url: 'https://ojp.nationalrail.co.uk/service/ldbboard/dep/KGX' },
      { country: 'UK', code: 'MAN', name: 'Manchester Piccadilly', city: 'Manchester', slug: 'manchester-piccadilly', type: 'NationalRail',
        url: 'https://ojp.nationalrail.co.uk/service/ldbboard/dep/MAN' },
      { country: 'UK', code: 'BHM', name: 'Birmingham New Street', city: 'Birmingham', slug: 'birmingham-new-street', type: 'NationalRail',
        url: 'https://ojp.nationalrail.co.uk/service/ldbboard/dep/BHM' },
      
      // 法国
      { country: 'FR', code: 'frpst', name: 'Paris Gare du Nord', city: 'Paris', slug: 'paris-gare-du-nord', type: 'SNCF',
        url: 'https://www.garesetconnexions.sncf/fr/gare/frpst/paris-gare-du-nord/departs' },
      { country: 'FR', code: 'frply', name: 'Paris Gare de Lyon', city: 'Paris', slug: 'paris-gare-de-lyon', type: 'SNCF',
        url: 'https://www.garesetconnexions.sncf/fr/gare/frply/paris-gare-de-lyon/departs' },
      { country: 'FR', code: 'frlpd', name: 'Lyon Part-Dieu', city: 'Lyon', slug: 'lyon-part-dieu', type: 'SNCF',
        url: 'https://www.garesetconnexions.sncf/fr/gare/frlpd/lyon-part-dieu/departs' },
    ]
  };
}

// 启动时加载车站数据
loadStations();

/**
 * User-Agent 池
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 搜索车站（支持模糊匹配）
 */
function searchStations(query) {
  if (!query || !stationsData) return [];
  
  const searchTerm = query.toLowerCase().trim();
  
  return stationsData.stations.filter(station => {
    return (
      station.name.toLowerCase().includes(searchTerm) ||
      (station.nameEn && station.nameEn.toLowerCase().includes(searchTerm)) ||
      station.city.toLowerCase().includes(searchTerm) ||
      station.slug.includes(searchTerm) ||
      station.code.toLowerCase().includes(searchTerm)
    );
  });
}

/**
 * 根据 slug 或 code 精确查找车站
 */
function findStation(identifier) {
  if (!identifier || !stationsData) return null;
  
  const searchTerm = identifier.toLowerCase().trim();
  
  return stationsData.stations.find(station => 
    station.slug === searchTerm || 
    station.code.toLowerCase() === searchTerm
  );
}

/**
 * HTML 处理函数
 */
function processHTML(html, baseUrl, stationType) {
  let processedHtml = html;
  
  // URL 转换
  processedHtml = processedHtml.replace(/href=["']\/(?!\/)/g, `href="${baseUrl}/`);
  processedHtml = processedHtml.replace(/src=["']\/(?!\/)/g, `src="${baseUrl}/`);
  processedHtml = processedHtml.replace(/action=["']\/(?!\/)/g, `action="${baseUrl}/`);
  processedHtml = processedHtml.replace(/url\(["']?\/(?!\/)/g, `url("${baseUrl}/`);
  processedHtml = processedHtml.replace(/href=["']\/\//g, 'href="https://');
  processedHtml = processedHtml.replace(/src=["']\/\//g, 'src="https://');
  
  // CSS 注入
  const customCSS = `
    <style>
      header, footer, .header, .footer, .navigation, .nav, .menu,
      .cookie-consent, .cookie-banner, .cookie-notice, .gdpr-banner,
      .advertisement, .ads, .sidebar, .breadcrumb, .breadcrumbs,
      .search-bar, .login, .sign-in, .user-menu,
      #header, #footer, #navigation, #cookie-consent, #cookie-banner,
      [class*="cookie"], [id*="cookie"], [class*="gdpr"],
      [class*="privacy-banner"], [class*="consent"] {
        display: none !important;
      }
      
      body {
        margin: 0;
        padding: 0;
        overflow-x: hidden;
      }
      
      ${stationType === 'IT' ? '.top-bar, .main-navigation, .footer-links { display: none !important; }' : ''}
      ${stationType === 'DE' ? '.header-wrapper, .footer-wrapper, .db-navigation { display: none !important; }' : ''}
      ${stationType === 'NL' ? '.ns-header, .ns-footer, .ns-navigation { display: none !important; }' : ''}
      ${stationType === 'UK' ? '.nr-header, .nr-footer { display: none !important; }' : ''}
      ${stationType === 'FR' ? '.sncf-header, .sncf-footer { display: none !important; }' : ''}
      
      * {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
    </style>
  `;
  
  if (processedHtml.includes('</head>')) {
    processedHtml = processedHtml.replace('</head>', `${customCSS}</head>`);
  } else if (processedHtml.includes('<body')) {
    processedHtml = processedHtml.replace(/<body[^>]*>/, `$&${customCSS}`);
  } else {
    processedHtml = customCSS + processedHtml;
  }
  
  // Meta 标签
  const metaTag = '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0">';
  
  if (processedHtml.includes('</head>')) {
    processedHtml = processedHtml.replace('</head>', `${metaTag}</head>`);
  } else {
    processedHtml = metaTag + processedHtml;
  }
  
  return processedHtml;
}

/**
 * GET /stations/search - 搜索车站
 */
app.get('/stations/search', (req, res) => {
  const query = req.query.q;
  
  if (!query) {
    return res.status(400).json({
      error: 'Missing query parameter',
      usage: '/stations/search?q=milan'
    });
  }
  
  const results = searchStations(query);
  
  res.json({
    query,
    count: results.length,
    results: results.map(s => ({
      country: s.country,
      code: s.code,
      name: s.name,
      city: s.city,
      slug: s.slug,
      boardUrl: `/board?station=${s.slug}`
    }))
  });
});

/**
 * GET /stations/list - 获取所有车站列表
 */
app.get('/stations/list', (req, res) => {
  const country = req.query.country;
  
  let stations = stationsData ? stationsData.stations : [];
  
  if (country) {
    stations = stations.filter(s => s.country === country.toUpperCase());
  }
  
  res.json({
    totalStations: stations.length,
    countries: stationsData ? stationsData.countries : {},
    stations: stations.map(s => ({
      country: s.country,
      code: s.code,
      name: s.name,
      city: s.city,
      slug: s.slug
    }))
  });
});

/**
 * GET /board?station=milano-centrale - 主代理端点
 */
app.get('/board', async (req, res) => {
  const startTime = Date.now();
  const stationIdentifier = req.query.station || req.query.city;
  
  if (!stationIdentifier) {
    return res.status(400).send('Bad Request: Missing "station" parameter. Usage: /board?station=milano-centrale');
  }
  
  const station = findStation(stationIdentifier);
  
  if (!station) {
    console.log(`[ERROR] Unknown station: ${stationIdentifier}`);
    
    // 尝试搜索
    const suggestions = searchStations(stationIdentifier).slice(0, 5);
    
    return res.status(404).json({
      error: 'Station not found',
      identifier: stationIdentifier,
      suggestions: suggestions.map(s => ({
        name: s.name,
        city: s.city,
        country: s.country,
        slug: s.slug,
        url: `/board?station=${s.slug}`
      })),
      usage: '/board?station=milano-centrale'
    });
  }
  
  console.log(`[INFO] Fetching departure board for: ${station.name} (${station.country})`);
  
  try {
    const response = await axios.get(station.url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
      },
      timeout: 20000,
      maxRedirects: 5,
    });
    
    const baseUrl = new URL(station.url).origin;
    const processedHtml = processHTML(response.data, baseUrl, station.country);
    
    const duration = Date.now() - startTime;
    console.log(`[SUCCESS] Served ${station.name} in ${duration}ms`);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Station-Name', station.name);
    res.setHeader('X-Station-Country', station.country);
    
    res.send(processedHtml);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ERROR] Failed to fetch ${station.name} after ${duration}ms:`, error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).send('Gateway Timeout: Please try again.');
    }
    
    if (error.response) {
      return res.status(502).send(`Bad Gateway: Railway website returned error ${error.response.status}`);
    }
    
    return res.status(503).send('Service Unavailable: Could not reach railway website.');
  }
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    totalStations: stationsData ? stationsData.totalStations : 0,
    countries: stationsData ? Object.keys(stationsData.countries) : []
  });
});

/**
 * GET / - API 信息
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Train Departure Board Proxy V2',
    version: '2.0.0',
    features: [
      'Dynamic station search',
      'All major European stations',
      '8 countries support',
      'Fuzzy search'
    ],
    endpoints: {
      searchStations: '/stations/search?q={query}',
      listStations: '/stations/list?country={country_code}',
      departureBoard: '/board?station={station_slug}',
      health: '/health'
    },
    supportedCountries: stationsData ? stationsData.countries : {},
    totalStations: stationsData ? stationsData.totalStations : 0
  });
});

/**
 * 404 处理
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    endpoints: {
      searchStations: '/stations/search?q={query}',
      listStations: '/stations/list',
      departureBoard: '/board?station={station_slug}',
      health: '/health'
    }
  });
});

/**
 * 错误处理
 */
app.use((err, req, res, next) => {
  console.error('[FATAL ERROR]', err);
  res.status(500).json({
    error: 'Internal Server Error'
  });
});

/**
 * 启动服务器
 */
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('🚄 Train Departure Board Proxy Server V2');
  console.log('='.repeat(70));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌍 Local: http://localhost:${PORT}`);
  console.log(`📊 Stations loaded: ${stationsData ? stationsData.totalStations : 0}`);
  console.log(`🌐 Countries: ${stationsData ? Object.keys(stationsData.countries).join(', ') : 'None'}`);
  console.log('='.repeat(70));
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received: closing server');
  process.exit(0);
});
