const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const morgan = require('morgan'); // 引入 morgan 进行日志记录

const app = express();
const upload = multer({ dest: 'uploads/' }); // 设置文件上传的存放目录

// 创建一个写入流，用于将日志写入文件（可选）
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });

// 配置 morgan 记录到控制台和文件
app.use(morgan('combined', { stream: accessLogStream })); // 将日志写入文件
app.use(morgan('combined')); // 将日志记录到控制台

app.use(express.static('public')); // 提供静态文件服务

// 获取文件列表
app.get('/api/files/:dir?', (req, res) => {
    const dirName = req.params.dir || ''; // 获取请求参数
    const dirPath = path.join(__dirname, 'uploads', dirName); // 设置工作目录

    fs.readdir(dirPath, (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${dirPath}`, err); // 记录错误日志
            return res.status(500).send(err);
        }
        console.log(`Fetched files from directory: ${dirPath}`); // 记录操作日志
        res.json(files); // 返回文件列表
    });
});

// 创建子目录
app.post('/api/create-dir', (req, res) => {
    const dirName = req.body.name;
    const dirPath = path.join(__dirname, 'uploads', dirName); 

    fs.mkdir(dirPath, { recursive: true }, (err) => {
        if (err) {
            console.error(`Error creating directory: ${dirPath}`, err); // 记录错误日志
            return res.status(500).send(err);
        }
        console.log(`Directory created: ${dirPath}`); // 记录操作日志
        res.send('Directory created.');
    });
});

// 删除子目录
app.delete('/api/delete-dir/:name', (req, res) => {
    const dirPath = path.join(__dirname, 'uploads', req.params.name); 

    fs.rmdir(dirPath, { recursive: true }, (err) => {
        if (err) {
            console.error(`Error deleting directory: ${dirPath}`, err); // 记录错误日志
            return res.status(500).send(err);
        }
        console.log(`Directory deleted: ${dirPath}`); // 记录操作日志
        res.send('Directory deleted.');
    });
});

// 上传文件
app.post('/api/upload/:dir?', upload.single('file'), (req, res) => {
    const dirName = req.params.dir || ''; 
    const uploadPath = path.join(__dirname, 'uploads', dirName, req.file.originalname); 

    fs.rename(req.file.path, uploadPath, (err) => { 
        if (err) {
            console.error(`Error uploading file: ${uploadPath}`, err); // 记录错误日志
            return res.status(500).send(err);
        }
        console.log(`File uploaded: ${uploadPath}`); // 记录操作日志
        res.send('File uploaded.'); 
    });
});

// 下载文件
app.get('/api/download/:dir?/:filename', (req, res) => {
    const dirName = req.params.dir || ''; 
    const filePath = path.join(__dirname, 'uploads', dirName, req.params.filename); 
    
    res.download(filePath, (err) => {
        if (err) {
            console.error(`Error downloading file: ${filePath}`, err); // 记录错误日志
        } else {
            console.log(`File downloaded: ${filePath}`); // 记录操作日志
        }
    });
});

// 删除文件
app.delete('/api/delete-file/:dir?/:filename', (req, res) => {
    const dirName = req.params.dir || ''; 
    const filePath = path.join(__dirname, 'uploads', dirName, req.params.filename); 

    fs.unlink(filePath, (err) => { 
        if (err) {
            console.error(`Error deleting file: ${filePath}`, err); // 记录错误日志
            return res.status(500).send(err);
        }
        console.log(`File deleted: ${filePath}`); // 记录操作日志
        res.send('File deleted.');
    });
});

// 重命名文件
app.put('/api/rename-file/:dir?', (req, res) => {
    const dirName = req.params.dir || ''; 
    const { oldName, newName } = req.body; 
    const oldPath = path.join(__dirname, 'uploads', dirName, oldName); 
    const newPath = path.join(__dirname, 'uploads', dirName, newName); 

    fs.rename(oldPath, newPath, (err) => { 
        if (err) {
            console.error(`Error renaming file: ${oldPath} to ${newPath}`, err); // 记录错误日志
            return res.status(500).send(err);
        }
        console.log(`File renamed from ${oldPath} to ${newPath}`); // 记录操作日志
        res.send('File renamed.');
    });
});

// 查看文本文件
app.get('/api/view-file/:dir?/:filename', (req, res) => {
	const dir = req.params.dir || ''; // 如果没有提供目录，则使用空字符串
	const filePath = path.join(__dirname, 'uploads', dir, req.params.filename); 
    console.log('filePath',filePath);
    fs.readFile(filePath, 'utf8', (err, data) => { 
        if (err) {
            console.error(`Error reading file: ${filePath}`, err); // 记录错误日志
            return res.status(404).send('File not found'); // 返回404错误
        }
        console.log(`File viewed: ${filePath}`); // 记录操作日志
        res.send(data); 
    });
});

app.listen(7631, () => {
    console.log('Server running on http://localhost:7631'); 
});
