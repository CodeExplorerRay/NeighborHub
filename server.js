const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enable CORS for Vercel frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve static SPA from public/
app.use(express.static(path.join(__dirname, 'public')));
// expose the data folder so client can fetch mock JSON during development
app.use('/data', express.static(path.join(__dirname, 'data')));

// Simple REST API backed by data/db.json (for mock/demo purposes)
const fs = require('fs');
function readData(){
  try{ 
    return JSON.parse(fs.readFileSync(path.join(__dirname,'data','db.json'))); 
  }
  catch(e){
    // Create data directory and default db.json if missing (for Render deployment)
    const dataDir = path.join(__dirname,'data');
    if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir,{recursive:true});
    const defaultData = {
      posts: [],
      events: [],
      tools: [],
      quickLinks: [],
      aidRequests: [],
      aidOffers: [],
      directory: [],
      lostfound: []
    };
    fs.writeFileSync(path.join(dataDir,'db.json'), JSON.stringify(defaultData,null,2));
    return defaultData;
  }
}
function writeData(obj){
  fs.writeFileSync(path.join(__dirname,'data','db.json'), JSON.stringify(obj,null,2));
}

// return entire collection as array
app.get('/api/:col', (req,res)=>{
  const col = req.params.col;
  const data = readData();
  res.json(data[col] || []);
});

// add a new item (requires id field or will be auto-generated)
app.post('/api/:col', express.json(), (req,res)=>{
  const col = req.params.col;
  const data = readData();
  data[col] = data[col] || [];
  const item = req.body;
  if(!item.id){ item.id = Date.now(); }
  data[col].push(item);
  writeData(data);
  res.json(item);
});

// update an item by id (PUT)
app.put('/api/:col/:id', express.json(), (req,res)=>{
  const col = req.params.col;
  const id = req.params.id;
  const data = readData();
  data[col] = data[col] || [];
  const idx = data[col].findIndex(x=>String(x.id)===String(id));
  if(idx === -1) return res.status(404).json({error:'not found'});
  data[col][idx] = Object.assign({}, data[col][idx], req.body);
  writeData(data);
  res.json(data[col][idx]);
});


// Explicit routes for legal pages (also served by static middleware)
app.get('/privacy.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Fallback: serve index.html for any unmatched route (client-side routing)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`NeighborHub static server listening on ${port}`));