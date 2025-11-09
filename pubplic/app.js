// Chờ cho toàn bộ HTML được tải xong
document.addEventListener('DOMContentLoaded', () => {

    // --- Biến toàn cục cho Chat ---
    let eventSource = null; // Giữ kết nối stream
    let isStreaming = false; // Cờ kiểm tra AI có đang trả lời hay không

    // --- SỬA LỖI: Thêm khai báo recognition ---
    let recognition = null; // Biến giữ trình ghi âm

    // --- Lấy các phần tử DOM ---
    const canvasContainer = document.getElementById('canvas-container');
    const chatLog = document.getElementById('chat-log');
    const inputForm = document.getElementById('input-bar'); // Đây là thẻ <form>
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const micButton = document.getElementById('mic-button');

    // --- KHỞI CHẠY CÁC MÔ-ĐUN ---
    initThreeJS();
    initChat();
    initSpeechRecognition();

    // ===================================================================
    // PHẦN 1: KHỞI TẠO 3D (THREE.JS)
    // ===================================================================
    function initThreeJS() {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ alpha: true }); // 'alpha: true' để nền trong suốt
        renderer.setSize(window.innerWidth, window.innerHeight);
        canvasContainer.appendChild(renderer.domElement);

        // Đối tượng 3D (Khối lập phương thay cho nhân vật)
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        // Vòng lặp Animation
        function animate() {
            requestAnimationFrame(animate);
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
        }
        animate();

        // Xử lý khi thay đổi kích thước cửa sổ
        window.addEventListener('resize', () => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        });
    }

    // ===================================================================
    // PHẦN 2: KHỞI TẠO LOGIC CHAT
    // ===================================================================
    function initChat() {
        // Chỉ cần lắng nghe sự kiện 'submit' của form
        inputForm.addEventListener('submit', handleFormSubmit);
        micButton.addEventListener('click', toggleSpeechRecognition);
    }

    /**
     * Xử lý khi người dùng gửi form (nhấn Enter hoặc click nút)
     */
    function handleFormSubmit(event) {
        event.preventDefault(); // Ngăn trang tải lại

        if (isStreaming) {
            return; // Nếu AI đang nói, không làm gì cả
        }

        const prompt = promptInput.value.trim(); // Lấy và cắt khoảng trắng
        if (!prompt) {
            return; // Không gửi nếu ô trống
        }

        // Gửi tin nhắn
        sendMessage(prompt);
        
        // Xóa ô nhập liệu ngay lập tức
        promptInput.value = '';
    }

    /**
     * Gửi prompt đến backend và lắng nghe stream
     */
    function sendMessage(prompt) {
        // 1. Khóa giao diện
        setStreamingState(true);

        // 2. Hiển thị tin nhắn người dùng
        displayMessage(prompt, 'user');

        // 3. Tạo bong bóng chat "đang nghĩ" cho AI (Đồng bộ persona)
        const aiMessageElement = displayMessage("Bố mày đang nghĩ...", 'ai');
        let fullMessage = ""; // Biến để nối các chunk

        // 4. Mã hóa prompt và tạo kết nối EventSource
        const encodedPrompt = encodeURIComponent(prompt);
        eventSource = new EventSource(`/api/chat?prompt=${encodedPrompt}`);

        // 5. Khi nhận được một mẩu dữ liệu (message)
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            // 5.1. Nếu có lỗi từ server
            if (data.error) {
                aiMessageElement.textContent = data.error;
                aiMessageElement.style.color = 'red';
                closeStream();
                return;
            }

            // 5.2. Nếu stream đã xong
            if (data.done) {
                closeStream();
                // Đọc to câu trả lời KHI đã nhận xong
                if (fullMessage) {
                    speak(fullMessage);
                }
                return;
            }

            // 5.3. Nhận một chunk văn bản
            if (data.chunk) {
                // Xóa chữ "đang nghĩ..." ở lần nhận chunk đầu tiên
                if (aiMessageElement.textContent === "Bố mày đang nghĩ...") {
                    aiMessageElement.textContent = "";
                }
                
                // Nối chunk mới vào tin nhắn
                fullMessage += data.chunk;
                aiMessageElement.textContent = fullMessage;
                
                // Luôn cuộn xuống tin nhắn mới nhất
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        };

        // 6. Xử lý khi lỗi kết nối (mất mạng, server sập)
        eventSource.onerror = (error) => {
            console.error("Lỗi EventSource:", error);
            aiMessageElement.textContent = "Lỗi kết nối, không thể nhận phản hồi.";
            aiMessageElement.style.color = 'red';
            closeStream();
        };
    }

    /**
     * Đóng kết nối stream và mở lại giao diện
     */
    function closeStream() {
        if (eventSource) {
            eventSource.close(); // Đóng kết nối
            eventSource = null;
        }
        setStreamingState(false); // Mở lại giao diện
    }

    /**
     * Khóa hoặc mở khóa ô nhập liệu và nút gửi
     */
    function setStreamingState(streaming) {
        isStreaming = streaming;
        promptInput.disabled = streaming;
        sendButton.disabled = streaming;
        micButton.disabled = streaming;
    }

    // ===================================================================
    // PHẦN 3: LOGIC GHI ÂM (MIC)
    // ===================================================================
    
    function initSpeechRecognition() {
        // Kiểm tra trình duyệt có hỗ trợ không
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!window.SpeechRecognition) {
            console.error("Trình duyệt của bạn không hỗ trợ Speech Recognition.");
            micButton.disabled = true;
            micButton.textContent = '🚫'; // Báo lỗi
            return;
        }

        recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        
        // --- THAY ĐỔI QUAN TRỌNG ---
        recognition.continuous = true;   // <-- BẬT chế độ nghe liên tục
        recognition.interimResults = false; // Chỉ trả kết quả cuối (sau khi ngắt nghỉ)
        // -------------------------

        // Khi trình ghi âm nhận diện được giọng nói
        recognition.onresult = (event) => {
            // Lấy kết quả MỚI NHẤT
            const transcript = event.results[event.results.length - 1][0].transcript;
            
            // Nối kết quả mới vào ô chat (thêm dấu cách)
            promptInput.value += transcript.trim() + ' ';
        };

        // Xử lý lỗi
        recognition.onerror = (event) => {
            console.error("Lỗi Speech Recognition:", event.error);
            if (event.error === 'no-speech') {
                // Lỗi này sẽ xảy ra liên tục khi bật continuous, nên ta bỏ qua
            } else if (event.error === 'audio-capture') {
                alert("Không tìm thấy micro. Bạn kiểm tra lại nhé!");
            } else if (event.error === 'not-allowed') {
                alert("Bạn cần cho phép trang web sử dụng micro nhé!");
            }
            
            // Khi có lỗi nghiêm trọng, tắt mic (dọn dẹp)
            micButton.classList.remove('is-listening');
            promptInput.placeholder = "Nói gì đó với Bố mày đi...";
        };
        
        // Khi ngừng ghi âm (CHỈ khi ta gọi .stop() hoặc có lỗi)
        recognition.onend = () => {
            micButton.classList.remove('is-listening'); // Tắt hiệu ứng đỏ
            promptInput.placeholder = "Nói gì đó với Bố mày đi...";
        };
    }

    /**
     * Bật/Tắt trình ghi âm khi nhấn nút mic
     */
    function toggleSpeechRecognition() {
        if (!recognition) return; // Chưa khởi tạo

        if (micButton.classList.contains('is-listening')) {
            // Nếu đang nghe -> bắt nó dừng
            recognition.stop();
            // (Hàm 'onend' sẽ tự động dọn dẹp)
            
        } else {
            // Nếu đang không nghe -> bắt đầu nghe
            try {
                recognition.start();
                micButton.classList.add('is-listening'); // Bật hiệu ứng đỏ
                promptInput.value = ""; // Xóa ô chat
                promptInput.placeholder = "Bố đang nghe... (nhấn để tắt)"; // Đồng bộ persona
            } catch (error) {
                // Xử lý nếu gọi start() quá nhanh
                console.error("Lỗi khi bắt đầu ghi âm:", error);
                micButton.classList.remove('is-listening');
            }
        }
    }

    // ===================================================================
    // PHẦN 4: HÀM TIỆN ÍCH (Chat & Giọng nói)
    // ===================================================================

    /**
     * Hiển thị một tin nhắn mới trong hộp thoại
     * Trả về element của tin nhắn đó
     */
    function displayMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.className = (sender === 'user') ? 'user-message' : 'ai-message';
        chatLog.appendChild(messageElement);

        // Tự động cuộn xuống tin nhắn mới nhất
        chatLog.scrollTop = chatLog.scrollHeight;
        
        return messageElement; // Trả về để có thể cập nhật (cho AI)
    }

    /**
     * Đọc to văn bản dùng FPT.AI (Cách 2 - Qua Server)
     */
    async function speak(text) {
        // 1. Dừng mọi âm thanh đang phát (nếu có)
        window.speechSynthesis.cancel(); // Tắt giọng trình duyệt (phòng hờ)

        try {
            // 2. Gửi văn bản cần đọc lên server của CHÍNH MÌNH
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text }),
            });

            if (!response.ok) {
                throw new Error('Server không thể tạo file âm thanh');
            }

            const data = await response.json();
            const mp3Url = data.url;

            // 3. Tạo một đối tượng Audio và phát link MP3
            const audio = new Audio(mp3Url);
            audio.play();

        } catch (error) {
            console.error("Lỗi khi phát giọng nói FPT.AI:", error);
            // Fallback (Dự phòng): Nếu FPT lỗi, dùng giọng trình duyệt
            speakFallback(text);
        }
    }

    /**
     * Hàm dự phòng (Dùng giọng trình duyệt nếu FPT lỗi)
     */
    function speakFallback(text) {
        console.warn("Đang dùng giọng đọc dự phòng của trình duyệt.");
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        window.speechSynthesis.speak(utterance);
    }

    // --- SỬA LỖI: ĐÃ XÓA HÀM SPEAK() BỊ TRÙNG Ở ĐÂY ---

});