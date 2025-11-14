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
const db = firebase.firestore(); // 'db' là biến CSDL của chúng ta


document.addEventListener('DOMContentLoaded', () => {

    // --- Lấy các phần tử DOM ---
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatList = document.getElementById('chat-history-list');

    // --- Lấy các phần tử Modal (CODE MỚI) ---
    const modal = document.getElementById('new-chat-modal');
    const modalForm = document.getElementById('new-chat-form');
    const cancelChatBtn = document.getElementById('cancel-chat-btn');
    const createChatBtn = document.getElementById('create-chat-btn');
    const titleInput = document.getElementById('chat-title-input');
    const topicInput = document.getElementById('chat-topic-input');
    const vocabInput = document.getElementById('chat-vocab-input');

    // === LOGIC MODAL (CODE MỚI) ===

    // 1. Khi nhấn nút "+ Tạo cuộc trò chuyện mới" -> Hiển thị Modal
    newChatBtn.addEventListener('click', () => {
        modal.style.display = 'flex'; // Hiển thị modal
        titleInput.value = `Trò chuyện ngày ${new Date().toLocaleDateString('vi-VN')}`; // Gợi ý title
        topicInput.value = '';
        vocabInput.value = '';
        createChatBtn.disabled = false;
        createChatBtn.textContent = "Tạo";
    });

    // 2. Khi nhấn nút "Hủy"
    cancelChatBtn.addEventListener('click', () => {
        modal.style.display = 'none'; // Ẩn modal
    });

    // 3. Khi nhấn bên ngoài modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) { // Chỉ ẩn nếu nhấn vào nền mờ
            modal.style.display = 'none';
        }
    });

    // 4. Khi nhấn "Tạo" (gửi form)
    modalForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Ngăn form tải lại trang

        // Lấy dữ liệu
        const title = titleInput.value.trim();
        const topic = topicInput.value.trim();
        const vocabulary = vocabInput.value.trim();

        // Kiểm tra
        if (!title || !topic || !vocabulary) {
            alert("Vui lòng nhập đầy đủ cả 3 trường thông tin.");
            return;
        }

        // Vô hiệu hóa nút
        createChatBtn.disabled = true;
        createChatBtn.textContent = "Đang tạo...";

        // Tạo session mới trong Firebase VỚI 3 TRƯỜNG MỚI
        db.collection("sessions").add({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            title: title,
            topic: topic,           // <-- TRƯỜNG MỚI
            vocabulary: vocabulary  // <-- TRƯỜNG MỚI
        })
        .then((docRef) => {
            console.log("Đã tạo session mới với ID:", docRef.id);
            window.location.href = `index.html?id=${docRef.id}`; // Chuyển hướng
        })
        .catch((error) => {
            console.error("Lỗi khi tạo session mới:", error);
            alert("Không thể tạo cuộc trò chuyện mới. Vui lòng thử lại.");
            // Kích hoạt lại nút nếu lỗi
            createChatBtn.disabled = false;
            createChatBtn.textContent = "Tạo";
        });
    });

    // === KẾT THÚC LOGIC MODAL ===


    /**
     * Hàm tải lịch sử chat (Code Firebase thật)
     * Hàm này không đổi, nó đã lấy 'session.title' nên sẽ tự động chạy đúng
     */
    function loadChatHistory() {
        chatList.innerHTML = ''; // Xóa chữ "Đang tải"

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