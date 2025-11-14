// Chờ cho toàn bộ HTML được tải xong
document.addEventListener('DOMContentLoaded', () => {

    // --- BƯỚC 1: DÁN CONFIG FIREBASE VÀO ĐÂY ---
    const firebaseConfig = {
        apiKey: "AIzaSyDts2-C9LML06XKrFNBUpGS54085J6iPM",
        authDomain: "aihackathon-95272.firebaseapp.com",
        projectId: "aihackathon-95272",
        storageBucket: "aihackathon-95272.firebaseio.com",
        messagingSenderId: "353073612135",
        appId: "1:353073612135:web:f930c17eda61e0a8435bc2",
        measurementId: "G-HSHPGV1P8B"
    };

    // --- BƯỚC 2: KHỞI TẠO FIREBASE ---
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // --- CẤU HÌNH APPS SCRIPT URL ---
    // DÁN URL WEB APP CỦA BẠN VÀO ĐÂY (đã lấy từ Google Script)
    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxuhzFKPx07AfqkLIV74KCbd5Axf6RDopsATbjkuam1R6lE_w7gUSZlgBRRzxyuO_1r/exec"; 

    // --- Biến toàn cục cho Chat ---
    let eventSource = null;
    let isStreaming = false;
    let recognition = null;
    let sessionId = null;
    let sessionTopic = null;
    let sessionVocab = null;

    let isVoiceEnabled = true;
    let aiVoice = null;

    // --- Lấy các phần tử DOM ---
    const canvasContainer = document.getElementById('canvas-container');
    const chatLog = document.getElementById('chat-log');
    const inputForm = document.getElementById('input-bar');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const micButton = document.getElementById('mic-button');
    const ttsPlayer = document.getElementById('tts-player');
    const chatTitle = document.getElementById('chat-title');
    const exitButton = document.getElementById('exit-button');
    
    // Đảm bảo ttsPlayer không tự động phát
    if(ttsPlayer) {
        ttsPlayer.autoplay = false;
    }


    // --- KHỞI CHẠY CÁC MÔ-ĐUN ---
    initThreeJS();
    initChat();
    initSpeechRecognition();
    initSession();

    exitButton.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });

    // ===================================================================
    // PHẦN 4: CÁC HÀM TIỆN ÍCH (Hiển thị & Giọng nói)
    // ===================================================================

    /**
     * Đọc to văn bản dùng Apps Script (Gemini TTS)
     * Hàm này ĐÃ ĐƯỢC TỐI ƯU để gọi URL Apps Script của bạn
     */
    async function speak(text) {
        if (!text || !APPS_SCRIPT_URL) {
            console.error("Thiếu URL hoặc văn bản.");
            speakFallback(text);
            return;
        }

        try {
            console.log("Đang gọi Apps Script để tạo giọng nói...");
            // Bắt đầu gọi API
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    // Cần dùng Content-Type này cho Google Apps Script doPost()
                    'Content-Type': 'text/plain', 
                },
                body: JSON.stringify({ text: text })
            });

            const data = await response.json();

            if (data.error) {
                console.error("Lỗi từ Apps Script:", data.error);
                speakFallback(text);
                return;
            }

            const audioUrl = data.url;
            if (audioUrl) {
                console.log("Đã nhận URL Audio: ", audioUrl);
                
                // Dừng mọi âm thanh cũ của trình duyệt
                window.speechSynthesis.cancel();
                
                // Phát file MP3 từ Google Drive
                ttsPlayer.src = audioUrl;
                ttsPlayer.load();
                ttsPlayer.play();
            } else {
                console.warn("Không có URL Audio. Dùng Fallback.");
                speakFallback(text);
            }

        } catch (e) {
            console.error("Lỗi kết nối hoặc xử lý TTS:", e);
            speakFallback(text);
        }
    }

    /**
     * Hàm dự phòng (sử dụng TTS của trình duyệt)
     */
    function speakFallback(text) {
        console.warn("Đang dùng giọng đọc dự phòng của trình duyệt.");
        window.speechSynthesis.cancel(); 
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
    
    /**
     * Hiển thị một tin nhắn mới trong hộp thoại
     * Trả về element của tin nhắn đó
     */
    function displayMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.className = (sender === 'user') ? 'user-message' : 'ai-message';
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
        return messageElement; // Trả về để có thể cập nhật (cho AI)
    }

    // ===================================================================
    // PHẦN 0: QUẢN LÝ KÊNH CHAT (LOGIC CSDL)
    // ===================================================================

    function initSession() {
        const urlParams = new URLSearchParams(window.location.search);
        const idFromUrl = urlParams.get('id');

        if (idFromUrl) {
            sessionId = idFromUrl;
            console.log("Đang tải session:", sessionId);
            loadChatHistory(sessionId);
        } else {
            console.error("Không tìm thấy session ID! Quay về dashboard.");
            chatTitle.textContent = "Lỗi";
            displayMessage("Không tìm thấy ID cuộc trò chuyện. Đang quay lại...", 'ai');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 3000);
        }
    }

    /**
     * Hàm TẢI LỊCH SỬ CHAT (Code Firebase thật)
     */
    async function loadChatHistory(id) {
        console.log(`Đang tải lịch sử cho ${id}...`);

        // 1. Tải thông tin của Session
        try {
            const sessionDoc = await db.collection("sessions").doc(id).get();
            if (!sessionDoc.exists) {
                console.error("Session không tồn tại!");
                window.location.href = 'dashboard.html';
                return;
            }
            const sessionData = sessionDoc.data();
            chatTitle.textContent = sessionData.title || "Cuộc trò chuyện";

            sessionTopic = sessionData.topic;
            sessionVocab = sessionData.vocabulary;
            console.log("Đã tải Topic:", sessionTopic);
            console.log("Đã tải Vocab:", sessionVocab);

        } catch (error) {
            console.error("Lỗi tải session data:", error);
            displayMessage("Lỗi kết nối tới CSDL (Session).", 'ai');
            return;
        }

        // 2. Xóa tin nhắn "đang nghĩ"
        const thinkingMsg = chatLog.querySelector('.ai-message');
        if (thinkingMsg && thinkingMsg.textContent.includes('nghĩ')) {
            thinkingMsg.remove();
        }

        // 3. Tải tin nhắn trong subcollection "messages"
        try {
            const messagesSnapshot = await db.collection("sessions").doc(id)
                                             .collection("messages")
                                             .orderBy("createdAt", "asc")
                                             .get();

            if (messagesSnapshot.empty) {
                console.log("Phát hiện chat mới. Đang tạo prompt khởi động...");
                
                if (sessionTopic && sessionVocab) {
                    const initialPrompt = `Hãy bắt đầu một cuộc trò chuyện nhập vai.
                    Chủ đề của chúng ta là: "${sessionTopic}".
                    Hãy cố gắng sử dụng những từ vựng sau: "${sessionVocab}".
                    Bắt đầu bằng lời chào và giới thiệu chủ đề ngay bây giờ.`;
                    
                    sendQueryToAI(initialPrompt, true); 
                } else {
                    displayMessage("Chào bạn! Bố mày đây. Bạn cần gì?", 'ai');
                }
                
            } else {
                messagesSnapshot.forEach(doc => {
                    const msg = doc.data();
                    displayMessage(msg.text, msg.sender);
                });
            }
        } catch (error) {
            console.error("Lỗi tải lịch sử tin nhắn:", error);
            displayMessage("Lỗi khi tải lịch sử chat.", 'ai');
        }
    }

    /**
     * Hàm LƯU TIN NHẮN (Code Firebase thật)
     */
    function saveMessageToDB(text, sender) {
        if (!sessionId) {
            console.error("Không có session ID, không thể lưu tin nhắn!");
            return;
        }
        
        db.collection("sessions").doc(sessionId)
          .collection("messages").add({
              text: text,
              sender: sender,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
          })
          .catch(error => console.error("Lỗi lưu tin nhắn:", error));
    }


    // ===================================================================
    // PHẦN 1: 3D (THREE.JS) - (Giữ nguyên)
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
    // PHẦN 2: LOGIC CHAT (Gửi tin nhắn)
    // ===================================================================
    function initChat() {
        inputForm.addEventListener('submit', handleFormSubmit);
    }

    function handleFormSubmit(event) {
        event.preventDefault(); 
        // Logic phát lại audio (chỉnh sửa: chỉ nên chạy khi user gửi tin)
        // ttsPlayer.load() và ttsPlayer.play() sẽ được gọi trong hàm speak()

        const prompt = promptInput.value.trim();
        if (!prompt) {
            return; 
        }
        
        sendMessage(prompt);
        promptInput.value = ''; 
    }

    /**
     * Hàm này chỉ dùng khi NGƯỜI DÙNG gõ và gửi
     */
    function sendMessage(prompt) {
        if (isStreaming) {
            return;
        }
        setStreamingState(true);

        displayMessage(prompt, 'user');
        saveMessageToDB(prompt, 'user'); // Lưu tin nhắn user

        sendQueryToAI(prompt); // <-- Gọi hàm xử lý AI
    }
    
    /**
     * === HÀM GỌI AI QUAN TRỌNG NHẤT ===
     */
    function sendQueryToAI(userMessage, isSystemMessage = false) {
        // Tùy chỉnh tin nhắn chờ của bạn
        const aiMessageElement = displayMessage("🤖 Bibo đang nghĩ...", 'ai');
        let fullMessage = "";
        
        let finalPrompt;

        if (isSystemMessage) {
            finalPrompt = userMessage;
        } else {
            // Đảm bảo khuôn mẫu được bọc đúng cách
            finalPrompt = `
                Bạn là một trợ lý giọng nói thân thiện, dịu dàng và nói chuyện rõ ràng bằng giọng nữ tiếng Việt, được thiết kế để giúp đỡ trẻ em Việt Nam từ 5-12 tuổi bị chậm nói.
                Nhiệm vụ của bạn là bắt đầu một buổi nói chuyện thật tự nhiên và vui vẻ.
                Hãy làm theo các bước sau:
                1. Chào bé một cách nồng nhiệt.
                2. Tự giới thiệu mình là một người bạn robot.
                3. Hỏi tên của bé để làm quen.
                4. Sau khi bé trả lời, hãy hỏi về một sở thích đơn giản (ví dụ: 'Con thích chơi gì nhất?' hoặc 'Con thích con vật nào nhất?').
                5. Dựa vào câu trả lời của bé, hãy dẫn dắt một cách khéo léo vào chủ đề hôm nay là '${sessionTopic || 'tự do'}' với các từ vựng: ${sessionVocab || 'bất kỳ'}.

                Hãy nhớ, cuộc trò chuyện phải thật tự nhiên, không giống một bài kiểm tra. Giữ câu nói ngắn gọn và dễ hiểu. Câu trả lời của bạn phải hoàn toàn bằng tiếng Việt.
                ---
                Tin nhắn người dùng: ${userMessage}
                `;
        }

        console.log("Gửi full prompt đến server:", finalPrompt.substring(0, 100) + "...");

        const encodedPrompt = encodeURIComponent(finalPrompt);
        // EventSource gọi đến server Node.js (cần đảm bảo server.js đang chạy)
        eventSource = new EventSource(`/api/chat?prompt=${encodedPrompt}&session=${sessionId}`); // Thêm sessionId vào URL

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
                    // *** KÍCH HOẠT HÀM TTS MỚI TẠI ĐÂY ***
                    speak(fullMessage); 
                    saveMessageToDB(fullMessage, 'ai'); // Lưu tin nhắn AI
                }
                return;
            }

            if (data.chunk) {
                if (aiMessageElement.textContent === "🤖 Bibo đang nghĩ...") {
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
    // PHẦN 3: LOGIC GHI ÂM (Giữ nguyên)
    // ===================================================================
    
    function initSpeechRecognition() {
        micButton.addEventListener('click', toggleSpeechRecognition); 
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            console.error("Trình duyệt của bạn không hỗ trợ Speech Recognition.");
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
            if (event.error === 'no-speech') {} 
            else if (event.error === 'audio-capture') { alert("Không tìm thấy micro."); }
            else if (event.error === 'not-allowed') { alert("Bạn cần cho phép sử dụng micro."); }
            micButton.classList.remove('is-listening');
            promptInput.placeholder = "Nói gì đó với Bibo...";
        };
        recognition.onend = () => {
            micButton.classList.remove('is-listening'); 
            promptInput.placeholder = "Nói gì đó với Bibo...";
        };
    }

    function toggleSpeechRecognition() {
        if (!recognition) return; 
        if (micButton.classList.contains('is-listening')) {
            recognition.stop();
            if (promptInput.value.trim().length > 0) {
                // Tự động gửi tin nhắn sau khi dừng ghi âm
                sendMessage(promptInput.value.trim());
                promptInput.value = '';
            }
        } else {
            try {
                recognition.start();
                micButton.classList.add('is-listening'); 
                promptInput.value = ""; 
                promptInput.placeholder = "Bibo đang nghe... (nhấn để tắt)";
            } catch (error) {
                console.error("Lỗi khi bắt đầu ghi âm:", error);
                micButton.classList.remove('is-listening');
            }
        }
    }

});