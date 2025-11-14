// --- BƯỚC 1: DÁN CONFIG CỦA BẠN VÀO ĐÂY ---
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

document.addEventListener('DOMContentLoaded', () => {
    
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatList = document.getElementById('chat-history-list');

    loadChatHistory();
    
    // --- LOGIC TẠO CUỘC TRÒ CHUYỆN MỚI (3 INPUT) ---
    newChatBtn.addEventListener('click', () => {
        
        // 1. Lấy Tên, Chủ đề và Từ vựng từ người dùng (sử dụng 3 prompt)
        const chatTitle = prompt("1/3. Nhập Tên đoạn chat (ví dụ: Học về Động vật):");
        if (!chatTitle) return; 
        
        const topic = prompt("2/3. Nhập Chủ đề (ví dụ: Động vật trong vườn thú):");
        if (!topic) return; 

        const vocab = prompt("3/3. Nhập Từ vựng cần học (cách nhau bởi dấu phẩy, ví dụ: Hổ, Voi, Hươu):");
        if (!vocab) return; 

        newChatBtn.disabled = true;
        newChatBtn.textContent = "Đang tạo...";

        // 2. Lưu Session mới vào CSDL
        db.collection("sessions").add({
            title: chatTitle, // Dùng Tên đoạn chat làm Title hiển thị
            topic: topic,     // Lưu Chủ đề
            vocabulary: vocab, // Lưu Từ vựng
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then((docRef) => {
            console.log("Session mới được tạo với ID: ", docRef.id);
            // 3. Chuyển hướng đến trang chat
            window.location.href = `index.html?id=${docRef.id}`;
        })
        .catch((error) => {
            console.error("Lỗi tạo session:", error);
            newChatBtn.disabled = false;
            newChatBtn.textContent = "Tạo cuộc trò chuyện mới";
        });
    });

    /**
     * Hàm tải lịch sử chat và TẠO NÚT CLICK/XÓA
     */
    function loadChatHistory() {
        chatList.innerHTML = '<li>Đang tải lịch sử...</li>'; 
        
        db.collection("sessions").orderBy("createdAt", "desc").get()
          .then((querySnapshot) => {
              chatList.innerHTML = ''; 
              if (querySnapshot.empty) {
                  chatList.innerHTML = '<li class="empty-list">Chưa có lịch sử chat.</li>';
                  return;
              }

              querySnapshot.forEach((doc) => {
                  const session = doc.data();
                  const sessionId = doc.id;
                  
                  const li = document.createElement('li');
                  li.className = 'chat-item';
                  
                  const titleSpan = document.createElement('span');
                  titleSpan.textContent = session.title || `Session (ID: ${sessionId})`;
                  titleSpan.className = 'chat-title-text';
                  
                  // LOGIC CHUYỂN HƯỚNG KHI CLICK VÀO TÊN CHAT
                  titleSpan.addEventListener('click', () => {
                      window.location.href = `index.html?id=${sessionId}`;
                  });
                  
                  // NÚT XÓA 
                  const deleteBtn = document.createElement('button');
                  deleteBtn.textContent = 'Xóa';
                  deleteBtn.className = 'delete-btn';
                  deleteBtn.title = 'Xóa vĩnh viễn cuộc trò chuyện này';
                  deleteBtn.addEventListener('click', (e) => {
                      e.stopPropagation(); // Ngăn chặn sự kiện click lan ra titleSpan
                      deleteSession(sessionId, li);
                  });
                  
                  li.appendChild(titleSpan);
                  li.appendChild(deleteBtn);
                  chatList.appendChild(li);
              });
          })
          .catch((error) => {
              console.error("Lỗi tải danh sách session:", error);
              chatList.innerHTML = '<li class="error-list">Lỗi khi tải lịch sử.</li>';
          });
    }

    /**
     * Hàm XÓA Session và toàn bộ tin nhắn liên quan
     */
    async function deleteSession(sessionId, listItemElement) {
        if (!confirm("⚠️ Bạn có chắc chắn muốn xóa cuộc trò chuyện này và toàn bộ tin nhắn liên quan? Đây là hành động không thể hoàn tác.")) {
            return;
        }

        try {
            // Hiển thị trạng thái đang xóa
            listItemElement.style.opacity = '0.5';
            listItemElement.querySelector('.delete-btn').textContent = 'Đang xóa...';
            listItemElement.querySelector('.delete-btn').disabled = true;
            
            // 1. Xóa Subcollection 'messages' (Sử dụng batch)
            const messagesRef = db.collection("sessions").doc(sessionId).collection("messages");
            const snapshot = await messagesRef.get();
            
            if (!snapshot.empty) {
                const batch = db.batch();
                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                console.log(`Đã xóa ${snapshot.size} tin nhắn cho session ${sessionId}`);
            }
            
            // 2. Xóa tài liệu session chính
            await db.collection("sessions").doc(sessionId).delete();
            
            // 3. Cập nhật UI
            listItemElement.remove();
            if (chatList.children.length === 0) {
                 loadChatHistory();
            }
            
        } catch (error) {
            console.error("Lỗi xóa session:", error);
            alert("Lỗi khi xóa cuộc trò chuyện: " + error.message + ". Vui lòng thử lại.");
            
            // Khôi phục UI nếu xóa thất bại
            listItemElement.style.opacity = '1';
            listItemElement.querySelector('.delete-btn').textContent = 'Xóa';
            listItemElement.querySelector('.delete-btn').disabled = false;
        }
    }
});