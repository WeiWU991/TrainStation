const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced User-Agent pool with real browser fingerprints
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

// Load stations data with fallback
let stationsData = [];
try {
  stationsData = require('./stations.json');
  console.log(`✓ Loaded ${stationsData.length} stations from stations.json`);
} catch (error) {
  console.log('⚠ stations.json not found, using backup data');
  stationsData = require('./stations-backup.json');
}

// Middleware
app.use(express.json());
app.use(express.static(__dirname, { index: false }));

// Root route - Station selector page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stations: stationsData.length,
    features: {
      stationSelector: true,
      enhancedProxy: true,
      retryMechanism: true
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

// Enhanced fetch with retry mechanism
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Attempt ${attempt}/${maxRetries}] Fetching: ${url}`);
      
      const response = await axios({
        ...options,
        timeout: 30000, // 30 second timeout
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // Accept any status < 500
      });
      
      console.log(`✓ Success (${response.status}): ${url}`);
      return response;
      
    } catch (error) {
      lastError = error;
      console.log(`✗ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
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
  const cityQuery = req.query.city;

  console.log(`\n🚂 Board request: station=${stationSlug}, city=${cityQuery}`);

  // Find station
  let station;
  if (stationSlug) {
    station = stationsData.find(s => s.slug === stationSlug);
  } else if (cityQuery) {
    station = stationsData.find(s => 
      s.city.toLowerCase() === cityQuery.toLowerCase() ||
      s.name.toLowerCase().includes(cityQuery.toLowerCase())
    );
  }

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
          .suggestions {
            margin-top: 20px;
            padding: 15px;
            background: #ecf0f1;
            border-radius: 5px;
          }
          a {
            color: #3498db;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>🚫 Station Not Found</h1>
          <p>Cannot find station: <strong>${stationSlug || cityQuery || 'unknown'}</strong></p>
          
          <div class="suggestions">
            <h3>Available Stations:</h3>
            <ul>
              ${stationsData.slice(0, 10).map(s => 
                `<li><a href="/board?station=${s.slug}">${s.name} (${s.city}, ${s.country})</a></li>`
              ).join('')}
            </ul>
            <p><a href="/">← Back to station selector</a></p>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  console.log(`✓ Found station: ${station.name} (${station.type})`);
  console.log(`  URL: ${station.url}`);

  try {
    // Prepare headers
    const headers = getBrowserHeaders(station.url);
    
    // Fetch with retry
    const response = await fetchWithRetry(station.url, {
      method: 'GET',
      headers: headers,
      responseType: 'text'
    });

    let html = response.data;
    
    console.log(`✓ Received ${html.length} bytes`);

    // Process HTML based on station type
    if (station.type === 'RFI') {
      // Italian railways - clean up
      html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
      html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
      html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
      
    } else if (station.type === 'NS') {
      // Dutch railways - minimal processing
      html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
      
    } else if (station.type === 'NationalRail') {
      // UK National Rail - special handling
      // The issue: it's showing the search form instead of the board
      // We need to ensure we're getting the departure board, not the search page
      
      if (html.includes('Show live trains') || html.includes('Station name or code')) {
        console.log('⚠ Received search form instead of board, trying alternative URL...');
        
        // Try alternative URL format
        const altUrl = `https://ojp.nationalrail.co.uk/service/ldbboard/dep/${station.code}`;
        console.log(`  Trying: ${altUrl}`);
        
        const altResponse = await fetchWithRetry(altUrl, {
          method: 'GET',
          headers: getBrowserHeaders(altUrl),
          responseType: 'text'
        });
        
        html = altResponse.data;
        console.log(`✓ Alternative URL returned ${html.length} bytes`);
      }
      
      // Clean up UK rail HTML
      html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
      html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
      html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
      html = html.replace(/class="[^"]*skiplink[^"]*"/gi, '');
    }

    // Inject CSS to hide common UI elements
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

    // Insert CSS before </head>
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${injectedCSS}</head>`);
    } else {
      html = injectedCSS + html;
    }

    // Send processed HTML
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
    console.log(`✓ Board served successfully for ${station.name}`);

  } catch (error) {
    console.error(`✗ Error fetching board for ${station.name}:`, error.message);
    
    // Send detailed error page
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Board Unavailable</title>
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
          .retry {
            margin-top: 20px;
          }
          a {
            color: #3498db;
            text-decoration: none;
            font-weight: bold;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>⚠️ Departure Board Temporarily Unavailable</h1>
          <p>Cannot load departure board for: <strong>${station.name}</strong></p>
          
          <div class="details">
            <strong>Station:</strong> ${station.name} (${station.city}, ${station.country})<br>
            <strong>Type:</strong> ${station.type}<br>
            <strong>Error:</strong> ${error.message}<br>
            <strong>Source URL:</strong> ${station.url}
          </div>

          <div class="retry">
            <p><strong>Possible causes:</strong></p>
            <ul>
              <li>The railway website is temporarily down</li>
              <li>Network connectivity issues</li>
              <li>Anti-scraping protection triggered</li>
            </ul>
            
            <p><strong>What you can do:</strong></p>
            <ul>
              <li><a href="javascript:location.reload()">Refresh this page</a> to retry</li>
              <li><a href="${station.url}" target="_blank">Visit official website directly</a></li>
              <li><a href="/">Try another station</a></li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚂 Train Station Departure Board Server`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`\n📍 Available endpoints:`);
  console.log(`   GET /                      → Station selector page`);
  console.log(`   GET /health                → Health check`);
  console.log(`   GET /stations/list         → List all stations`);
  console.log(`   GET /stations/search?q=    → Search stations`);
  console.log(`   GET /board?station=<slug>  → Departure board`);
  console.log(`\n✓ ${stationsData.length} stations loaded`);
  console.log(`✓ Enhanced proxy with retry mechanism enabled`);
  console.log(`✓ Ready to serve requests!\n`);
});
