// find-endpoint.js
const axios = require('axios');
const cheerio = require('cheerio');

async function findEndpoint() {
    // 1. Ambil halaman utama + token
    const page = await axios.get('https://ssdownloader.com/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
    });
    const $ = cheerio.load(page.data);
    const token = $('input[name="token"]').val();
    console.log('Token:', token);

    // 2. Ambil file JS utama untuk cari URL endpoint
    const jsUrl = $('script[src*="main.js"]').attr('src');
    console.log('JS URL:', jsUrl);
    
    if (jsUrl) {
        const js = await axios.get(jsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://ssdownloader.com/' }
        });
        // Cari semua URL yang ada di JS
        const urls = js.data.match(/["'](https?:\/\/[^"']+)["']/g);
        console.log('\nURL ditemukan di JS:');
        if (urls) urls.forEach(u => console.log(u));
        
        // Cari kata kunci ajax/fetch/api
        const apiLines = js.data.match(/.{0,50}(ajax|fetch|\.post|wp-json|\/api\/).{0,80}/g);
        console.log('\nAPI calls:');
        if (apiLines) apiLines.forEach(l => console.log(l));
    }

    // 3. Coba berbagai endpoint kemungkinan
    const testUrl = 'https://www.instagram.com/reel/DU15yCnj8-p/';
    const endpoints = [
        { url: 'https://ssdownloader.com/wp-json/aio-dl/video-data/', method: 'POST' },
        { url: 'https://ssdownloader.com/wp-admin/admin-ajax.php', method: 'POST', extra: { action: 'aio_dl' } },
        { url: 'https://ssdownloader.com/wp-admin/admin-ajax.php', method: 'POST', extra: { action: 'aiodl_download' } },
        { url: 'https://ssdownloader.com/?action=aiodl', method: 'POST' },
    ];

    for (const ep of endpoints) {
        try {
            const body = { url: testUrl, token: token, ...ep.extra };
            const res = await axios.post(ep.url, new URLSearchParams(body), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': 'https://ssdownloader.com/',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 10000
            });
            console.log(`\n✅ ${ep.url} -> Status ${res.status}:`);
            console.log(JSON.stringify(res.data).substring(0, 300));
        } catch (e) {
            console.log(`❌ ${ep.url} -> ${e.response?.status || e.message}`);
        }
    }
}

findEndpoint().catch(console.error);