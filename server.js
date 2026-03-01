const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static SPA from public/
app.use(express.static(path.join(__dirname, 'public')));
// expose the data folder so client can fetch mock JSON during development
app.use('/data', express.static(path.join(__dirname, 'data')));

// Fallback: serve index.html for any unmatched route (client-side routing)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`NeighborHub static server listening on ${port}`));