document.addEventListener('DOMContentLoaded', () => {
    
    // --- CẤU HÌNH FIREBASE ---
    // Bạn cần dán Firebase config của bạn vào đây và bỏ comment
    /*
    const firebaseConfig = {
        apiKey: "...",
        authDomain: "...",
        projectId: "...",
        storageBucket: "...",
        messagingSenderId: "...",
        appId: "..."
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    */

    const newChatBtn = document.getElementById('new-chat-btn');
    const chatList = document.getElementById('chat-history-list');
    const evalSection = document.getElementById('evaluation-section');

    // --- SỰ KIỆN ---
    newChatBtn.addEventListener('click', () => {
        // Chuyển đến trang chat, không cần ID
        window.location.href = 'index.html';
    });

    // --- HÀM ---

    /**
     * Tải tất cả các kênh chat (sessions) từ Firebase
     */
    function loadChatHistory() {
        chatList.innerHTML = '<li>Đang tải lịch sử...</li>';
        
        // --- CODE THẬT (thay thế mock) ---
        /*
        db.collection("sessions").orderBy("timestamp", "desc").get().then(snapshot => {
            chatList.innerHTML = ''; // Xóa chữ "Đang tải"
            if (snapshot.empty) {
                chatList.innerHTML = '<li>Chưa có lịch sử chat.</li>';
                return;
            }
            
            snapshot.forEach(doc => {
                const session = doc.data();
                const sessionId = doc.id;
                
                const li = document.createElement('li');
                // Giả sử mỗi session có 1 tin nhắn đầu tiên để làm tiêu đề
                li.textContent = session.title || `Cuộc trò chuyện ngày ${new Date(session.timestamp?.toDate()).toLocaleString()}`;
                
                // Khi nhấn vào, chuyển đến trang chat với ID
                li.addEventListener('click', () => {
                    window.location.href = `index.html?id=${sessionId}`;
                });
                chatList.appendChild(li);
            });
        });
        */

        // --- GIẢ LẬP DỮ LIỆU (Xóa khi dùng Firebase) ---
        const mockSessions = [
            { id: 'session123', title: 'Cuộc trò chuyện về Động vật' },
            { id: 'session456', title: 'Tập nói về Màu sắc' }
        ];
        
        chatList.innerHTML = '';
        mockSessions.forEach(session => {
            const li = document.createElement('li');
            li.textContent = `${session.title}`;
            li.addEventListener('click', () => {
                window.location.href = `index.html?id=${session.id}`;
            });
            chatList.appendChild(li);
        });
        // --- KẾT THÚC GIẢ LẬP ---
    }
    
    // Tải đánh giá (Logic cho "Đánh giá mức độ trẻ tiến bộ")
    function loadEvaluation(sessionId) {
        // Hàm này sẽ phức tạp, cần gọi /api/evaluate như đã bàn
        evalSection.innerHTML = `<p>Đang tải đánh giá cho ${sessionId}...</p>`;
        // ... (Code gọi backend /api/evaluate) ...
    }

    // --- CHẠY LẦN ĐẦU ---
    loadChatHistory();
});