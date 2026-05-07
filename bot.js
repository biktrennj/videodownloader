const { Telegraf } = require('telegraf');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf('8616072860:AAGodrCY20EJRVCB5G2OTkeMr_xEko_ND8E');
const RAPIDAPI_KEY = '476e61984dmsh72f55bfd0e8ff17p1319e0jsn3bc897bb50ec';

bot.start((ctx) => {
    ctx.reply('Halo! Kirimkan link video TikTok, Instagram Reels, Facebook, atau YouTube.');
});

// ============================================================
// HELPER: Download ke Buffer
// ============================================================
async function downloadToBuffer(videoUrl) {
    const res = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.instagram.com/',
        },
        maxContentLength: 50 * 1024 * 1024,
    });
    return Buffer.from(res.data);
}

// ============================================================
// INSTAGRAM
// ============================================================
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

    const videoOnly = data.medias?.filter(m => m.type === 'video');
    if (videoOnly && videoOnly.length > 0) {
        return { url: videoOnly[0].url, title: data.title, author: data.author, needsBuffer: true };
    }
    throw new Error('Video tidak ditemukan di response API.');
}

// ============================================================
// FACEBOOK
// ============================================================
async function downloadFacebook(url) {
    const res = await axios.post('https://facebook-media-downloader1.p.rapidapi.com/get_media',
        { url: url },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': 'facebook-media-downloader1.p.rapidapi.com',
                'x-rapidapi-key': RAPIDAPI_KEY,
            },
            timeout: 20000
        }
    );

    const data = res.data;
    console.log('[FB] Response status:', data.status);

    // Cek struktur response
    if (data?.direct_media_url) {
        console.log('[FB] Found direct_media_url');
        return { url: data.direct_media_url, needsBuffer: true };
    }
    if (data?.url) return { url: data.url, needsBuffer: true };
    if (data?.video) return { url: data.video, needsBuffer: true };
    if (data?.download_url) return { url: data.download_url, needsBuffer: true };
    if (data?.result?.url) return { url: data.result.url, needsBuffer: true };
    if (Array.isArray(data?.media) && data.media[0]?.url) return { url: data.media[0].url, needsBuffer: true };
    
    console.log('[FB] Full response:', JSON.stringify(data).substring(0, 500));
    throw new Error('Video Facebook tidak ditemukan. Pastikan link public dan media tersedia.');
}

// ============================================================
// YOUTUBE (via yt-dlp)
// ============================================================
async function downloadYouTube(url) {
    return new Promise((resolve, reject) => {
        const outputDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        
        const outputPath = path.join(outputDir, `video_${Date.now()}.mp4`);
        const cmd = `yt-dlp -f "best[ext=mp4]/best" -o "${outputPath}" "${url}" --quiet --no-warnings`;
        
        console.log('[YT] Running:', cmd);
        
        const timeout = setTimeout(() => {
            reject(new Error('Download timeout (lebih dari 5 menit)'));
        }, 5 * 60 * 1000);
        
        exec(cmd, { maxBuffer: 10 * 1024 * 1024, shell: true }, (error, stdout, stderr) => {
            clearTimeout(timeout);
            
            if (error) {
                console.error('[YT] Error:', error.message);
                return reject(new Error('Download YouTube gagal. Video mungkin private/blocked.'));
            }
            
            if (!fs.existsSync(outputPath)) {
                return reject(new Error('File video tidak ditemukan setelah download.'));
            }
            
            const buffer = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            
            console.log(`[YT] Success: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
            resolve({ buffer, title: 'YouTube Video' });
        });
    });
}

// ============================================================
// MAIN LISTENER
// ============================================================
bot.on('text', async (ctx) => {
    const urls = ctx.message.text.match(/(https?:\/\/[^\s]+)/g);
    if (!urls) return;

    const targetUrl = urls[0];
    const isValid = [
        'tiktok.com', 'vt.tiktok.com',
        'instagram.com',
        'facebook.com', 'fb.watch',
        'youtube.com', 'youtu.be', 'youtube-nocookie.com'
    ].some(d => targetUrl.includes(d));

    if (!isValid) return ctx.reply('⚠️ Mendukung TikTok, Instagram, Facebook, dan YouTube.');

    const loadingMsg = await ctx.reply('⏳ Sedang memproses, mohon tunggu...');
    const edit = (text) => ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, text);

    try {
        let result;

        // ── TIKTOK ──
        if (targetUrl.includes('tiktok.com') || targetUrl.includes('vt.tiktok.com')) {
            const res = await axios.post('https://www.tikwm.com/api/', 
                { url: targetUrl, hd: 1 }, 
                { timeout: 15000 }
            );
            if (res.data.code === 0 && res.data.data?.play) {
                result = { url: res.data.data.play, buffer: null, needsBuffer: false };
            } else throw new Error('Video TikTok tidak ditemukan atau akun privat.');
        }
        // ── INSTAGRAM ──
        else if (targetUrl.includes('instagram.com')) {
            result = await downloadInstagram(targetUrl);
        }
        // ── FACEBOOK ──
        else if (targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch')) {
            result = await downloadFacebook(targetUrl);
        }
        // ── YOUTUBE ──
        else if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
            await edit('⏳ Download YouTube bisa lama, mohon tunggu (5-10 menit)...');
            result = await downloadYouTube(targetUrl);
        }

        if (!result) throw new Error('Gagal mendapatkan media.');

        await edit('✅ Download selesai! Mengirim...');

        if (result.buffer) {
            // Kirim dari buffer (untuk YouTube)
            await ctx.replyWithVideo(
                { source: result.buffer, filename: 'video.mp4' },
                { caption: result.title || 'Powered by Naufal Tech' }
            );
        } else if (result.needsBuffer) {
            // Download dulu baru kirim (untuk IG, FB)
            const buffer = await downloadToBuffer(result.url);
            const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(1);
            console.log(`[Bot] Video size: ${fileSizeMB}MB`);
            
            await ctx.replyWithVideo(
                { source: buffer, filename: 'video.mp4' },
                { 
                    caption: result.title
                        ? `🎬 ${result.title}\n👤 ${result.author || ''}\n\nPowered by Naufal Tech`
                        : 'Powered by Naufal Tech'
                }
            );
        } else {
            // Kirim langsung dari URL (untuk TikTok)
            await ctx.replyWithVideo(result.url, { 
                caption: 'Powered by Naufal Tech'
            });
        }

        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        } catch(e) {
            // ignore delete error
        }

    } catch (error) {
        console.error('Error:', error.message);
        await edit(`❌ ${error.message}`);
    }
});

bot.launch().then(() => console.log('🤖 Bot berjalan!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));