const express = require('express');
const serverless = require('serverless-http');

// Импортируем основной сервер
const app = require('../../server.js');

// Экспортируем для Netlify Functions
exports.handler = serverless(app); 