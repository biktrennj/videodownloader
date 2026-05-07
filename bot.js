const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf('8616072860:AAGodrCY20EJRVCB5G2OTkeMr_xEko_ND8E');
const RAPIDAPI_KEY = '476e61984dmsh72f55bfd0e8ff17p1319e0jsn3bc897bb50ec';

// Store pending downloads (cache URL sementara)
const pendingDownloads = new Map();

bot.start((ctx) => {
    ctx.reply('Halo! Kirimkan link video TikTok, Instagram Reels, Facebook, atau YouTube.\n\nKamu bisa pilih resolusi dan download audio saja.');
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
        return { url: videoOnly[0].url, title: data.title, author: data.author, needsBuffer: true, source: 'instagram' };
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

    if (data?.direct_media_url) {
        console.log('[FB] Found direct_media_url');
        return { url: data.direct_media_url, needsBuffer: true, source: 'facebook' };
    }
    if (data?.url) return { url: data.url, needsBuffer: true, source: 'facebook' };
    if (data?.video) return { url: data.video, needsBuffer: true, source: 'facebook' };
    
    console.log('[FB] Full response:', JSON.stringify(data).substring(0, 500));
    throw new Error('Video Facebook tidak ditemukan. Pastikan link public dan media tersedia.');
}

// ============================================================
// YOUTUBE (dengan berbagai resolusi)
// ============================================================
async function getYouTubeFormats(url) {
    return new Promise((resolve, reject) => {
        // TAMBAHAN: --no-playlist agar tidak mengambil seluruh video di playlist/mix
        const cmd = `yt-dlp --no-playlist -j "${url}"`;
        
        exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error('Gagal mendapatkan info video YouTube'));
            }
            
            try {
                const info = JSON.parse(stdout);
                const formats = info.formats || [];
                
                // Filter video formats, URUTKAN DARI RESOLUSI TERTINGGI
                let videoFormats = formats
                    .filter(f => f.vcodec !== 'none' && f.acodec === 'none' && f.ext === 'mp4' && f.height)
                    .sort((a, b) => b.height - a.height);
                
                // Hapus duplikat resolusi yang sama
                const uniqueHeights = new Set();
                videoFormats = videoFormats.filter(f => {
                    if (uniqueHeights.has(f.height)) return false;
                    uniqueHeights.add(f.height);
                    return true;
                });
                
                resolve({
                    title: info.title,
                    formats: videoFormats.slice(0, 4), // ambil 4 resolusi terbaik
                    audioFormat: audioFormat,
                    downloadUrl: url
                });
            } catch(e) {
                reject(new Error('Gagal parse info YouTube'));
            }
        });
    });
}

async function downloadYouTubeWithFormat(url, formatId = null, audioOnly = false) {
    return new Promise((resolve, reject) => {
        const outputDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
        
        const outputPath = path.join(outputDir, `video_${Date.now()}.${audioOnly ? 'mp3' : 'mp4'}`);
        
        let cmd;
        // TAMBAHAN: Selalu gunakan --no-playlist di setiap eksekusi download
        if (audioOnly) {
            cmd = `yt-dlp --no-playlist -f "bestaudio/best" -x --audio-format mp3 --audio-quality 192K -o "${outputPath}" "${url}" --quiet --no-warnings`;
        } else if (formatId) {
            cmd = `yt-dlp --no-playlist -f "${formatId}+bestaudio/best" --merge-output-format mp4 -o "${outputPath}" "${url}" --quiet --no-warnings`;
        } else {
            cmd = `yt-dlp --no-playlist -f "best[ext=mp4]/best" -o "${outputPath}" "${url}" --quiet --no-warnings`;
        }
        
        console.log('[YT] Running:', cmd.substring(0, 100) + '...');
        
        const timeout = setTimeout(() => {
            reject(new Error('Download timeout (lebih dari 5 menit)'));
        }, 5 * 60 * 1000);
        
        exec(cmd, { maxBuffer: 10 * 1024 * 1024, shell: true }, (error, stdout, stderr) => {
            clearTimeout(timeout);
            
            if (error) {
                console.error('[YT] Error:', error.message);
                return reject(new Error('Download YouTube gagal.'));
            }
            
            if (!fs.existsSync(outputPath)) {
                return reject(new Error('File tidak ditemukan setelah download.'));
            }
            
            const buffer = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
            
            const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
            console.log(`[YT] Success: ${sizeMB}MB`);
            resolve({ buffer, title: 'YouTube Video', sizeMB });
        });
    });
}

// ============================================================
// TIKTOK
// ============================================================
async function downloadTikTok(url) {
    const res = await axios.post('https://www.tikwm.com/api/', 
        { url: url, hd: 1 }, 
        { timeout: 15000 }
    );
    if (res.data.code === 0 && res.data.data?.play) {
        return { url: res.data.data.play, needsBuffer: false, source: 'tiktok' };
    } else {
        throw new Error('Video TikTok tidak ditemukan atau akun privat.');
    }
}

