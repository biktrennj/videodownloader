// test-api.js — jalankan: node test-api.js
const axios = require('axios');

const testUrl = 'https://www.instagram.com/reel/DXrU0Lajjqb/';

async function test() {
    const tests = [
        // Test 1: Cobalt official (format baru v10)
        async () => {
            const res = await axios.post('https://api.cobalt.tools/v1/json', {
                url: testUrl
            }, {
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
            return { name: 'Cobalt v1', data: res.data };
        },

        // Test 2: SSDownloader API
        async () => {
            const res = await axios.get(`https://ssdownloader.com/api/download`, {
                params: { url: testUrl },
                timeout: 10000
            });
            return { name: 'SSDownloader', data: res.data };
        },

        // Test 3: InstaFinsta
        async () => {
            const res = await axios.post('https://instafinsta.com/download', 
                new URLSearchParams({ url: testUrl }),
                { 
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 10000 
                }
            );
            return { name: 'InstaFinsta', status: res.status, preview: String(res.data).substring(0, 100) };
        },

        // Test 4: SnapTik (untuk IG juga)
        async () => {
            const res = await axios.post('https://snaptik.app/abc2.php',
                new URLSearchParams({ url: testUrl, lang: 'id' }),
                {
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                }
            );
            return { name: 'SnapTik', status: res.status, preview: String(res.data).substring(0, 200) };
        },

        // Test 5: y2mate API
        async () => {
            const res = await axios.post('https://www.y2mate.com/mates/analyzeV2/ajax',
                new URLSearchParams({ k_query: testUrl, k_page: 'Instagram', hl: 'id', q_auto: 1 }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 10000
                }
            );
            return { name: 'Y2mate', data: JSON.stringify(res.data).substring(0, 200) };
        },

        // Test 6: getmedia.org
        async () => {
            const res = await axios.post('https://getmedia.org/download',
                new URLSearchParams({ url: testUrl }),
                { timeout: 10000 }
            );
            return { name: 'GetMedia', status: res.status };
        },

        // Test 7: savefrom.net API (paling tua, masih aktif)
        async () => {
            const res = await axios.get('https://worker.sf-converter.com/convert', {
                params: { url: testUrl },
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            return { name: 'SaveFrom Worker', data: JSON.stringify(res.data).substring(0, 200) };
        },
    ];

    for (const test of tests) {
        try {
            const result = await test();
            console.log(`✅ BERHASIL - ${result.name}:`);
            console.log(JSON.stringify(result, null, 2));
        } catch (e) {
            const name = e.config?.url || 'unknown';
            console.log(`❌ GAGAL - ${name}: ${e.message}`);
        }
        console.log('---');
    }
}

test();