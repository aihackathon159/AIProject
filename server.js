const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // Tải file .env
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech'); // THÊM CHO GOOGLE TTS
const fs = require('fs'); // THÊM CHO FILE
const util = require('util'); // THÊM CHO PROMISE
const path = require('path');

const app = express();
const PORT = 3000;

// --- Cấu hình Gemini (cho chat) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Cấu hình Google Cloud TTS (cho giọng nói) ---
const ttsClient = new TextToSpeechClient(); // Dùng GOOGLE_APPLICATION_CREDENTIALS từ .env

app.use(cors());
app.use(express.json());

// --- ROUTE CHO TRANG CHỦ (START.HTML) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'start.html'));
});

app.use(express.static('public'));

// THÊM ROUTE PHỤC VỤ FILE AUDIO
app.use('/tts', express.static(path.join(__dirname, 'public', 'tts')));

// --- API Endpoint CHAT (Gemini) ---
// SỬA MODEL CHAT VỀ FLASH (miễn phí, quota cao)
app.get('/api/chat', async (req, res) => {
    const { prompt } = req.query;

    if (!prompt) {
        return res.status(400).send('Thiếu prompt');
    }

    console.log(`Đã nhận prompt (stream): ${prompt}`);

    // 1. Thiết lập Header cho Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const chatPrompt = `
            Bạn là Bố mày, một người bạn AI đồng hành. 
            Nhiệm vụ của bạn là trò chuyện với người dùng một cách thân thiện, tự nhiên và lôi cuốn nhưng không quá dài trong các câu xã giao, tập trung vào hỏi và đánh giá sự tiến bộ qua lời nói của trẻ.
            Hãy trả lời như một người bình thường, đưa ra những câu trả lời có chiều sâu, 
            chia sẻ suy nghĩ và đặt câu hỏi mở để duy trì cuộc hội thoại.
            không đọc những icon lên tiếng. không đọc dấu câu.
            
            Người dùng nói: "${prompt}"
        `;
        
        // SỬA: DÙNG MODEL FLASH (miễn phí, quota 60 req/phút)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        const result = await model.generateContentStream(chatPrompt);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            console.log("Gửi chunk:", chunkText);
            res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);

    } catch (error) {
        console.error("Lỗi Gemini:", error);
        res.write(`data: ${JSON.stringify({ error: "Lỗi từ phía AI" })}\n\n`);
    } finally {
        res.end();
    }
});

// --- API Endpoint GIỌNG NÓI (Google Cloud TTS - Giọng Gemini-style) ---
// --- API Endpoint GIỌNG NÓI (Google Cloud TTS - Giọng chuẩn Việt) ---
// --- API Endpoint GIỌNG NÓI (SSML - Giống người Việt thật) ---
// --- API GIỌNG NÓI: "BỐ MÀY NÓI CHUẨN VIỆT" ---
// --- API GIỌNG NÓI: FPT.AI – CHUẨN ÂM TIẾT VIỆT NAM ---
app.post('/api/tts', async (req, res) => {
    let { text } = req.body;
    text = cleanTextForTTS(text); // Chỉ xóa emoji

    if (!text) {
        return res.status(400).json({ error: 'Không có văn bản' });
    }

    console.log("FPT TTS:", text);

    try {
        const response = await axios.post(
            'https://api.fpt.ai/hmi/tts/v5',
            text,
            {
                headers: {
                    'api-key': process.env.FPT_API_KEY,
                    'voice': 'banmai', // Giọng nữ miền Nam, CHUẨN ÂM
                    // 'voice': 'thuminh' // Giọng nam miền Nam
                }
            }
        );

        const mp3Url = response.data.async; // FPT trả URL MP3

        res.json({ url: mp3Url });

    } catch (error) {
        console.error("Lỗi FPT TTS:", error.response?.data || error.message);
        res.status(500).json({ error: 'Lỗi tạo giọng nói' });
    }
});
// === 1. LÀM SẠCH ===
function cleanTextForTTS(text) {
    return text
        .replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// === 2. ÂM TIẾT THẬT ===
function convertToPhoneticVietnamese(text) {
    return text
        .toLowerCase()
        .replace(/\brồi\b/g, 'zùi')
        .replace(/\bmày\b/g, 'mài')
        .replace(/\bcon\b/g, 'kon')
        .replace(/\bkhông\b/g, 'khom')
        .replace(/\bthôi\b/g, 'thùi')
        .replace(/\bnhé\b/g, 'nghe')
        .trim();
}

// === 3. SSML ===
function createRealVietnameseSSML(text) {
    const sentences = text.split(/[.!?]/).map(s => s.trim()).filter(s => s);
    let ssml = `<speak>`;
    sentences.forEach((s, i) => {
        let prosody = s.includes('?') ? `pitch="+20%" rate="fast"` :
                      s.includes('!') ? `pitch="+10%" rate="slow"` :
                      /(zùi|kwá|vui)/i.test(s) ? `pitch="+25%" rate="x-fast"` :
                      `pitch="-5%" rate="medium"`;
        const breakTime = i < sentences.length - 1 ? '800ms' : '600ms';
        ssml += `<prosody ${prosody}>${s}</prosody><break time="${breakTime}"/>`;
    });
    ssml += `</speak>`;
    return ssml;
}

app.listen(PORT, () => {
    // Hiệu ứng cầu vồng
    const text = `Máy chủ đang chạy tại ➤   http://localhost:${PORT}`;
    const colors = [
        '\x1b[31m', '\x1b[33m', '\x1b[32m', '\x1b[36m', '\x1b[34m', '\x1b[35m',
    ];

    let coloredText = '';
    for (let i = 0; i < text.length; i++) {
        coloredText += colors[i % colors.length] + text[i];
    }
    console.log(coloredText + '\x1b[0m');
});