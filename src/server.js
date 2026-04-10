const app = require('./app');

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`BUILDIFY Dashboard running on http://localhost:${PORT}`);
});
