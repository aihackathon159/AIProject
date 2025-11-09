document.addEventListener('DOMContentLoaded', () => {
    
    // (1) Cấu hình Firebase của bạn sẽ ở đây
    // const firebaseConfig = { ... };
    // firebase.initializeApp(firebaseConfig);
    // const db = firebase.firestore();

    const newChatBtn = document.getElementById('new-chat-btn');
    const chatList = document.getElementById('chat-history-list');

    // Nút tạo chat mới
    newChatBtn.addEventListener('click', () => {
        window.location.href = 'index.html'; // Chỉ cần chuyển đến trang chat
    });

    // Hàm tải lịch sử (Đây là phần dùng Firebase)
    function loadChatHistory() {
        chatList.innerHTML = ''; // Xóa chữ "Đang tải"
        
        // --- GIẢ LẬP DỮ LIỆU (Vì chưa có Firebase) ---
        // Khi có Firebase, bạn sẽ dùng: db.collection("sessions").get().then(...)
        const mockSessions = [
            { id: 'session123', timestamp: new Date(), title: 'Cuộc trò chuyện 1' },
            { id: 'session456', timestamp: new Date(), title: 'Cuộc trò chuyện 2' }
        ];
        
        if (mockSessions.length === 0) {
            chatList.innerHTML = '<li>Chưa có lịch sử chat.</li>';
            return;
        }

        mockSessions.forEach(session => {
            const li = document.createElement('li');
            li.textContent = `${session.title} (ID: ${session.id})`;
            li.style.cursor = 'pointer';
            
            // Quan trọng: Khi nhấn vào, chuyển đến trang chat với ID
            li.addEventListener('click', () => {
                window.location.href = `index.html?id=${session.id}`;
            });
            chatList.appendChild(li);
        });
        // --- KẾT THÚC GIẢ LẬP ---
    }
    
    loadChatHistory();
});