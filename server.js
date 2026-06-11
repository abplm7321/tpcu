const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken'); // 引入 JWT
const bcrypt = require('bcryptjs'); // 引入加密套件

const app = express();

// ⭕ 修正點一：將重複的 app.listen 統一移到最底部，並設定正確的雲端連接埠
const PORT = process.env.PORT || 10000; 
const JWT_SECRET = 'your_super_secret_key_12345'; // JWT 的加密金鑰

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 雲端資料庫連線
const atlasUrl = process.env.MONGODB_URI || "mongodb+srv://abplm7321_db_user:KtTelOMRRUgi4bjN@cluster0.qcmrecc.mongodb.net/test?appName=Cluster0";
mongoose.connect(atlasUrl)
    .then(() => {
        console.log("MongoDB Atlas 雲端資料庫連線成功！");
        initCabinets();
        initAdminAccount(); // 初始化預設管理員帳號
    })
    .catch(err => console.error("雲端資料庫連線失敗:", err));

// --- 資料結構定義 ---
const cabinetSchema = new mongoose.Schema({ id: Number, name: String });
const Cabinet = mongoose.model('Cabinet', cabinetSchema);

const bookSchema = new mongoose.Schema({ title: String, author: String, cabinetId: Number });
const Book = mongoose.model('Book', bookSchema);

// 管理員帳號結構
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', adminSchema);

// --- 初始化功能 ---
async function initCabinets() {
    if (await Cabinet.countDocuments() === 0) {
        let list = [];
        for (let i = 1; i <= 60; i++) list.push({ id: i, name: `第 ${i} 櫃` });
        await Cabinet.insertMany(list);
    }
}

// 自動建立管理員帳號 
async function initAdminAccount() {
    if (await Admin.countDocuments() === 0) {
        const hashedPassword = await bcrypt.hash('library-tpcu', 10);
        await Admin.create({ username: 'library', password: hashedPassword });
        console.log("全新管理員帳號已自動加密並建立！");
    }
}

// 🛡️ JWT 驗證中間件 (Middleware)
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    // 支援包含 Bearer 或直接傳送普通 Token 的格式
    const token = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader);

    if (!token) {
        return res.status(401).json({ message: "拒絕存取：未提供驗證 Token，請先登入" });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.admin = verified; 
        next(); 
    } catch (err) {
        res.status(403).json({ message: "驗證失敗：Token 已過期或無效" });
    }
}

// --- API 路由 ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 1. 管理員登入 API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ message: '帳號或密碼錯誤（找不到使用者）' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ message: '帳號或密碼錯誤（密碼不符）' });
        }

        // ⭕ 修正點二：既然引入了 JWT，登入成功就必須發放真正的「JWT 加密 Token」，否則後面 verifyToken 會解密失敗！
        const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ 
            message: '登入成功', 
            token: token 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: '伺服器內部錯誤' });
    }
});

// 公開 API
app.get('/api/cabinets', async (req, res) => res.json(await Cabinet.find().sort({ id: 1 })));
app.get('/api/books', async (req, res) => res.json(await Book.find()));

// ⭕ 修正點三：將網址路徑精準縮短為 '/api/books'，100% 對齊前端網頁的 fetch 發送路徑！
app.post('/api/books', verifyToken, async (req, res) => {
    const { title, author, cabinetId } = req.body;
    try {
        const newBook = new Book({ title, author, cabinetId: parseInt(cabinetId) });
        await newBook.save();
        res.status(201).json({ message: "書籍上架成功！" });
    } catch (err) { res.status(500).json({ message: "上架失敗" }); }
});

app.delete('/api/books/:id', verifyToken, async (req, res) => {
    try {
        await Book.findByIdAndDelete(req.params.id);
        res.json({ message: "書籍已成功下架" });
    } catch (err) { res.status(500).json({ message: "下架失敗" }); }
});

// ⭕ 修正點四：確保整個檔案只有最下方這一個監聽，並綁定 '0.0.0.0' 以防 Render 超時錯誤
app.listen(PORT, '0.0.0.0', () => {
    console.log(`伺服器成功啟動！正在監聽連接埠：${PORT}`);
});