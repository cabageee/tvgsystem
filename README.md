# Thiên Vy Global — Hệ thống quản lý học viên

Ứng dụng web nội bộ hỗ trợ quản lý học viên, lớp học, điểm danh, học phí, trợ giảng và công việc. Giao diện được chia thành các trang HTML riêng; dữ liệu chính được lưu trong Google Sheets và xử lý qua Google Apps Script.

## Mục lục

- [Tính năng](#tính-năng)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Yêu cầu](#yêu-cầu)
- [Chạy dự án trên máy cá nhân](#chạy-dự-án-trên-máy-cá-nhân)
- [Cấu hình Google Sheets và Apps Script](#cấu-hình-google-sheets-và-apps-script)
- [Triển khai website và PWA](#triển-khai-website-và-pwa)
- [Các trang trong ứng dụng](#các-trang-trong-ứng-dụng)
- [Tracker công việc](#tracker-công-việc)
- [Avatar học viên](#avatar-học-viên)
- [CSS, thư viện và kiểm thử](#css-thư-viện-và-kiểm-thử)
- [Khắc phục sự cố](#khắc-phục-sự-cố)
- [Bảo mật và giới hạn hiện tại](#bảo-mật-và-giới-hạn-hiện-tại)

## Tính năng

- Quản lý hồ sơ, lớp/cấp độ, trợ giảng và phân công học viên.
- Điểm danh, xem tổng kết trong ngày, theo dõi học viên nghỉ học và trạng thái học phí.
- Quản lý gói học, thanh toán và các thông tin liên quan đến buổi học.
- Tracker theo dõi nhiệm vụ, tiến độ, yêu cầu hoàn thành và đơn nghỉ/tăng ca.
- Tải avatar lên Google Drive thông qua Apps Script.
- Thông báo trong ứng dụng, bao gồm nhắc sinh nhật trong 3 ngày tới.
- Giao diện responsive cho máy tính và điện thoại; có thể cài như PWA trên trình duyệt hỗ trợ.
- Menu quản trị nằm cạnh nút Theo dõi công việc trên trang chính; chọn logo hoặc tên Thiên Vy Global để quay lại trang chính.
- Các thao tác cập nhật phản hồi ngay trên giao diện ở những luồng phù hợp; các lần tải lại dữ liệu gần nhau được gộp và thao tác ghi được khóa tuần tự để hạn chế ghi đè khi nhiều người dùng đồng thời.

## Cấu trúc dự án

| Tệp/thư mục | Vai trò |
|---|---|
| `index.html` | Trang chính, đăng nhập và giao diện quản trị/tổng quan |
| `profiles.html` | Hồ sơ học viên |
| `assignments.html` | Phân công học viên cho trợ giảng |
| `attendance.html` | Điểm danh của Giám đốc |
| `daily-summary.html` | Tổng kết điểm danh trong ngày |
| `inactive-students.html` | Danh sách học viên đã nghỉ |
| `teachers.html` | Quản lý trợ giảng |
| `levels.html` | Quản lý cấp độ |
| `teacher-attendance.html` | Điểm danh và khu vực Tracker của trợ giảng |
| `change-password.html` | Đổi mật khẩu |
| `executive-tracker.html` | Giao diện Tracker của Giám đốc, Manager và trợ giảng |
| `app.js` | Logic giao diện, đăng nhập, API và thao tác nghiệp vụ |
| `app.css`, `tailwind.css` | Kiểu giao diện |
| `tailwind.input.css`, `tailwind.config.js` | Đầu vào và cấu hình build Tailwind |
| `tracker-backend.gs.txt` | Mã Google Apps Script cho dữ liệu và Tracker |
| `server.js` | API Node/Express hỗ trợ kết nối cục bộ với Apps Script |
| `service-worker.js`, `manifest.webmanifest` | Cache giao diện và cấu hình PWA |
| `assets/` | Font và tài nguyên tĩnh |

Giữ các trang HTML, `app.js`, CSS, manifest, icon và tài nguyên cần thiết cùng cấu trúc thư mục khi triển khai. `node_modules/` không phải nội dung website để tải lên hosting.

## Yêu cầu

- Trình duyệt hiện đại. HTTPS được yêu cầu để PWA/service worker hoạt động trên hosting; `localhost` được phép khi phát triển.
- Node.js 18 trở lên và npm nếu cần build CSS, chạy kiểm thử hoặc dùng API Node cục bộ.
- Một Google Spreadsheet và một dự án Google Apps Script có quyền truy cập Spreadsheet/Drive tương ứng.

## Chạy dự án trên máy cá nhân

### 1. Cài dependency

Tại thư mục dự án:

```sh
npm install
```

### 2. Mở giao diện qua HTTP

Không mở trực tiếp bằng `file://`: đăng nhập, API và service worker cần một origin HTTP/HTTPS. Có thể dùng Python để phục vụ các tệp tĩnh:

```sh
py -m http.server 8000
```

Mở `http://localhost:8000/` trong trình duyệt. Nếu máy không có lệnh `py`, dùng:

```sh
python -m http.server 8000
```

### 3. (Tuỳ chọn) Chạy API Node cục bộ

Trong một terminal khác:

```sh
node server.js
```

Mặc định API chạy tại `http://localhost:3002`; kiểm tra máy chủ bằng `http://localhost:3002/api/health`. Có thể đổi cổng bằng biến môi trường `PORT`. Khi giao diện chạy trên HTTP, ứng dụng thử proxy cục bộ này trước và dùng JSONP trực tiếp tới Apps Script nếu proxy không khả dụng.

`server.js` không phục vụ các trang HTML; cần giữ máy chủ tĩnh ở bước trên. Không mở public cổng Node này như một backend production: API proxy hiện chưa có cơ chế xác thực người gọi.

Khi có nhiều người dùng trên các thiết bị khác nhau, mỗi trình duyệt vẫn kết nối cùng deployment Apps Script/Google Sheets. Apps Script tuần tự hóa các thao tác ghi để tránh hai yêu cầu cùng ghi đè một lúc; không cần bật API Node trên máy người dùng. Bộ nhớ đệm trong trình duyệt chỉ hỗ trợ hiển thị nhanh, còn dữ liệu chính vẫn được xác nhận bởi Google Sheets.

## Cấu hình Google Sheets và Apps Script

Ứng dụng hiện sử dụng URL Apps Script được khai báo trực tiếp trong `app.js`, `executive-tracker.html` và `server.js`. Mã backend lấy Spreadsheet ID từ `SPREADSHEET_ID` trong `tracker-backend.gs.txt`. Khi dùng dự án Google của riêng bạn, hãy cập nhật các cấu hình này và bảo đảm URL `/exec` trỏ cùng một deployment.

### Cài đặt lần đầu

1. Tạo hoặc chọn Google Spreadsheet dành cho ứng dụng.
2. Tạo/mở một Apps Script project gắn với Spreadsheet hoặc dùng Spreadsheet ID riêng.
3. Dán nội dung `tracker-backend.gs.txt` vào Apps Script; cập nhật `SPREADSHEET_ID` nếu cần.
4. Chạy hàm `initDatabase` một lần trong trình chỉnh sửa Apps Script và cấp quyền được yêu cầu. Hàm tạo các sheet còn thiếu, không xoá dữ liệu hiện có.
5. Triển khai Apps Script dưới dạng **Web app**, chọn **Execute as: Me**. Chọn phạm vi người dùng có thể truy cập phù hợp với chính sách dữ liệu của tổ chức.
6. Sao chép URL `/exec` của deployment vào cấu hình trong `app.js`, `executive-tracker.html` và `server.js` nếu URL đã thay đổi.
7. Tạo tài khoản trợ giảng trong sheet `TroGiang`, cập nhật cấu hình trong `CauHinh`, rồi kiểm thử đăng nhập và đọc/ghi dữ liệu.
8. Khi cập nhật mã Apps Script đã triển khai, vào **Deploy → Manage deployments → Edit → New version**. Giữ URL deployment hiện tại nếu có thể; nếu URL đổi, cập nhật lại các cấu hình ở bước 6.

### Các sheet được khởi tạo

`initDatabase` tạo các sheet sau nếu chưa có:

- `ThongTinHocSinh` — hồ sơ học viên.
- `DiemDanh` — đăng ký và tối đa 40 buổi điểm danh.
- `HocVienNghiHoc` — học viên đã nghỉ.
- `TroGiang` — tên tài khoản và mật khẩu trợ giảng.
- `CauHinh` — cấp độ, cấu hình quản trị và Manager Tracker.
- `TrackerTasks` — nhiệm vụ, trạng thái Tracker, lịch lặp hàng tuần và báo cáo tiến độ/vấn đề. Các cột Tracker bổ sung được tự thêm khi tải Tracker.
- `TrackerRequests` — đơn nghỉ/tăng ca.

Không đổi tên sheet hoặc sửa thứ tự cột nếu chưa cập nhật các hàm đọc/ghi tương ứng trong Apps Script. Hãy sao lưu Spreadsheet trước khi thay đổi cấu trúc hoặc triển khai backend mới.

## Triển khai website và PWA

Đưa các tệp giao diện và tài nguyên cần thiết lên hosting tĩnh có HTTPS, ví dụ GitHub Pages hoặc hosting nội bộ hỗ trợ HTTPS. Sau khi triển khai, kiểm tra trang đăng nhập, các URL HTML riêng và kết nối Apps Script.

PWA dùng `manifest.webmanifest`, icon và `service-worker.js`. Service worker cache giao diện để có thể mở lại một số trang sau khi đã tải chúng khi có mạng. **Cache này không lưu dữ liệu Google Sheets và không cung cấp chế độ ghi offline**; đăng nhập, đồng bộ và các chức năng gọi dịch vụ ngoài vẫn cần Internet.

Khi thêm hoặc đổi tệp giao diện cần cache, cập nhật danh sách `APP_FILES` và `CACHE_NAME` trong `service-worker.js` để trình duyệt nhận bản mới. Sau khi deploy, nếu thiết bị vẫn hiển thị giao diện cũ, đóng/mở lại ứng dụng hoặc xoá cache/site data của website rồi tải lại.

## Các trang trong ứng dụng

- **Giám đốc:** tổng quan, hồ sơ học viên, phân công, điểm danh, tổng kết, học viên nghỉ, quản lý trợ giảng/cấp độ và đổi mật khẩu.
- **Trợ giảng:** danh sách lớp được phân công, điểm danh hôm nay, ghi chú tiến độ và Tracker nhiệm vụ.
- Trong giao diện trợ giảng, nút **Điểm danh hôm nay** ghi ngày hiện tại vào buổi còn trống tiếp theo. Nút không khả dụng nếu học viên đã được điểm danh trong ngày hoặc đã hết buổi học.
- Việc chuyển trang dùng URL HTML riêng. Phiên đăng nhập được lưu trong `sessionStorage` để duy trì khi chuyển trang trong cùng trình duyệt/tab.
- Thông báo sinh nhật xuất hiện tối đa một lần mỗi ngày trên trình duyệt đang dùng. Trung tâm thông báo lưu tối đa 30 thông báo gần nhất trong ngày cục bộ; đây là thông báo trong ứng dụng, không phải Web Push.
- Lịch sử ở nút **Thông báo** được làm mới theo ngày. Mỗi lần trợ giảng đăng nhập, popup tổng quan ưu tiên hiển thị số học viên cần chăm sóc và cần gia hạn, sau đó là task cần nhận và thời gian còn lại đến deadline.

## Tracker công việc

Tracker sử dụng cùng Google Apps Script và Spreadsheet với ứng dụng chính. Phiên Tracker được Apps Script cấp khi đăng nhập website, có thời hạn 6 giờ; người dùng không cần đăng nhập lại ở trang Tracker.

### Vai trò và luồng công việc

- **Giám đốc:** giao nhiệm vụ tuần P1, quản lý quyền Manager, duyệt yêu cầu hoàn thành và duyệt/từ chối đơn nghỉ hoặc tăng ca.
- **Manager:** giao nhiệm vụ tuần P2 cho trợ giảng khác, quản lý task trong Tracker, xem và cập nhật nhiệm vụ được giao trực tiếp cho mình, và duyệt yêu cầu hoàn thành. Manager không có quyền duyệt đơn nghỉ/tăng ca.
- **Trợ giảng:** nhận nhiệm vụ tuần, cập nhật ghi chú, gửi output hoàn thành riêng; có thể tạo việc cá nhân P3/P4 và gửi đơn nghỉ/tăng ca.
- Với task giao nhiều trợ giảng, mỗi người gửi output riêng. Task chỉ chuyển sang chờ duyệt khi tất cả người được giao đã gửi; Giám đốc/Manager xem output và số lượng đã gửi theo từng người rồi duyệt task một lần. Nếu task bị trả lại, mọi người phải gửi lại output.
- Khi hết tuần, task tuần đã hoàn thành được lưu trữ; task chưa hoàn thành tiếp tục giữ nguyên để theo dõi. Task bật **Lặp lại hàng tuần** được giao lại ở trạng thái mới, deadline được chuyển thêm một tuần và trợ giảng cần nhận lại.
- Trợ giảng có thể gửi **Báo cáo tiến độ** gồm phần đã làm và vấn đề cần hỗ trợ; Giám đốc/Manager xem báo cáo trong bảng task đã nhận. Báo cáo mới nhất được giữ trên task.
- **Việc cá nhân P3/P4:** P3 là ưu tiên trước, P4 là ưu tiên sau. Người tạo cập nhật ghi chú và tự đánh dấu hoàn thành, không cần Manager/Giám đốc duyệt.
- Trợ giảng chỉ nhận dữ liệu task/đơn thuộc tài khoản của mình. Manager và Giám đốc có trang Tracker riêng theo vai trò; Manager có thể mở cả lối vào **Công việc của tôi** và **Quản lý tiến độ**. Vai trò thực tế luôn lấy từ phiên Apps Script; nếu tài khoản được nhận diện là trợ giảng, trang chỉ hiển thị và cho thao tác trên nhiệm vụ được giao cho tài khoản đó.

### Cập nhật tức thời và đồng bộ

Một số thao tác Tracker cập nhật giao diện ngay để giảm cảm giác chờ, đồng thời gửi yêu cầu lưu lên Apps Script. Khi lưu lỗi, giao diện hoàn tác thay đổi và thông báo lỗi. Đây không phải hàng đợi ghi offline: nếu mất mạng, thao tác chưa được xác nhận là đã lưu.

### Cập nhật Apps Script cho Tracker

Sau khi thay mã backend bằng `tracker-backend.gs.txt`, chạy `initDatabase` nếu cần khởi tạo sheet, sau đó triển khai **New version** của Web app. Các thay đổi quyền và API Tracker chỉ có hiệu lực trên deployment đã cập nhật. Nếu đăng nhập báo chưa cấp quyền Tracker hoặc lỗi thiếu sheet, kiểm tra deployment và chạy khởi tạo database.

## Avatar học viên

Avatar mới được tải lên Google Drive qua Apps Script, không cần máy chủ Node riêng. Chỉ chấp nhận PNG, JPEG hoặc WebP và kích thước tối đa 5 MB.

Trong `tracker-backend.gs.txt`, có thể đặt `AVATAR_FOLDER_ID` để lưu ảnh vào một thư mục Drive cụ thể; để trống thì Apps Script tạo/dùng thư mục của tài khoản triển khai. Khi được yêu cầu, cấp quyền Drive cho Apps Script và triển khai **New version** sau khi cập nhật mã.

Ảnh được chia sẻ bằng liên kết để website có thể hiển thị. Cân nhắc chính sách quyền truy cập và dữ liệu cá nhân trước khi tải ảnh thật lên. Avatar đang dùng URL lưu trữ cũ không được tự động di chuyển; cần tải lại ảnh và cập nhật hồ sơ tương ứng.

## CSS, thư viện và kiểm thử

Tailwind được biên dịch sẵn thành `tailwind.css`; trình duyệt không tải Tailwind CDN khi mở trang. Sau khi thay utility class trong HTML hoặc `app.js`, build lại:

```sh
npm run build:css
```

Thư viện Excel, PDF và PNG được tải khi người dùng gọi chức năng xuất tương ứng, không tải trước trong luồng mở trang.

Chạy bộ kiểm tra cú pháp:

```sh
npm test
```

Bộ test chạy `node --check app.js` và kiểm tra cú pháp các script nội tuyến trên các trang HTML. Kiểm tra cú pháp riêng cho mã Apps Script:

```sh
node -e "new Function(require('fs').readFileSync('tracker-backend.gs.txt','utf8')); console.log('Tracker backend syntax OK')"
```

Kiểm tra cú pháp không thay thế cho việc thử đăng nhập và thao tác trên một Spreadsheet thử nghiệm.

## Khắc phục sự cố

| Hiện tượng | Hướng kiểm tra |
|---|---|
| Không đăng nhập được hoặc báo chưa cấp quyền Tracker | Kiểm tra URL `/exec`, quyền triển khai và phiên bản Apps Script; xác nhận backend có `verifyLogin` và cấp token Tracker. |
| Báo thiếu sheet | Mở Apps Script, chạy `initDatabase`, cấp quyền nếu được hỏi rồi tải lại trang. |
| Trang tải được nhưng dữ liệu không đồng bộ | Kiểm tra Internet, URL Apps Script và quyền truy cập Spreadsheet của tài khoản triển khai. Xem thông báo lỗi trên trang và log Apps Script. |
| API proxy local không hoạt động | Kiểm tra `node server.js`, cổng `3002` hoặc giá trị `PORT`; có thể tiếp tục dùng JSONP trực tiếp nếu môi trường cho phép. |
| Tracker/website vẫn hiện phiên bản cũ | Kiểm tra deployment đã chọn **New version**; làm mới cache trình duyệt/service worker. |
| PWA không cài được | Dùng HTTPS hoặc `localhost`, kiểm tra manifest, icon và service worker trong DevTools. |
| Avatar tải thất bại | Kiểm tra quyền Drive của Apps Script, giới hạn định dạng/kích thước, deployment mới nhất và dung lượng Drive. |
| CSS mới không xuất hiện | Chạy `npm run build:css`, xác nhận `tailwind.css` được cập nhật và triển khai tệp đó cùng HTML. |

## Bảo mật và giới hạn hiện tại

- Không đưa mật khẩu hoặc dữ liệu nhạy cảm vào mã frontend, README, repository công khai hay log.
- Đổi mật khẩu quản trị mặc định trước khi dùng thật. Backend hiện có giá trị mặc định `123456`; một số tài khoản trợ giảng không có mật khẩu cũng có thể rơi về giá trị mặc định này.
- Mật khẩu trợ giảng hiện được lưu trong Google Sheet; giới hạn quyền xem/sửa Spreadsheet chỉ cho người cần thiết.
- Các trang web gọi Apps Script bằng JSONP ở một số môi trường; tham số đăng nhập có thể xuất hiện trong URL của yêu cầu HTTPS. Tránh đăng nhập qua mạng/máy tính không đáng tin cậy.
- Các API dữ liệu học viên cũ chưa được bảo vệ đồng nhất bằng phiên/kiểm tra vai trò ở backend. Phân quyền Tracker không đồng nghĩa toàn bộ API đã được bảo vệ.
- Deployment Apps Script chạy với quyền tài khoản triển khai có thể đọc/ghi Spreadsheet và Drive. Chỉ triển khai trong phạm vi người dùng phù hợp với mức độ nhạy cảm của dữ liệu; không xem URL deployment như cơ chế xác thực.
- `server.js` hiện có CORS mở và endpoint proxy không xác thực người gọi. Chỉ dùng trong môi trường phát triển cục bộ; không đưa server này lên Internet nếu chưa thiết kế xác thực, giới hạn truy cập và bảo vệ dữ liệu.
- Tối ưu Tracker hiện làm giao diện phản hồi nhanh hơn nhưng không giảm độ trễ xử lý của chính Google Apps Script/Google Sheets. Không thực hiện thao tác ghi khi offline và không đảm bảo lưu thành công cho tới khi nhận được phản hồi xác nhận.

Nếu ứng dụng cần dùng với dữ liệu cá nhân thật trên diện rộng, nên chuyển API sang backend có xác thực, phân quyền đồng nhất, HTTPS và phương thức POST; đồng thời rà soát lại chính sách truy cập Spreadsheet/Drive trước khi triển khai.
