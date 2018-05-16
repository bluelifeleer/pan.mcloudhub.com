'use strict';

const express = require('express');
const router = express.Router();
router.get('/', (req, res, next)=>{
    res.render('../views/index',{
        title: '云盘'
    });
});
module.exports = router;