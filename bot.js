const { Telegraf } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf('8616072860:AAGodrCY20EJRVCB5G2OTkeMr_xEko_ND8E');
const RAPIDAPI_KEY = '476e61984dmsh72f55bfd0e8ff17p1319e0jsn3bc897bb50ec';

bot.start((ctx) => {
    ctx.reply('Halo! Kirimkan link video TikTok, Instagram Reels, atau Facebook.');
});

// ── INSTAGRAM ──
async function downloadInstagram(url) {
    const cleanUrl = url.split('?')[0];
    const res = await axios.get('https://instagram-reels-downloader-api.p.rapidapi.com/download', {
        params: { url: cleanUrl },
        headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-host': 'instagram-reels-downloader-api.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY,
        },
        timeout: 20000
    });

    const data = res.data?.data;
    if (!data) throw new Error('Response kosong dari API Instagram.');

    // Ambil video (bukan audio), type === 'video'
    const videos = data.medias?.filter(m => m.type === 'video' && !m.is_audio === false || m.type === 'video');
    
    // Cari yang benar-benar video (bukan pure audio)
    const videoOnly = data.medias?.filter(m => m.type === 'video');
    if (videoOnly && videoOnly.length > 0) {
        console.log('[IG] Pakai URL:', videoOnly[0].url.substring(0, 80));
        return { url: videoOnly[0].url, title: data.title, author: data.author };
    }

    throw new Error('Video tidak ditemukan di response API.');
}

// ── FACEBOOK (pakai API berbeda di RapidAPI, subscribe dulu) ──
async function downloadFacebook(url) {
    const res = await axios.get('https://facebook-reel-and-video-downloader.p.rapidapi.com/app/main.php', {
        params: { url },
        headers: {
            'x-rapidapi-host': 'facebook-reel-and-video-downloader.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY,
        },
        timeout: 20000
    });

    const data = res.data;
    console.log('[FB] Response:', JSON.stringify(data).substring(0, 300));

    const videoUrl = data?.links?.Download_HD || data?.links?.Download_SD || data?.hd || data?.sd;
    if (videoUrl) return { url: videoUrl };

    throw new Error('Video Facebook tidak ditemukan. Pastikan link public.');
}

// ── MAIN ──
bot.on('text', async (ctx) => {
    const urls = ctx.message.text.match(/(https?:\/\/[^\s]+)/g);
    if (!urls) return;

    const targetUrl = urls[0];
    const isValid = ['tiktok.com', 'vt.tiktok.com', 'instagram.com', 'facebook.com', 'fb.watch']
        .some(d => targetUrl.includes(d));

    if (!isValid) return ctx.reply('⚠️ Hanya mendukung TikTok, Instagram, dan Facebook.');

    const loadingMsg = await ctx.reply('⏳ Sedang memproses, mohon tunggu...');
    const edit = (text) => ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, text);

    try {
        let result;

        if (targetUrl.includes('tiktok.com') || targetUrl.includes('vt.tiktok.com')) {
            const res = await axios.post('https://www.tikwm.com/api/', { url: targetUrl, hd: 1 }, { timeout: 15000 });
            if (res.data.code === 0 && res.data.data?.play) {
                result = { url: res.data.data.play };
            } else throw new Error('Video TikTok tidak ditemukan atau akun privat.');
        }
        else if (targetUrl.includes('instagram.com')) {
            result = await downloadInstagram(targetUrl);
        }
        else {
            result = await downloadFacebook(targetUrl);
        }

        await edit('✅ Ditemukan! Sedang mengirim...');

        const caption = result.title 
            ? `🎬 ${result.title}\n👤 ${result.author || ''}\n\nPowered by Naufal Tech`
            : 'Powered by Naufal Tech';

        await ctx.replyWithVideo(result.url, { caption });

    } catch (error) {
        console.error('Error:', error.message);
        await edit(`❌ ${error.message}`);
    }
});

bot.launch().then(() => console.log('🤖 Bot berjalan!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));