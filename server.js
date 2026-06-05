const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken'); // 引入 JWT
const bcrypt = require('bcryptjs'); // 引入加密套件

const app = express();
const PORT = process.env.PORT || 3000; 
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`伺服器運行中，監聽連接埠：${PORT}`);
    });
const JWT_SECRET = 'your_super_secret_key_12345'; // JWT 的加密金鑰（私鑰）

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 雲端資料庫連線 (請換成你自己的 Atlas 網址)
const atlasUrl = process.env.MONGODB_URI || "mongodb+srv://abplm7321_db_user:KtTelOMRRUgi4bjN@cluster0.qcmrecc.mongodb.net/?appName=Cluster0";
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

// 自動建立一個測試用的管理員帳號 
async function initAdminAccount() {
    if (await Admin.countDocuments() === 0) {
        // 🔑 設定密碼
        const hashedPassword = await bcrypt.hash('library-tpcu', 10);
        
        // 👤 設定帳號
        await Admin.create({ username: 'library', password: hashedPassword });
        
        console.log("全新管理員帳號已自動加密並建立！");
    }
}

// 🛡️ 關鍵：JWT 驗證中間件 (Middleware)
function verifyToken(req, res, next) {
    // 從 HTTP Headers 提取 Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // 格式通常是 "Bearer TOKEN字串"

    if (!token) {
        return res.status(401).json({ message: "拒絕存取：未提供驗證 Token，請先登入" });
    }

    try {
        // 解密驗證 Token
        const verified = jwt.verify(token, JWT_SECRET);
        req.admin = verified; // 將解析出來的管理員資訊掛在 req 上
        next(); // 驗證成功，放行進入下一個路由
    } catch (err) {
        res.status(403).json({ message: "驗證失敗：Token 已過期或無效" });
    }
}

// --- API 路由 ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 1. 管理員登入 API
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = await Admin.findOne({ username });
        if (!admin) return res.status(400).json({ message: "帳號或密碼錯誤" });

        // 比對密碼
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(400).json({ message: "帳號或密碼錯誤" });

        // 密碼正確，簽發 JWT Token (設定 1 小時後過期)
        const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: "登入成功！", token });
    } catch (err) {
        res.status(500).json({ message: "伺服器錯誤" });
    }
});

// 公開 API：一般大眾可以看櫃子跟書籍
app.get('/api/cabinets', async (req, res) => res.json(await Cabinet.find().sort({ id: 1 })));
app.get('/api/books', async (req, res) => res.json(await Book.find()));

// 🔒 保護 API：加入 verifyToken 中間件，沒登入的人無法操作
app.post('/api/admin/books', verifyToken, async (req, res) => {
    const { title, author, cabinetId } = req.body;
    try {
        const newBook = new Book({ title, author, cabinetId: parseInt(cabinetId) });
        await newBook.save();
        res.status(201).json({ message: "書籍上架成功！" });
    } catch (err) { res.status(500).json({ message: "上架失敗" }); }
});

app.delete('/api/admin/books/:id', verifyToken, async (req, res) => {
    try {
        await Book.findByIdAndDelete(req.params.id);
        res.json({ message: "書籍已成功下架" });
    } catch (err) { res.status(500).json({ message: "下架失敗" }); }
});

app.listen(PORT, () => console.log(`伺服器運行中：http://localhost:${PORT}`));