const { createApp } = require('./src/createApp');

const PORT = process.env.PORT || 3000;
const app = createApp({ serveStatic: true });

app.listen(PORT, () => {
  console.log(`Coaching Class server running at http://localhost:${PORT}`);
});