// ============================================================
// MAIN LISTENER
// ============================================================
bot.on('text', async (ctx) => {
    // --- TAMBAHKAN BARIS INI ---
    console.log('\n[DEBUG] Pesan masuk dari Telegram:', ctx.message.text);
    // ---------------------------
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

    const loadingMsg = await ctx.reply('⏳ Sedang menganalisis link...');
    const msgId = loadingMsg.message_id;
    // 1. PERBAIKAN HELPER: Tambahkan parameter 'extra'
    const edit = (text, extra) => ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, text, extra);

    try {
        // YOUTUBE - Tampilkan pilihan resolusi
        if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be') || targetUrl.includes('youtube-nocookie.com')) {
            await edit('⏳ Mengambil info video YouTube...');
            const ytInfo = await getYouTubeFormats(targetUrl);
            
            // PERBAIKAN: Gunakan ID tanpa garis bawah agar tidak bentrok dengan Regex
            const sessionId = Date.now().toString(36); 
            pendingDownloads.set(sessionId, { url: targetUrl, title: ytInfo.title, type: 'youtube', formats: ytInfo.formats });
            
            const buttons = ytInfo.formats.map((fmt) => {
                const size = fmt.filesize || fmt.filesize_approx || 0;
                const sizeStr = size > 0 ? `${(size / 1024 / 1024).toFixed(1)}MB` : '~MB';
                
                return [Markup.button.callback(
                    `📹 ${fmt.height}p (${sizeStr})`,
                    `ytres_${sessionId}_${fmt.format_id}` // Hapus underscore tambahan
                )];
            });
            
            buttons.push([Markup.button.callback(`🎵 Audio Only`, `ytaud_${sessionId}`)]);
            
            await edit(
                `🎬 ${ytInfo.title}\n\nPilih resolusi atau download audio saja:`,
                Markup.inlineKeyboard(buttons)
            );
        }
        
        // TIKTOK - Langsung download
        else if (targetUrl.includes('tiktok.com') || targetUrl.includes('vt.tiktok.com')) {
            await edit('⏳ Mengunduh dari TikTok...');
            const result = await downloadTikTok(targetUrl);
            const buffer = await downloadToBuffer(result.url);
            
            await ctx.replyWithVideo(
                { source: buffer, filename: 'tiktok.mp4' },
                { caption: '🎵 TikTok Video\n\nPowered by Naufal Tech' }
            );
            
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        
        // INSTAGRAM - Langsung download
        else if (targetUrl.includes('instagram.com')) {
            await edit('⏳ Mengunduh dari Instagram...');
            const result = await downloadInstagram(targetUrl);
            const buffer = await downloadToBuffer(result.url);
            
            await ctx.replyWithVideo(
                { source: buffer, filename: 'instagram.mp4' },
                { 
                    caption: `🎬 ${result.title}\n👤 ${result.author}\n\nPowered by Naufal Tech`
                }
            );
            
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }
        
        // FACEBOOK - Langsung download
        else if (targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch')) {
            await edit('⏳ Mengunduh dari Facebook...');
            const result = await downloadFacebook(targetUrl);
            const buffer = await downloadToBuffer(result.url);
            
            await ctx.replyWithVideo(
                { source: buffer, filename: 'facebook.mp4' },
                { caption: '🎬 Facebook Video\n\nPowered by Naufal Tech' }
            );
            
            await ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
        }

    } catch (error) {
        console.error('Error:', error.message);
        await edit(`❌ ${error.message}`);
    }
});

// ============================================================
// CALLBACK HANDLER
// ============================================================
bot.action(/^ytres_(.+?)_(.+?)$/, async (ctx) => {
    const [, sessionId, formatId] = ctx.match;
    const session = pendingDownloads.get(sessionId);
    
    if (!session) {
        return ctx.answerCbQuery('❌ Session expired. Server mungkin baru direstart. Kirim link lagi.', { show_alert: true });
    }
    
    await ctx.answerCbQuery('⏳ Mendownload video...');
    
    try {
        const result = await downloadYouTubeWithFormat(session.url, formatId, false);
        
        await ctx.replyWithVideo(
            { source: result.buffer, filename: 'youtube.mp4' },
            { caption: `🎬 ${session.title}\n📏 ${result.sizeMB}MB\n\nPowered by Naufal Tech` }
        );
        
        pendingDownloads.delete(sessionId);
        await ctx.deleteMessage();
        
    } catch (error) {
        ctx.answerCbQuery(`❌ ${error.message}`, { show_alert: true });
    }
});

bot.action(/^ytaud_(.+?)$/, async (ctx) => {
    const sessionId = ctx.match[1];
    const session = pendingDownloads.get(sessionId);
    
    if (!session) {
        return ctx.answerCbQuery('❌ Session expired. Kirim link lagi.', { show_alert: true });
    }
    
    await ctx.answerCbQuery('⏳ Mendownload audio...');
    
    try {
        const result = await downloadYouTubeWithFormat(session.url, null, true);
        
        await ctx.replyWithAudio(
            { source: result.buffer, filename: 'audio.mp3' },
            { caption: `🎵 ${session.title}\n\nPowered by Naufal Tech` }
        );
        
        pendingDownloads.delete(sessionId);
        await ctx.deleteMessage();
        
    } catch (error) {
        ctx.answerCbQuery(`❌ ${error.message}`, { show_alert: true });
    }
});

// Callback untuk audio only
bot.action(/^yt_audio_(.+?)$/, async (ctx) => {
    const sessionId = ctx.match[1];
    const session = pendingDownloads.get(sessionId);
    
    if (!session) {
        return ctx.answerCbQuery('❌ Session expired. Kirim link lagi.', { show_alert: true });
    }
    
    await ctx.answerCbQuery('⏳ Mendownload audio...');
    
    try {
        const result = await downloadYouTubeWithFormat(session.url, null, true);
        
        await ctx.replyWithAudio(
            { source: result.buffer, filename: 'audio.mp3' },
            { caption: `🎵 ${session.title}\n\nPowered by Naufal Tech` }
        );
        
        pendingDownloads.delete(sessionId);
        await ctx.deleteMessage();
        
    } catch (error) {
        ctx.answerCbQuery(`❌ ${error.message}`, { show_alert: true });
    }
});

bot.launch().then(() => console.log('🤖 Bot berjalan!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));