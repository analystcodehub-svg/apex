const serverless = require('serverless-http');
const { createApp } = require('../../src/createApp');

const app = createApp({ serveStatic: false });

module.exports.handler = serverless(app);
