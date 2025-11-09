// --- BƯỚC 1: DÁN CONFIG CỦA BẠN VÀO ĐÂY ---
// (Tôi đã lấy từ bức ảnh của bạn)
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
const db = firebase.firestore(); // 'db' là biến CSDL của chúng ta


document.addEventListener('DOMContentLoaded', () => {
    
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatList = document.getElementById('chat-history-list');

    // === THAY ĐỔI LOGIC NÚT "TẠO MỚI" (Thêm Prompt) ===
    newChatBtn.addEventListener('click', () => {
        
        // 1. Hỏi tên cuộc trò chuyện TRƯỚC
        const title = window.prompt("Bạn muốn đặt tên cuộc trò chuyện này là gì?", `Trò chuyện ngày ${new Date().toLocaleDateString('vi-VN')}`);

        // 2. Nếu người dùng nhấn "Cancel" hoặc không nhập gì
        if (!title || title.trim() === "") {
            console.log("Đã hủy tạo session.");
            return; // Dừng lại
        }

        // 3. Tắt nút để tránh nhấn đúp
        newChatBtn.disabled = true;
        newChatBtn.textContent = "Đang tạo...";

        // 4. Tạo một session mới trong Firebase VỚI TÊN MỚI
        db.collection("sessions").add({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            title: title // <-- Sử dụng title người dùng nhập
        })
        .then((docRef) => {
            // 5. Sau khi tạo thành công, LẤY ID của nó
            console.log("Đã tạo session mới với ID:", docRef.id);
            // 6. Chuyển hướng đến trang chat VỚI ID ĐÓ
            window.location.href = `index.html?id=${docRef.id}`;
        })
        .catch((error) => {
            console.error("Lỗi khi tạo session mới:", error);
            alert("Không thể tạo cuộc trò chuyện mới. Vui lòng thử lại.");
            newChatBtn.disabled = false;
            newChatBtn.textContent = "Tạo cuộc trò chuyện mới";
        });
    });
    // === KẾT THÚC THAY ĐỔI ===

    /**
     * Hàm tải lịch sử chat (Code Firebase thật)
     */
    function loadChatHistory() {
        chatList.innerHTML = ''; // Xóa chữ "Đang tải"
        
        // === THAY THẾ CODE GIẢ LẬP ===
        db.collection("sessions").orderBy("createdAt", "desc").get()
          .then((querySnapshot) => {
              if (querySnapshot.empty) {
                  chatList.innerHTML = '<li>Chưa có lịch sử chat.</li>';
                  return;
              }

              querySnapshot.forEach((doc) => {
                  const session = doc.data();
                  const sessionId = doc.id;
                  
                  const li = document.createElement('li');
                  // Sử dụng title đã lưu khi tạo session
                  li.textContent = session.title || `Session (ID: ${sessionId})`;
                  li.style.cursor = 'pointer';
                  
                  li.addEventListener('click', () => {
                      window.location.href = `index.html?id=${sessionId}`;
                  });
                  chatList.appendChild(li);
              });
          })
          .catch((error) => {
              console.error("Lỗi tải danh sách session:", error);
              chatList.innerHTML = '<li>Lỗi khi tải lịch sử.</li>';
          });
    }
    
    loadChatHistory();
});