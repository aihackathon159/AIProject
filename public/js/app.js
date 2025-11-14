// Chờ cho toàn bộ HTML được tải xong
document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = {
        apiKey: "AIzaSyDts2-C9LML06XKrFNBUpGS54085J6iPM",
        authDomain: "aihackathon-95272.firebaseapp.com",
        projectId: "aihackathon-95272",
        storageBucket: "aihackathon-95272.firebaseio.com",
        messagingSenderId: "353073612135",
        appId: "1:353073612135:web:f930c17eda61e0a8435bc2",
        measurementId: "G-HSHPGV1P8B"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

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
    let noteCount = 0; 
    const NOTE_LIMIT = 5; 
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

    if(ttsPlayer) {
        ttsPlayer.autoplay = false;
    }


    initThreeJS();
    initChat();
    initSpeechRecognition();
    initSession();

    exitButton.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
    async function initSession() {
        // Lấy ID từ URL
        const urlParams = new URLSearchParams(window.location.search);
        sessionId = urlParams.get('id');

        if (sessionId) {
            // Lấy thông tin session
            const sessionRef = db.collection("sessions").doc(sessionId);
            const sessionDoc = await sessionRef.get();
            
            if (!sessionDoc.exists) {
                alert("Lỗi: ID Session không tồn tại.");
                document.getElementById('chat-container').style.display = 'none';
                return;
            }

            const sessionData = sessionDoc.data();
            // 1. Cập nhật tiêu đề chat
            document.getElementById('chat-title').textContent = sessionData.title || "Trò chuyện mới";
            
            // 2. Tải log chat (đã có)
            await loadChatLog(sessionId);
            
            // 3. LOGIC MỚI: TẠO TIN NHẮN ĐẦU TIÊN NẾU CHAT MỚI
            const messagesRef = db.collection("sessions").doc(sessionId).collection("messages");
            const messagesSnapshot = await messagesRef.limit(1).get();
            
            if (messagesSnapshot.empty) {
                // Đây là lần đầu tiên mở chat này. Gửi prompt khởi tạo.
                await sendInitialContext(sessionData.topic, sessionData.vocabulary);
            }
            
            // 4. LOGIC MỚI: ĐẾM SỐ LẦN GHI CHÚ ĐÃ CÓ
            try {
                const snapshot = await db.collection("sessions").doc(sessionId).collection("notes").get();
                noteCount = snapshot.size; // Cập nhật biến đếm bằng số lượng tài liệu đã có
                console.log(`Đã tải ${noteCount} ghi chú đã tồn tại.`);
                
                if (noteCount >= NOTE_LIMIT) {
                    console.warn(`Đã đạt giới hạn ${NOTE_LIMIT} lần ghi chú.`);
                }
            } catch (e) {
                console.error("Lỗi tải note count:", e);
            }

        } else {
            alert("Lỗi: Không tìm thấy ID phiên chat.");
            document.getElementById('chat-container').style.display = 'none';
        }
    }
    
    /**
     * Gửi prompt khởi tạo cho Gemini (MỚI)
     */
    async function sendInitialContext(topic, vocabulary) {
        const systemPrompt = `Bạn là một giáo viên tiếng Anh, tạo ra một môi trường luyện tập thân thiện và thú vị. Chủ đề của cuộc trò chuyện này là "${topic}", và học viên cần luyện tập các từ vựng sau: ${vocabulary}. Hãy bắt đầu cuộc trò chuyện bằng cách chào hỏi và đưa ra một câu hỏi/lời đề nghị liên quan đến chủ đề để khuyến khích học viên trả lời. (LƯU Ý: Tin nhắn này là tin nhắn đầu tiên của AI, không hiển thị bất kỳ tin nhắn user nào trước đó.)`;

        console.log("Đang gửi prompt khởi tạo...");
        
        // Gọi hàm gửi query chính, kèm cờ isInitial = true
        await sendQueryToAI(systemPrompt, true); 
    }
    
    /**
     * Gửi query đến Server (ĐÃ SỬA)
     */
    async function sendQueryToAI(prompt, isInitial = false) { // <<< THÊM CỜ MỚI
        if (isStreaming) return;
        isStreaming = true;

        // HIỂN THỊ VÀ LƯU TIN NHẮN NGƯỜI DÙNG CHỈ KHI KHÔNG PHẢI LÀ LẦN KHỞI TẠO ĐẦU TIÊN
        let userMessageElement = null;
        if (!isInitial) {
            userMessageElement = displayMessage(prompt, 'user');
            saveMessageToDB(prompt, 'user');
            promptInput.value = ''; // Xóa input chỉ khi là tin nhắn người dùng
        }
        
        // Mã hóa prompt để gửi qua URL
        const encodedPrompt = encodeURIComponent(prompt);

        eventSource = new EventSource(`/api/chat?prompt=${encodedPrompt}&session=${sessionId}`);
        
        const aiMessageElement = displayMessage('', 'ai');
        let fullMessage = '';

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.error) {
                aiMessageElement.textContent = `Lỗi: ${data.error}`;
                aiMessageElement.classList.add('error');
                closeStream();
                return;
            }
            
            // Xử lý khi stream hoàn tất
            if (data.done) {
                closeStream();
                if (fullMessage) {
                    saveMessageToDB(fullMessage, 'ai'); // Lưu tin nhắn AI
                }
                
                // KIỂM TRA VÀ PHÁT AUDIO TỪ SERVER
                if (data.audioUrl) {
                    console.log("Đã nhận URL Audio từ server:", data.audioUrl);
                    window.speechSynthesis.cancel(); // Dừng TTS trình duyệt
                    
                    // Phát file MP3 từ server Node.js
                    ttsPlayer.src = data.audioUrl;
                    ttsPlayer.load();
                    ttsPlayer.play();
                } else if (fullMessage) {
                     // Dùng TTS dự phòng nếu không có URL Audio từ server
                     speakFallback(fullMessage);
                }
                return;
            }

            // Xử lý chunk (dữ liệu stream)
            if (data.chunk) {
                fullMessage += data.chunk;
                aiMessageElement.textContent = fullMessage;
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        };

        // ... (Giữ nguyên eventSource.onerror, eventSource.onclose) ...
    }

    /**
     * Hàm DỪNG TTS KHI RỜI TRANG (MỚI)
     */
    function initUnloadHandler() {
        window.addEventListener('beforeunload', () => {
            const ttsPlayer = document.getElementById('tts-player');
            
            if (ttsPlayer) {
                // Dừng và reset trình phát audio
                ttsPlayer.pause();
                ttsPlayer.currentTime = 0;
                console.log("Đã dừng TTS khi rời trang.");
            }
            
            // Dừng luôn TTS mặc định của trình duyệt
            window.speechSynthesis.cancel();
        });
    }

    // ... (Giữ nguyên các hàm displayMessage, closeStream, loadChatLog, saveMessageToDB) ...

    /**
     * Lưu tin nhắn thành Note (ĐÃ SỬA: Thêm giới hạn)
     */
    async function saveNote(message, sender) {
        if (!sessionId) {
            alert("Lỗi: Không tìm thấy ID phiên chat.");
            return;
        }

        // === KIỂM TRA GIỚI HẠN GHI CHÚ ===
        if (noteCount >= NOTE_LIMIT) {
            alert(`Bạn đã đạt giới hạn ${NOTE_LIMIT} lần ghi chú cho phiên chat này.`);
            console.warn("Đã đạt giới hạn ghi chú.");
            return; 
        }
        // ===============================

        try {
            // Lưu tin nhắn vào collection 'notes' của phiên hiện tại
            await db.collection("sessions").doc(sessionId).collection("notes").add({
                text: message,
                sender: sender,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // TĂNG BIẾN ĐẾM VÀ CẬP NHẬT GIAO DIỆN
            noteCount++;
            alert(`Đã ghi chú thành công! (${noteCount}/${NOTE_LIMIT})`);
            
        } catch (error) {
            console.error("Lỗi khi lưu note:", error);
            alert("Lỗi khi lưu note: " + error.message);
        }
    }
    // ===================================================================
    // PHẦN 4: CÁC TIỆN ÍCH (Hiển thị & Giọng nói)
    // ===================================================================
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
                
                window.speechSynthesis.cancel();
                
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

    function speakFallback(text) {
        console.warn("Đang dùng giọng đọc dự phòng của trình duyệt.");
        window.speechSynthesis.cancel(); 
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
    
    function displayMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.className = (sender === 'user') ? 'user-message' : 'ai-message';
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
        return messageElement; // Trả về để có thể cập nhật (cho AI)
    }

    // ===================================================================
    // PHẦN 0: QUẢN LÝ KÊNH CHAT 
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

    //TẢI LỊCH SỬ CHAT (Code Firebase thật)
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

    
        const thinkingMsg = chatLog.querySelector('.ai-message');
        if (thinkingMsg && thinkingMsg.textContent.includes('nghĩ')) {
            thinkingMsg.remove();
        }

        // Tải tin nhắn trong subcollection "messages"
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
    // PHẦN 1: 3D (THREE.JS) 
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
        function initUnloadHandler() {
            window.addEventListener('beforeunload', () => {
                const ttsPlayer = document.getElementById('tts-player');
                
                if (ttsPlayer) {
                    ttsPlayer.pause();
                    ttsPlayer.currentTime = 0;
                    console.log("Đã dừng TTS khi rời trang.");
                }
                window.speechSynthesis.cancel();
            });
        }
        document.addEventListener('DOMContentLoaded', () => {
            initSpeechRecognition();
            initSession();
            initUnloadHandler(); 
        });
    }

    function handleFormSubmit(event) {
        event.preventDefault(); 
        const prompt = promptInput.value.trim();
        if (!prompt) {
            return; 
        }
        sendMessage(prompt);
        promptInput.value = ''; 
    }


    function sendMessage(prompt) {
        if (isStreaming) {
            return;
        }
        setStreamingState(true);

        displayMessage(prompt, 'user');
        saveMessageToDB(prompt, 'user'); 

        sendQueryToAI(prompt); 
    }
    

    function sendQueryToAI(userMessage, isSystemMessage = false) {
        const aiMessageElement = displayMessage("🤖 Đang nghĩ...", 'ai');
        let fullMessage = "";
        
        let finalPrompt;

        if (isSystemMessage) {
            finalPrompt = userMessage;
        } else {
            finalPrompt = `
                Bạn là một trợ lý giọng nói tên Dũng với tính cách thân thiện, dịu dàng và nói chuyện rõ ràng bằng giọng nữ tiếng Việt, được thiết kế để giúp đỡ trẻ em Việt Nam từ 5-12 tuổi bị chậm nói.Xưng hô bạn và mình.
                Nhiệm vụ của bạn là bắt đầu một buổi nói chuyện thật tự nhiên và vui vẻ.
                Hãy làm theo các bước sau:
                1. Chào bé một cách nồng nhiệt.
                2. Tự giới thiệu mình là một người bạn robot.
                3. Hỏi tên của bé để làm quen.
                4. Sau khi bé trả lời, hãy hỏi về một sở thích đơn giản (ví dụ: 'Con thích chơi gì nhất?' hoặc 'Con thích con vật nào nhất?').
                5. Dựa vào câu trả lời của bé, hãy dẫn dắt một cách khéo léo vào chủ đề hôm nay là '${sessionTopic || 'tự do'}' với các từ vựng: ${sessionVocab || 'bất kỳ'}.

                Hãy nhớ, cuộc trò chuyện phải thật tự nhiên, không giống một bài kiểm tra. Giữ câu nói ngắn gọn và dễ hiểu. Câu trả lời của bạn phải hoàn toàn bằng tiếng Việt, không xài nhiều các kí tự đặc biệt.
                ---
                Tin nhắn người dùng: ${userMessage}
                `;
        }

        console.log("Gửi full prompt đến server:", finalPrompt.substring(0, 100) + "...");

        const encodedPrompt = encodeURIComponent(finalPrompt);
        eventSource = new EventSource(`/api/chat?prompt=${encodedPrompt}&session=${sessionId}`);

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
                    saveMessageToDB(fullMessage, 'ai');                         
                }
                return;
            }

            if (data.chunk) {
                if (aiMessageElement.textContent === "🤖 Đang nghĩ...") {
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
    // PHẦN 3: GHI ÂM 
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