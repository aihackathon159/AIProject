const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // Tải file .env
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');
const path = require('path');

const app = express();
const PORT = 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const ttsClient = new TextToSpeechClient();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'start.html'));
});

app.use(express.static('public'));
app.use('/tts', express.static(path.join(__dirname, 'public', 'tts')));

// ============================================================
// --- API Endpoint CHAT (Gemini) ---
// ============================================================
app.get('/api/chat', async (req, res) => {
    const { prompt } = req.query;

    if (!prompt) {
        return res.status(400).send('Thiếu prompt');
    }
    console.log(`Đã nhận full prompt (stream): ${prompt.substring(0, 150)}...`);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
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

// ============================================================
// --- API Endpoint GIỌNG NÓI (FPT.AI) 
// ============================================================
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
                    'voice': 'banmai',
                }
            }
        );

        const mp3Url = response.data.async;
        res.json({ url: mp3Url });

    } catch (error) {
        console.error("Lỗi FPT TTS:", error.response?.data || error.message);
        res.status(500).json({ error: 'Lỗi tạo giọng nói' });
    }
});
function cleanTextForTTS(text) {
    return text
        .replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
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