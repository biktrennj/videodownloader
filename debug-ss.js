// debug-ss.js
const axios = require('axios');
const cheerio = require('cheerio');

async function debug() {
    // Buat session (simpan cookies)
    const { CookieJar } = require('tough-cookie');
    const { wrapper } = require('axios-cookiejar-support');
    
    // Cek apakah tough-cookie tersedia
    let client;
    try {
        const jar = new CookieJar();
        client = wrapper(axios.create({ jar }));
        console.log('✅ Cookie support aktif');
    } catch(e) {
        console.log('❌ tough-cookie tidak ada, pakai axios biasa');
        client = axios;
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    };

    // Step 1: GET halaman utama (dapat cookie + token)
    console.log('\n[1] GET halaman utama...');
    const pageRes = await client.get('https://ssdownloader.com/', { headers });
    const setCookies = pageRes.headers['set-cookie'];
    console.log('Cookies:', setCookies);
    
    const $ = cheerio.load(pageRes.data);
    const token = $('input[name="token"]').val();
    console.log('Token:', token);

    // Cari nonce di source JS atau halaman
    const nonceMatch = pageRes.data.match(/nonce["'\s:]+["']([a-f0-9]+)["']/i);
    console.log('Nonce dari HTML:', nonceMatch ? nonceMatch[1] : 'tidak ada');

    // Step 2: Coba request dengan berbagai variasi header
    const testUrl = 'https://www.instagram.com/reel/DU15yCnj8-p/';
    const cookieStr = setCookies ? setCookies.map(c => c.split(';')[0]).join('; ') : '';
    console.log('Cookie string:', cookieStr);

    const variants = [
        {
            name: 'Standard + Cookie',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://ssdownloader.com/',
                'Origin': 'https://ssdownloader.com',
                'Cookie': cookieStr,
            }
        },
        {
            name: 'Dengan X-Requested-With',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://ssdownloader.com/',
                'Origin': 'https://ssdownloader.com',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookieStr,
            }
        },
        {
            name: 'Accept JSON',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://ssdownloader.com/',
                'Origin': 'https://ssdownloader.com',
                'Cookie': cookieStr,
            }
        },
    ];

    for (const v of variants) {
        try {
            const res = await client.post(
                'https://ssdownloader.com/wp-json/aio-dl/video-data/',
                new URLSearchParams({ url: testUrl, token }),
                { headers: v.headers, timeout: 15000 }
            );
            console.log(`\n✅ [${v.name}] Status ${res.status}:`);
            console.log(JSON.stringify(res.data).substring(0, 400));
        } catch(e) {
            const body = e.response?.data;
            console.log(`\n❌ [${v.name}] ${e.response?.status}: ${JSON.stringify(body).substring(0, 200)}`);
        }
    }
}

debug().catch(console.error);