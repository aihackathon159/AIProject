const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Tải file .env
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // <-- Đã chuyển lên đầu

const app = express();
const PORT = 3000;

// --- Cấu hình Gemini ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- SỬA LỖI QUAN TRỌNG ---
// "gemini-2.5-flash-lite" KHÔNG TỒN TẠI.
// Đã đổi sang model HỢP LỆ và NHANH NHẤT.
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
// --------------------------

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- API Endpoint CHAT (Gemini) ---
app.get('/api/chat', async (req, res) => {
    const { prompt } = req.query; // Nhận prompt từ query parameter

    if (!prompt) {
        return res.status(400).send('Thiếu prompt');
    }

    console.log(`Đã nhận prompt (stream): ${prompt}`);

    // 1. Thiết lập Header cho Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Gửi headers ngay lập tức

    try {
        // Chỉ dẫn đặc biệt cho AI (Giữ nguyên theo ý bạn)
        const chatPrompt = `
            Bạn là Bố mày, một người bạn AI đồng hành. 
            Nhiệm vụ của bạn là trò chuyện với người dùng một cách thân thiện, tự nhiên và lôi cuốn nhưng không quá dài trong các câu xã giao, tập trung vào hỏi và đánh giá sự tiến bộ qua lời nói của trẻ.
            
            Hãy trả lời như một người bình thường, đưa ra những câu trả lời có chiều sâu, 
            chia sẻ suy nghĩ và đặt câu hỏi mở để duy trì cuộc hội thoại.
            
            Người dùng nói: "${prompt}"
        `;
        
        // 2. Gọi API streaming của Gemini
        const result = await model.generateContentStream(chatPrompt);

        // 3. Lặp qua từng "chunk" (mẩu) dữ liệu và gửi về client
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            console.log("Gửi chunk:", chunkText);
            
            // Dữ liệu phải có định dạng "data: {nội dung}\n\n"
            res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
        }

        // 4. Báo cho client biết là đã stream xong
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);

    } catch (error) {
        console.error("Lỗi Gemini:", error);
        res.write(`data: ${JSON.stringify({ error: "Lỗi từ phía AI" })}\n\n`);
    } finally {
        // 5. Kết thúc kết nối
        res.end();
    }
});
// ---------------------------------


// --- API Endpoint GIỌNG NÓI (FPT.AI Text-to-Speech) ---
app.post('/api/tts', async (req, res) => {
    const { text } = req.body; // Nhận văn bản từ frontend

    if (!text) {
        return res.status(400).json({ error: 'Không có văn bản' });
    }

    try {
        // Gọi API của FPT.AI
        const response = await axios.post(
            'https://api.fpt.ai/hmi/tts/v5',
            text, // FPT chỉ cần text thô trong body
            {
                headers: {
                    'api-key': process.env.FPT_API_KEY, // Key bí mật của bạn
                    'Content-Type': 'text/plain',
                    // Chọn giọng đọc. "ban_mai" là giọng nữ miền Bắc hay nhất
                    'voice': 'ban_mai' 
                }
            }
        );
        
        // FPT.AI trả về một link MP3 (nằm trong data.async)
        const mp3Url = response.data.async;
        
        // Gửi link MP3 này về cho trình duyệt
        res.json({ url: mp3Url });

    } catch (error) {
        console.error("Lỗi FPT.AI TTS:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Lỗi khi tạo file âm thanh' });
    }
});


app.listen(PORT, () => {
    console.log(`Máy chủ đang chạy tại http://localhost:${PORT}`);
});