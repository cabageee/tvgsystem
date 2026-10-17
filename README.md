# tvgsystem

## Avatar học viên trên Google Drive

Avatar được lưu vào Google Drive bằng chính Apps Script đang đồng bộ Google Sheet. Phần mã Apps Script đã được thêm vào file `code.gs.txt` bạn gửi.

1. Mở dự án Apps Script hiện tại và cập nhật mã bằng phiên bản trong `code.gs.txt`.
2. (Tuỳ chọn) Đặt ID thư mục Drive muốn dùng vào `AVATAR_FOLDER_ID`. Để trống sẽ lưu vào Drive của tài khoản triển khai.
3. Cấp quyền Drive khi Apps Script yêu cầu.
4. Vào **Deploy → Manage deployments**, chỉnh sửa deployment Web app hiện tại và chọn **New version**. Giữ quyền **Execute as: Me** và quyền truy cập cho người dùng website.
5. Giữ nguyên URL `/exec` hiện có; website đã gửi upload tới cùng URL này.

Web app tạo file ảnh công khai bằng quyền “Anyone with the link” để avatar hiển thị trên website. Endpoint kiểm tra định dạng PNG/JPEG/WebP và giới hạn dung lượng 5 MB. Vì deployment được gọi từ website, người có URL web app có thể gửi ảnh lên Drive.

Avatar cũ đang trỏ đến Supabase không được di chuyển tự động. Sau khi deploy endpoint mới, tải lại các avatar cũ từ thẻ hồ sơ bằng nút **Đổi avatar**.