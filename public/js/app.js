// Chờ cho toàn bộ HTML được tải xong
document.addEventListener('DOMContentLoaded', () => {

    // --- Biến toàn cục cho Chat ---
    let eventSource = null;
    let isStreaming = false;
    let recognition = null; // Biến giữ trình ghi âm
    let sessionId = null;   // <-- BIẾN MỚI: Giữ ID của kênh chat

    // --- BIẾN MỚI CHO AI VOICE ---
    let isVoiceEnabled = true; // Bật/tắt giọng nói AI
    let aiVoice = null; // Đối tượng Text-to-Speech

    // --- Lấy các phần tử DOM ---
    const canvasContainer = document.getElementById('canvas-container');
    const chatLog = document.getElementById('chat-log');
    const inputForm = document.getElementById('input-bar');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const micButton = document.getElementById('mic-button');
    const ttsPlayer = document.getElementById('tts-player'); // Lấy trình phát audio

    // --- KHỞI CHẠY CÁC MÔ-ĐUN ---
    initThreeJS();
    initChat();                // <-- Kích hoạt thanh chat
    initSpeechRecognition();   // <-- Kích hoạt micro
    initSession();             // <-- Kச்செய tra/Tạo session CSDL

    // ===================================================================
    // PHẦN 0: QUẢN LÝ KÊNH CHAT (LOGIC CSDL MỚI)
    // (Đây là các hàm giả lập, bạn sẽ thay bằng Firebase sau)
    // ===================================================================

    function initSession() {
        const urlParams = new URLSearchParams(window.location.search);
        const idFromUrl = urlParams.get('id');

        if (idFromUrl) {
            // ID đã có -> Tải lịch sử chat cũ
            sessionId = idFromUrl;
            console.log("Đang tải session cũ:", sessionId);
            loadChatHistory(sessionId);
        } else {
            // ID không có -> Tạo session mới
            // (Sau này Firebase sẽ tạo ID, giờ chúng ta tự tạo)
            sessionId = "session_" + Date.now();
            console.log("Tạo session mới:", sessionId);
            // Không cần làm gì thêm, vì đây là chat mới
        }
    }

    /**
     * Hàm GIẢ LẬP tải lịch sử chat (Bạn sẽ thay bằng Firebase)
     */
    function loadChatHistory(id) {
        console.log(`Đang tải lịch sử cho ${id}...`);
        // GIẢ LẬP
        const mockHistory = [
            { text: 'Chào Bibo', sender: 'user' },
            { text: 'Chào bạn! Bố mày đây. Bạn cần gì?', sender: 'ai' }
        ];

        // Xóa chữ "Bố mày đang nghĩ..." (nếu có)
        const thinkingMsg = chatLog.querySelector('.ai-message');
        if (thinkingMsg && thinkingMsg.textContent.includes('nghĩ')) {
            thinkingMsg.remove();
        }

        mockHistory.forEach(msg => {
            displayMessage(msg.text, msg.sender);
        });
    }

    /**
     * Hàm GIẢ LẬP lưu tin nhắn (Bạn sẽ thay bằng Firebase)
     */
    function saveMessageToDB(text, sender) {
        // Sau này bạn sẽ dùng: db.collection("sessions").doc(sessionId)...
        console.log(`[DB (${sessionId})]: Lưu [${sender}]: ${text}`);
    }


    // ===================================================================
    // PHẦN 1: KHỞI TẠO 3D (THREE.JS) - (Giữ nguyên)
    // ===================================================================
    function initThreeJS() {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        canvasContainer.appendChild(renderer.domElement);

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        function animate() {
            requestAnimationFrame(animate);
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', () => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        });
    }

    // ===================================================================
    // PHẦN 2: KHỞI TẠO LOGIC CHAT (Gửi tin nhắn)
    // ===================================================================
    function initChat() {
        // KÍCH HOẠT THANH CHAT
        inputForm.addEventListener('submit', handleFormSubmit);
    }

    function handleFormSubmit(event) {
        event.preventDefault(); // Ngăn trang tải lại

        // "Đánh thức" trình phát FPT.AI (Fix lỗi Autoplay)
        if (ttsPlayer && ttsPlayer.paused) {
            ttsPlayer.load();
        }

        if (isStreaming) {
            return; // Nếu AI đang nói, không làm gì cả
        }

        const prompt = promptInput.value.trim();
        if (!prompt) {
            return; // Không gửi nếu ô trống
        }

        // Gửi tin nhắn
        sendMessage(prompt);
        
        promptInput.value = ''; // Xóa ô nhập liệu
    }

    function sendMessage(prompt) {
        setStreamingState(true);

        displayMessage(prompt, 'user');
        saveMessageToDB(prompt, 'user'); // <-- LƯU TIN NHẮN USER VÀO DB

        const aiMessageElement = displayMessage("Bố mày đang nghĩ...", 'ai');
        let fullMessage = "";

        const encodedPrompt = encodeURIComponent(prompt);
        eventSource = new EventSource(`/api/chat?prompt=${encodedPrompt}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.error) {
                aiMessageElement.textContent = data.error;
                aiMessageElement.style.color = 'red';
                closeStream();
                return;
            }

            if (data.done) {
                closeStream();
                if (fullMessage) {
                    speak(fullMessage);
                    saveMessageToDB(fullMessage, 'ai'); // <-- LƯU TIN NHẮN AI VÀO DB
                }
                return;
            }

            if (data.chunk) {
                if (aiMessageElement.textContent === "Bố mày đang nghĩ...") {
                    aiMessageElement.textContent = "";
                }
                fullMessage += data.chunk;
                aiMessageElement.textContent = fullMessage;
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        };

        eventSource.onerror = (error) => {
            console.error("Lỗi EventSource:", error);
            aiMessageElement.textContent = "Lỗi kết nối, không thể nhận phản hồi.";
            aiMessageElement.style.color = 'red';
            closeStream();
        };
    }

    function closeStream() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        setStreamingState(false);
    }

    function setStreamingState(streaming) {
        isStreaming = streaming;
        promptInput.disabled = streaming;
        sendButton.disabled = streaming;
        micButton.disabled = streaming;
    }

    // ===================================================================
    // PHẦN 3: LOGIC GHI ÂM (Speech-to-Text)
    // ===================================================================
    function initSpeechRecognition() {
        micButton.addEventListener('click', toggleSpeechRecognition); // Kích hoạt nút mic
        
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            micButton.disabled = true;
            micButton.textContent = '🚫';
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript;
            promptInput.value += transcript.trim() + ' ';
        };

        recognition.onerror = (event) => {
            console.error("Lỗi Speech Recognition:", event.error);
            if (event.error === 'not-allowed') {
                alert("Bạn cần cho phép trang web sử dụng micro nhé!");
            }
            micButton.classList.remove('is-listening');
            promptInput.placeholder = "Nói gì đó với Bố mày đi...";
        };
        
        recognition.onend = () => {
            micButton.classList.remove('is-listening');
            promptInput.placeholder = "Nói gì đó với Bố mày đi...";
        };
    }

    function toggleSpeechRecognition() {
        if (!recognition) return;

        if (micButton.classList.contains('is-listening')) {
            recognition.stop();
        } else {
            try {
                recognition.start();
                micButton.classList.add('is-listening');
                promptInput.value = "";
                promptInput.placeholder = "Bố đang nghe... (nhấn để tắt)";
            } catch (error) {
                console.error("Lỗi khi bắt đầu ghi âm:", error);
                micButton.classList.remove('is-listening');
            }
        }
    }

    // ===================================================================
    // PHẦN 4: CÁC HÀM TIỆN ÍCH (Hiển thị & Giọng nói FPT)
    // ===================================================================

    function displayMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.className = (sender === 'user') ? 'user-message' : 'ai-message';
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
        return messageElement;
    }

    async function speak(text) {
        // Dùng trình phát audio đã "đánh thức"
        if (!ttsPlayer) return;
        
        window.speechSynthesis.cancel();
        ttsPlayer.pause();
        ttsPlayer.src = "";

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text }),
            });

            if (!response.ok) {
                throw new Error('Server không thể tạo file âm thanh');
            }

            const data = await response.json();
            ttsPlayer.src = data.url;
            await ttsPlayer.play();

        } catch (error) {
            console.error("Lỗi khi phát giọng nói FPT.AI:", error);
            speakFallback(text); // Dùng giọng dự phòng
        }
    }

    function speakFallback(text) {
        console.warn("Đang dùng giọng đọc dự phòng của trình duyệt.");
        const utterance = new SpeechSynthesisUtance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
});