'use strict';
// 项目入口
const os = require('os');
const path = require('path');
const fs = require('fs');
const express = require('express');
const assert = require('assert');
const debug = require('debug')('pan.mcloudhub.com:server')
const supportsColor = require('supports-color');
const favicon = require('serve-favicon');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const http = require('http');
// https模块还是测试模块，所以在这里不使用
// const https = require('https');
//引入http2模块
const http2 = require('spdy');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
const MongoDBStore = require('connect-mongodb-session')(session);
const csurf = require('csurf');
const swig = require('swig');
const bodyParser = require('body-parser');
const sillyDateTime = require('silly-datetime');
const uuidv4 = require('uuid/v4');
const expressRequestId = require('express-request-id')();
const app = express();
//是否启动记录访问日志
const START_LOG = true;
let options = {
    key: fs.readFileSync(path.join(__dirname + '/ssl/214688704260776.key')),
    cert: fs.readFileSync(path.join(__dirname + '/ssl/214688704260776.pem'))
};
//设置模板引擎
app.engine('html', swig.renderFile);
//  设置模板路径
app.set('views', path.join(__dirname, '/application/views'));
// 注册模板
app.set('view engine', 'html');
// 将模板缓存设置false
swig.setDefaults({ cache: false });
// 设置request id
app.use(expressRequestId);
// extends设置true表示接收的数据是数组，false表示是字符串
app.use(bodyParser.urlencoded({ extended: true }));
// 将提交的数据转成json,并且设置请求实体大小
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser('session_id', { maxAge: 1800000, secure: true }));
// 配置session保存在mongodb中
const store = new MongoDBStore({
    uri: 'mongodb://localhost:27017',
    databaseName: 'blog',
    collection: 'sessions'
}, err => {
    if (err) throw err;
});

store.on('error', error => {
    assert.ifError(error);
    assert.ok(false);
});

app.use(session({
    genid: function(req) {
        return uuidv4() // use UUIDs for session IDs
    },
    secret: 'session_id', // 与cookieParser中的一致
    resave: true,
    store: store, // 将session保存到mongodb中
    saveUninitialized: true,
    cookie: {
        secure: true,
        maxAge: 1800000,
    },
    rolling: true
}));

// 服务器启动时默认配置/动作
app.use(function(req, res, next) {
    // //将登录后的用户信息附加到request头信息中
    if (req.cookies.uid && req.cookies.uid != '') {
        try {
            req.session.uid = req.cookies.uid;
        } catch (e) {
            debug(e);
        }
    }
    // 将系统类型添加到cookies和请求头中;
    // os.platform return now node runing systems : darwin=>MAC win32=>windows
    res.cookie('platform', os.platform);
    req.platform = os.platform;
    next();
});

app.use(csurf({ cookie: true, ignoreMethods: ['GET', 'POST'] }));
app.use(function(err, req, res, next) {
    if (err.code !== 'EBADCSRFTOKEN') return next(err)
        // handle CSRF token errors here
    res.status(403)
    res.send('form tampered with')
});

// 记录访问日志
if (START_LOG) {
    const logDirectory = path.join(__dirname, 'logs');
    fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory); // 日志目录不存在创建目录
    const logerFile = 'access_' + sillyDateTime.format(new Date(), 'YYYY_MMM_DD') + '.log';
    const accessLogStream = rfs(logerFile, {
        interval: '1d', // 日志切割间隔为1天，以s,m,h,d为单位
        path: logDirectory, // 日志保存路径，
        size: '1M', // 单个日志文件的大小，以B,K,M,G为单位
        compress: true // 压缩日志
    });
    app.use(morgan('combined', { stream: accessLogStream }));
}

//设置静态资源文件托管
app.use('/public', express.static(path.join(__dirname, '/application/assets')));
app.use(favicon(path.join(__dirname,'/application/assets/images','favicon.ico')));

// 定义路由
app.use('/', require(path.join(__dirname, '/application/routers/main')));

// 处理404请求
app.get('*',(req, res)=>{
    res.render(path.join(__dirname, '/application/views/404'),{
        title:'No Found'
    });
});

//连接数据库
mongoose.connect('mongodb://localhost:27017/pan_cloud', (err, res) => {
    if (err) {
        debug(err);
    } else {
        // 数据库连接成功后监听80/443端口
        // app.listen(80);
        http.createServer(app).listen(80);
        debug('pan.mcloudhub.com: http server start listen port 80');
        // https.createServer(options, app).listen(443);
        const server = http2.createServer(options, app);
        server.listen(443);
        debug('pan.mcloudhub.com: https server start listen port 443');
    }
});

module.exports = app;