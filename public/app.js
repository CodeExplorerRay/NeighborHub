// client-side application logic with API integration

// ============================================================
// UTILITY DATA
// ============================================================
const COLORS = [
  'linear-gradient(135deg,#E76F51,#F4A261)',
  'linear-gradient(135deg,#6C5CE7,#A29BFE)',
  'linear-gradient(135deg,#00B894,#55EFC4)',
  'linear-gradient(135deg,#FDCB6E,#E17055)',
  'linear-gradient(135deg,#74B9FF,#0984E3)',
  'linear-gradient(135deg,#FD79A8,#E84393)',
  'linear-gradient(135deg,#55EFC4,#00CEC9)',
];
function randColor(){ return COLORS[Math.floor(Math.random()*COLORS.length)] }

const TAG_CLASSES = {
  Announcement:'t-announce', Alert:'t-alert', Question:'t-question',
  Social:'t-social', Discussion:'t-discussion'
};
const TAG_ICONS = {
  Announcement:'📢', Alert:'⚠️', Question:'❓', Social:'🎉', Discussion:'💬'
};

// Admin UIDs with full moderation access
const ADMIN_UIDS = ['yYV8n0hoqtd3ZWAu6HULsChtFBn1', '5qUQvAsHF6YiFlRgYCQY0pxHC2y1'];

// data arrays will be populated from server
let posts = [];
let events = [];
let tools = [];
let aidRequests = [];
let aidOffers = [];
let directory = [];

// ============================================================
// DATA LOADING (uses Firestore when available)
// ============================================================
let lostfound = [];

async function getCollection(name){
  if(window._db){
    try{
      const snap = await _db.collection(name).orderBy('id','desc').get();
      return snap.docs.map(d => d.data());
    }catch(e){
      // if ordering fails (no field), fallback to simple get
      const snap = await _db.collection(name).get();
      return snap.docs.map(d => d.data());
    }
  }
  // fallback to Render API for mock data
  try{ return await fetch(`https://neighborhub.onrender.com/api/${name}`).then(r=>r.json()); }catch(e){ return []; }
}

async function addDoc(name, obj){
  if(window._db){
    await _db.collection(name).add(obj);
    return obj;
  }
  const res = await fetch(`https://neighborhub.onrender.com/api/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});
  return await res.json();
}

async function updateDocByQuery(name, queryField, queryValue, updates){
  if(window._db){
    const snap = await _db.collection(name).where(queryField,'==',queryValue).get();
    const batch = _db.batch ? _db.batch() : null;
    const promises = snap.docs.map(d => d.ref.update(updates));
    await Promise.all(promises);
    return;
  }
  // fallback: try Render PUT endpoints (assumes numeric id and endpoint exists)
  if(updates && updates.id){
    await fetch(`https://neighborhub.onrender.com/api/${name}/${updates.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});
  }
}

async function loadData(){
  const dev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  let fetchError = false;
  try{
    // if Firestore is configured we try to load from it, otherwise
    // getCollection will fallback to server and/or throw.
    posts = await getCollection('posts') || [];
    events = await getCollection('events') || [];
    tools = await getCollection('tools') || [];
    aidRequests = await getCollection('aidRequests') || [];
    aidOffers = await getCollection('aidOffers') || [];
    // fetch directory regardless; render will limit fields for guests
    directory = await getCollection('directory') || [];
    lostfound = await getCollection('lostfound') || [];
  }catch(e){
    console.error('load error',e);
    fetchError = true;
  }

  // development fallback: merge mock data per-collection when running locally.
  // This ensures authenticated users still see full mock datasets (and guests
  // see a limited public view) even if Firestore returns empty collections.
  if(dev){
    try{
      const resp = await fetch('/data/db.json');
      const mock = await resp.json();
      posts = (Array.isArray(posts) && posts.length) ? posts : (mock.posts || []);
      events = (Array.isArray(events) && events.length) ? events : (mock.events || []);
      tools = (Array.isArray(tools) && tools.length) ? tools : (mock.tools || []);
      aidRequests = (Array.isArray(aidRequests) && aidRequests.length) ? aidRequests : (mock.aidRequests || []);
      aidOffers = (Array.isArray(aidOffers) && aidOffers.length) ? aidOffers : (mock.aidOffers || []);
      // directory: provide mock directory if backend returned none; render will
      // limit sensitive fields for guests while signed-in users see full details.
      directory = (Array.isArray(directory) && directory.length) ? directory : (mock.directory || []);
      lostfound = (Array.isArray(lostfound) && lostfound.length) ? lostfound : (mock.lostfound || []);
      console.log('merged mock data from db.json for empty collections');
    }catch(f){
      if(fetchError) console.warn('failed to load mock db.json',f);
    }
  }

  // if using Firestore, load comments subcollections for each post and migrate old arrays
  if(window._db){
    await Promise.all(posts.map(async p=>{
      if(!p.id) return;
      const postRef = _db.collection('posts').doc(p.id.toString());
      const snap = await postRef.collection('comments').orderBy('createdAt','asc').get();
      if(!snap.empty){
        p.commentsArray = snap.docs.map(d=>({...d.data(),docId:d.id}));
      }
      // migration: if post has legacy commentsArray without docId, push them
      if(p.commentsArray && p.commentsArray.length && p.commentsArray[0].docId===undefined){
        const migrated = [];
        for(const c of p.commentsArray){
          const added = await postRef.collection('comments').add(c);
          migrated.push({...c,docId:added.id});
        }
        p.commentsArray = migrated;
        // remove legacy field
        await postRef.update({commentsArray: firebase.firestore.FieldValue.delete(),comments:p.commentsArray.length});
      }
    }));
  }

  renderFeed(); renderEvents(); renderTools(); renderAid(); renderDirectory(); renderLostFound();
  updateBadges();
  generateNotifications();
  // On first load treat existing items as read so badges only show new items
  if(!_initialSnapshotDone){
    posts.forEach(p => readNotifications.add(`post:${p.id}`));
    events.forEach(e => readNotifications.add(`event:${e.id}`));
    tools.forEach(t => readNotifications.add(`tool:${t.id}`));
    aidRequests.forEach(a => readNotifications.add(`aidreq:${a.id}`));
    aidOffers.forEach(a => readNotifications.add(`aidoff:${a.id}`));
    directory.forEach(d => readNotifications.add(`dir:${d.id}`));
    lostfound.forEach(i => readNotifications.add(`lf:${i.id}`));
    _initialSnapshotDone = true;
    updateBadges();
    // persist initial set (so they won't reappear after refresh)
    if(typeof saveReadNotifications === 'function') saveReadNotifications();
  }
  // refresh weather for local sidebar
  try{ updateWeather(); }catch(e){}
}

// helper: load comments for a post (also used when new post arrives)
async function loadCommentsForPost(p){
  if(!window._db || !p.id) return;
  const postRef = _db.collection('posts').doc(p.id.toString());
  const snap = await postRef.collection('comments').orderBy('createdAt','asc').get();
  p.commentsArray = snap.docs.map(d=>({...d.data(),docId:d.id}));
}

// fetch current local weather (uses Open-Meteo free API) and update sidebar
async function updateWeather(){
  const iconEl = document.querySelector('.weather-icon');
  const tempEl = document.getElementById('weather-temp');
  const descEl = document.querySelector('.weather-desc');
  const defaultCoords = {latitude:37.7749, longitude:-122.4194};

  function mapWeather(code){
    if(code === 0) return ['🌞','Clear'];
    if(code >=1 && code <=3) return ['🌤️','Partly Cloudy'];
    if(code >=45 && code <=48) return ['🌫️','Foggy'];
    if(code >=51 && code <=67) return ['🌧️','Rain'];
    if(code >=71 && code <=77) return ['❄️','Snow'];
    if(code >=80 && code <=82) return ['🌦️','Showers'];
    if(code >=95) return ['⛈️','Stormy'];
    return ['☁️','Cloudy'];
  }

  try{
    const pos = await new Promise((resolve,reject)=>{
      if(navigator.geolocation){
        const t = setTimeout(()=>reject('timeout'),5000);
        navigator.geolocation.getCurrentPosition(p=>{clearTimeout(t);resolve(p);},e=>{clearTimeout(t);reject(e);},{timeout:5000});
      }else reject('no-geolocation');
    });
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const data = await res.json();
    if(!data || !data.current_weather) throw new Error('no-weather');
    const cw = data.current_weather;
    const [icon,text] = mapWeather(cw.weathercode || 0);
    if(iconEl) iconEl.textContent = icon;
    if(tempEl) tempEl.textContent = Math.round((cw.temperature * 9/5) + 32) + '°F';
    if(descEl) descEl.textContent = text;
  }catch(e){
    // fallback to default coordinates (approximate city weather)
    try{
      const lat = defaultCoords.latitude, lon = defaultCoords.longitude;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      const data = await res.json();
      if(!data || !data.current_weather) throw new Error('no-weather-2');
      const cw = data.current_weather;
      const [icon,text] = mapWeather(cw.weathercode || 0);
      if(iconEl) iconEl.textContent = icon;
      if(tempEl) tempEl.textContent = Math.round((cw.temperature * 9/5) + 32) + '°F';
      if(descEl) descEl.textContent = text + ' (approx)';
    }catch(err){
      console.warn('weather update failed',err);
    }
  }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function renderFeed(){
  const el = document.getElementById('feed');
  el.innerHTML = posts.map(p => `
    <div class="card" id="post-${p.id}">
      <div class="post-head">
        <div class="post-av" style="background:${p.color}">${p.initials}</div>
        <div class="post-meta">
          <div class="post-author">${p.author}</div>
          <div class="post-time">${p.time} · ${p.street}</div>
        </div>
        <span class="post-tag ${TAG_CLASSES[p.tag]}">${TAG_ICONS[p.tag]} ${p.tag}</span>
      </div>
      <div class="post-body">${p.body}</div>
      ${p.lat && p.lon ? `<div style="font-size:0.85rem;color:var(--text-light);margin-top:6px">📍 ${(p.distance ? p.distance.toFixed(1) + ' mi away' : 'Your area')}</div>` : ''}
      <div class="post-actions">
        <button class="react-btn ${p.liked?'liked':''}" onclick="toggleLike(${p.id})">
          ${p.liked?'❤️':'🤍'} <span>${p.likes}</span>
        </button>
        <button class="react-btn" onclick="toggleComments(${p.id})">💬 <span class="c-count">${(p.commentsArray? p.commentsArray.length : (p.comments||0))}</span></button>
        <button class="react-btn" onclick="sharePost(${p.id})">📤 Share</button>
        <button class="react-btn" onclick="reportPost(${p.id})">🚩 Report</button>
      </div>
      <div class="post-comments" id="comments-${p.id}">
        <div class="comments-list">
          ${(p.commentsArray || []).map(c=>`
            <div class="comment" data-id="${c.id}">
              <div class="comment-av" style="background:${c.color||'#D1ECF1'}">${(c.initials||'G')}</div>
              <div style="flex:1">
                <div class="comment-body">
                  <div class="comment-meta"><strong>${c.author}</strong> · <span class="comment-time">${new Date(c.createdAt).toLocaleString()}</span></div>
                  ${c.editing ? `<textarea class="comment-edit-input">${c.text}</textarea>
                    <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
                      <button class="btn btn-p" onclick="saveCommentEdit(${p.id},${c.id})">Save</button>
                      <button class="btn btn-o" onclick="cancelCommentEdit(${p.id},${c.id})">Cancel</button>
                    </div>` : `<div class="comment-text">${c.text}</div>`}
                </div>
                <div class="comment-actions" style="margin-top:6px;display:flex;gap:8px;align-items:center">
                  <button class="react-btn ${c.likedBy && window._currentUser && c.likedBy.includes(window._currentUser.uid) ? 'liked':''}" onclick="toggleLikeComment(${p.id},${c.id})">❤️ <span>${(c.likedBy?c.likedBy.length: (c.likes||0))}</span></button>
                  <button class="react-btn" onclick="replyToComment(${p.id},${c.id})">↩️ Reply</button>
                  <button class="react-btn" onclick="reportComment(${p.id},${c.id})">🚩 Report</button>
                  ${window._currentUser && c.authorId && window._currentUser.uid === c.authorId ? `<button class="react-btn" onclick="editComment(${p.id},${c.id})">✏️ Edit</button><button class="react-btn" onclick="deleteComment(${p.id},${c.id})">🗑️ Delete</button>` : ''}
                </div>
                ${c.replyingTo ? `
                <div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:8px">
                  <textarea class="reply-textarea" placeholder="Write a reply..." style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;font-family:inherit"></textarea>
                  <div style="margin-top:6px;display:flex;gap:6px">
                    <button class="btn btn-p" onclick="submitReply(${p.id},${c.id})">Post Reply</button>
                    <button class="btn btn-o" onclick="cancelReply(${p.id},${c.id})">Cancel</button>
                  </div>
                </div>
                ` : ''}
                ${(c.replies || []).map(r=>`
                  <div class="comment-reply" style="display:flex;gap:10px;align-items:flex-start;margin-top:8px">
                    <div class="comment-av" style="width:30px;height:30px;background:${r.color||'#D1ECF1'}">${r.initials||'G'}</div>
                    <div style="flex:1;background:var(--bg);padding:8px;border-radius:8px">
                      <div style="font-size:.85rem;color:var(--text-light)"><strong>${r.author}</strong> · <span style="font-size:.75rem">${new Date(r.createdAt).toLocaleString()}</span></div>
                      <div style="margin-top:6px">${r.text}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="comment-form">
          ${window._currentUser ? `
            <input id="comment-input-${p.id}" placeholder="Write a comment..." />
            <button class="btn btn-p" onclick="submitComment(${p.id})">Post</button>
          ` : `
            <div style="color:var(--text-light);font-size:.9rem">Sign in to comment</div>
          `}
        </div>
      </div>
    </div>
  `).join('');
}

function renderEvents(){
  const el = document.getElementById('eventsGrid');
  el.innerHTML = events.map(e => `
    <div class="ev-card">
      <div class="ev-banner" style="background:${e.bg}">
        ${e.icon}
        <div class="ev-date">
          <div class="ev-date-m">${e.date.split(' ')[0]}</div>
          <div class="ev-date-d">${e.date.split(' ')[1]}</div>
        </div>
      </div>
      <div class="ev-body">
        <div class="ev-name">${e.name}</div>
        <div class="ev-info">
          <div>🕐 ${e.time}</div>
          <div>📍 ${e.location}</div>
          <div>👤 ${e.host}</div>
        </div>
        <div class="ev-foot">
          <div class="ev-avatars">
            <div class="ev-av" style="background:${randColor()}">+</div>
            <span class="ev-count">${e.going} going</span>
          </div>
          <button class="btn btn-o ${e.rsvp?'active':''}" onclick="toggleRSVP(${e.id})">
            ${e.rsvp? '✓ Going':'RSVP'}
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderTools(){
  const el = document.getElementById('toolsGrid');
  el.innerHTML = tools.map(t => `
    <div class="tool-card" data-cat="${t.cat}" data-name="${t.name.toLowerCase()}" id="tool-${t.id}">
      <div class="tool-icon" style="background:${t.color}">${t.icon}</div>
      <div class="tool-name">${t.name}</div>
      <div class="tool-owner">Owned by ${t.owner} · ${t.street}</div>
      <div class="tool-status ${t.available?'s-avail':'s-out'}">
        <span class="s-dot"></span> ${t.available?'Available':'Borrowed'}
      </div>
      <button class="tool-btn" ${t.available?`onclick="borrowTool(${t.id})"`:'disabled'}>
        ${t.available?'Request to Borrow':'Unavailable'}
      </button>
    </div>
  `).join('');
}

function renderAid(){
  document.getElementById('aidRequests').innerHTML = aidRequests.map(a => `
    <div class="aid-card req">
      <div class="aid-head">
        <div class="aid-title">${a.title}</div>
        <span class="aid-urg u-${a.urgency}">${a.urgency}</span>
      </div>
      <div class="aid-desc">${a.desc}</div>
      <div class="aid-foot">
        <div class="aid-who">
          <div class="aid-av" style="background:${a.color}">${a.initials}</div>
          <span class="aid-name">${a.author}</span>
        </div>
        <button class="aid-btn" onclick="respondAid(this,'${a.author}')">I Can Help</button>
      </div>
    </div>
  `).join('');

  document.getElementById('aidOffers').innerHTML = aidOffers.map(a => `
    <div class="aid-card offer">
      <div class="aid-head">
        <div class="aid-title">${a.title}</div>
      </div>
      <div class="aid-desc">${a.desc}</div>
      <div class="aid-foot">
        <div class="aid-who">
          <div class="aid-av" style="background:${a.color}">${a.initials}</div>
          <span class="aid-name">${a.author}</span>
        </div>
        <button class="aid-btn" onclick="respondAid(this,'${a.author}')">Accept</button>
      </div>
    </div>
  `).join('');
}

function renderDirectory(){
  const el = document.getElementById('dirGrid');
  if(!el) return;
  const isGuest = !window._currentUser;
  el.innerHTML = (directory || []).map(d => {
    if(isGuest){
      return `
      <div class="dir-card dir-guest" data-name="${(d.name||'').toLowerCase()} ${(d.street||'').toLowerCase()} ${(d.tags||[]).join(' ').toLowerCase()}">
        <div class="dir-av" style="background:${d.color}">${d.initials}</div>
        <div>
          <div class="dir-name">${d.name}</div>
          <div class="dir-tags">${(d.tags||[]).map(t=>`<span class="dir-tag">${t}</span>`).join('')}</div>
        </div>
      </div>
      `;
    }
    return `
    <div class="dir-card" data-name="${d.name.toLowerCase()} ${d.street.toLowerCase()} ${d.tags.join(' ').toLowerCase()}">
      <div class="dir-av" style="background:${d.color}">${d.initials}</div>
      <div>
        <div class="dir-name">${d.name}</div>
        <div class="dir-street">${d.street}</div>
        <div class="dir-tags">${d.tags.map(t=>`<span class="dir-tag">${t}</span>`).join('')}</div>
      </div>
    </div>
    `;
  }).join('');
}

function renderLostFound(){
  const el = document.getElementById('lfList');
  if(!el) return;
  el.innerHTML = (lostfound || []).map(i => `
    <div class="card" id="lf-${i.id}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>${i.type.toUpperCase()}:</strong> ${i.title}</div>
        <div>${i.contact ? `<small>${i.contact}</small>` : ''}</div>
      </div>
      <div style="margin-top:8px;color:var(--text-light)">${i.desc}</div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px">
        ${window._currentUser && i.ownerId && window._currentUser.uid === i.ownerId
          ? `<button class="btn btn-o" onclick="markFound(${i.id})">Mark Resolved</button>`
          : ''}
      </div>
    </div>
  `).join('');
}

// ============================================================
// INTERACTION HANDLERS
// ============================================================

// --- TABS ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    // mark items in this tab as read
    try{ markTabRead(tab.dataset.tab); updateBadges(); }catch(e){}
  });
});

// Mark all items in a given tab as read (adds composite ids to readNotifications)
function markTabRead(tabName){
  if(!tabName) return;
  if(tabName === 'board') posts.forEach(p => readNotifications.add(`post:${p.id}`));
  if(tabName === 'events') events.forEach(e => readNotifications.add(`event:${e.id}`));
  if(tabName === 'tools') tools.forEach(t => readNotifications.add(`tool:${t.id}`));
  if(tabName === 'aid'){
    aidRequests.forEach(a => readNotifications.add(`aidreq:${a.id}`));
    aidOffers.forEach(a => readNotifications.add(`aidoff:${a.id}`));
  }
  if(tabName === 'directory') directory.forEach(d => readNotifications.add(`dir:${d.id}`));
  if(tabName === 'lostfound') lostfound.forEach(i => readNotifications.add(`lf:${i.id}`));
}

// --- COMPOSER ---
document.getElementById('composerTrigger').addEventListener('click', () => {
  const full = document.getElementById('composerFull');
  full.classList.toggle('open');
  if(full.classList.contains('open')) document.getElementById('postInput').focus();
});

let selectedTag = 'Discussion';
document.querySelectorAll('#tagPills .tag-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#tagPills .tag-pill').forEach(p => p.classList.remove('sel'));
    pill.classList.add('sel');
    selectedTag = pill.dataset.tag;
  });
});

// --- WELCOME POST (for new users) ---
async function createWelcomePost(user){
  if(!window._db){ return; } // firestore required
  try{
    const userRef = _db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();
    if(userDoc.exists && userDoc.data().welcomePostCreated){ return; }
    // determine newcomer name for personalization
    const targetName = user.displayName || (user.email? user.email.split('@')[0] : 'new neighbor');
    // use bot identity
    const author = 'Chirpy';
    const initials = 'CH';
    const ADMIN_UIDS = ['yYV8n0hoqtd3ZWAu6HULsChtFBn1', '5qUQvAsHF6YiFlRgYCQY0pxHC2y1'];
    const welcomeMessages = [
      `👋 Hey neighbors! I'm Chirpy, your friendly welcome bot. ${targetName} just joined—let's give them a warm hello!`,
      `🎉 Chirpy here! ${targetName} is now part of NeighborHub. Drop a greeting and help them feel at home.`,
      `🐦 Chirpy chirps: ${targetName} has joined our community. Say hi and share a tip about the neighborhood!`,
      `🌟 Hello from Chirpy! We've got a new neighbor (${targetName})—let's make them feel welcome with a little neighborly love.`,
      `🏘️ Chirpy checking in: ${targetName} just signed up! Give them a wave and show off what makes our community special.`
    ];
    const welcomeBody = welcomeMessages[Math.floor(Math.random()*welcomeMessages.length)];
    const newPost = {id:Date.now(),author,authorId:user.uid,initials,body:welcomeBody,tag:'Social',likes:0,liked:false,comments:0,commentsArray:[],color:randColor(),time:new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),street:'Your Neighborhood',isWelcome:true};
    await _db.collection('posts').add(newPost);
    posts.unshift(newPost);
    await userRef.set({id:user.uid,email:user.email,displayName:author,createdAt:new Date(),welcomePostCreated:true},{merge:true});
    renderFeed();
    toast(`🎉 Welcome to NeighborHub, ${targetName}!`);
  }catch(e){ console.warn('welcome post creation failed',e); }
}

// --- POST CREATION ---
async function createPost(){
  if(!window._currentUser){ toast('🔐 sign in to post'); return; }
  const body = document.getElementById('postInput').value.trim();
  if(!body){ toast('⚠️ What is on your mind?'); return; }
  const user = window._currentUser;
  const author = user.displayName || user.email || 'You';
  const initials = author.split(' ').map(s=>s[0]).slice(0,2).join('');
  const newPost = {id:Date.now(),author,authorId:user.uid,initials,body,tag:selectedTag,likes:0,liked:false,comments:0,commentsArray:[],color:randColor(),time:new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),street:'Your Neighborhood',reported:0};
  
  // capture geolocation if available
  try{
    const pos = await new Promise((resolve,reject)=>{
      if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>{resolve(p)},e=>{reject(e)},{timeout:3000});
      else reject('no-geo');
    });
    newPost.lat = pos.coords.latitude;
    newPost.lon = pos.coords.longitude;
  }catch(e){}
  
  const saved = await addDoc('posts', newPost);
  posts.unshift(saved);
  document.getElementById('composerFull').classList.remove('open');
  document.getElementById('postInput').value='';
  selectedTag = 'Discussion';
  document.querySelectorAll('#tagPills .tag-pill').forEach(p => p.classList.remove('sel'));
  document.querySelector('#tagPills [data-tag="Discussion"]').classList.add('sel');
  renderFeed();
  updateBadges();
  toast('📢 Post shared!');
}

document.addEventListener('DOMContentLoaded', () => {
  const postBtn = document.getElementById('postBtn');
  if(postBtn) postBtn.addEventListener('click', createPost);
  // logo click should act as home: activate board tab
  const logo = document.querySelector('.logo');
  if(logo){
    logo.addEventListener('click', e=>{
      e.preventDefault();
      const homeTab = document.querySelector('.tab[data-tab="board"]');
      if(homeTab) homeTab.click();
      // optionally scroll up
      window.scrollTo({top:0,behavior:'smooth'});
    });
  }
});

// --- LIKES ---
async function toggleLike(id){
  const p = posts.find(x => x.id === id);
  if(!p) return;
  p.liked = !p.liked;
  p.likes += p.liked ? 1 : -1;
  renderFeed();
  // persist (Firestore or fallback)
  await updateDocByQuery('posts','id',id,{liked:p.liked,likes:p.likes,id:id});
}

// --- RSVP ---
async function toggleRSVP(id){
  const e = events.find(x => x.id === id);
  if(!e) return;
  e.rsvp = !e.rsvp;
  e.going += e.rsvp ? 1 : -1;
  renderEvents();
  await updateDocByQuery('events','id',id,{rsvp:e.rsvp,going:e.going,id:id});
}

// --- CREATE EVENT ---
async function postEvent(){
  if(!window._currentUser){ toast('🔐 sign in to create events'); return; }
  const name = document.getElementById('evName').value.trim();
  const date = document.getElementById('evDate').value;
  const loc = document.getElementById('evLocation').value.trim();
  const desc = document.getElementById('evDesc').value.trim();
  const icon = document.getElementById('evIcon').value || '🎉';
  if(!name || !date || !loc){toast('⚠️ Fill in name, date, and location!');return;}
  const d = new Date(date);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const user = window._currentUser;
  const hostName = user.displayName || user.email || 'You';
  const newEvent = {
    id:Date.now(), name, icon,
    date: months[d.getMonth()]+' '+d.getDate(),
    time: days[d.getDay()]+' '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),
    location:loc, host:`${hostName} (you)`, going:1, rsvp:true,
    organizerId: user.uid,
    bg: `linear-gradient(135deg,${['#D5F5E3','#FAD7A0','#AED6F1','#D2B4DE','#FADBD8'][Math.floor(Math.random()*5)]},${['#82E0AA','#F8C471','#85C1E9','#BB8FCE','#F1948A'][Math.floor(Math.random()*5)]})`
  };
  const saved = await addDoc('events', newEvent);
  events.unshift(saved);
  closeModal('eventModal');
  document.getElementById('evName').value='';
  document.getElementById('evDate').value='';
  document.getElementById('evLocation').value='';
  document.getElementById('evDesc').value='';
  document.getElementById('evIcon').value='';
  renderEvents();
  refreshStats();
  updateBadges();
  toast('📅 Event created!');
}

// --- TOOLS ---
function filterTools(){
  const q = document.getElementById('toolSearch').value.toLowerCase();
  document.querySelectorAll('.tool-card').forEach(card => {
    const name = card.dataset.name || '';
    card.classList.toggle('hidden', q && !name.includes(q));
  });
}

let activeCat = 'all';
document.getElementById('toolFilters').addEventListener('click', e => {
  if(!e.target.classList.contains('filter-btn')) return;
  document.querySelectorAll('#toolFilters .filter-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  activeCat = e.target.dataset.cat;
  document.querySelectorAll('.tool-card').forEach(card => {
    const match = activeCat === 'all' || card.dataset.cat === activeCat;
    card.classList.toggle('hidden', !match);
  });
});

async function borrowTool(id){
  const t = tools.find(x => x.id === id);
  if(!t || !t.available) return;
  t.available = false;
  renderTools();
  if(activeCat !== 'all'){
    document.querySelectorAll('.tool-card').forEach(card => {
      if(card.dataset.cat !== activeCat) card.classList.add('hidden');
    });
  }
  refreshStats();
  await updateDocByQuery('tools','id',id,{available:false,id:id});
  toast(`🔧 Request sent to ${t.owner}!`);
  updateBadges();
}

async function createTool(){
  if(!window._currentUser){ toast('🔐 sign in to list tools'); return; }
  const name = document.getElementById('tlName').value.trim();
  const cat = document.getElementById('tlCat').value;
  const icon = document.getElementById('tlIcon').value || '📦';
  if(!name){toast('⚠️ Enter an item name!');return;}
  const catColors = {power:'#FFF3CD',garden:'#D5F5E3',kitchen:'#FADBD8',outdoor:'#D1ECF1',cleaning:'#E8DAEF'};
  const user = window._currentUser;
  const ownerName = user.displayName || user.email || 'You';
  const initials = ownerName.split(' ').map(s=>s[0]).slice(0,2).join('');
  const newTool = {id:Date.now(),name,icon,cat,owner:ownerName,ownerId:user.uid,street:'Your Street',available:true,color:catColors[cat]||'#D1ECF1',initials};
  const saved = await addDoc('tools', newTool);
  tools.unshift(saved);
  closeModal('toolModal');
  document.getElementById('tlName').value='';
  document.getElementById('tlIcon').value='';
  renderTools();
  refreshStats();
  updateBadges();
  toast('🔧 Item listed!');
}

// --- MUTUAL AID ---
function respondAid(btn, author){
  if(btn.classList.contains('done')) return;
  btn.classList.add('done');
  btn.textContent = '✓ Responded';
  refreshStats();
  toast(`💚 ${author} has been notified!`);
}

async function createAidRequest(){
  if(!window._currentUser){ toast('🔐 sign in to request aid'); return; }
  const title = document.getElementById('arTitle').value.trim();
  const desc = document.getElementById('arDesc').value.trim();
  const urg = document.getElementById('arUrg').value;
  if(!title){toast('⚠️ What do you need help with?');return;}
  const user = window._currentUser;
  const author = user.displayName || user.email || 'You';
  const initials = author.split(' ').map(s=>s[0]).slice(0,2).join('');
  const newReq = {id:Date.now(),title,desc:desc||'No details provided.',urgency:urg,author,authorId:user.uid,initials,color:'linear-gradient(135deg,var(--accent),var(--accent-light))'};
  const saved = await addDoc('aidRequests', newReq);
  aidRequests.unshift(saved);
  closeModal('aidRequestModal');
  document.getElementById('arTitle').value='';
  document.getElementById('arDesc').value='';
  renderAid();
  refreshStats();
  updateBadges();
  toast('🙋 Request posted!');
}

async function createAidOffer(){
  if(!window._currentUser){ toast('🔐 sign in to offer aid'); return; }
  const title = document.getElementById('aoTitle').value.trim();
  const desc = document.getElementById('aoDesc').value.trim();
  if(!title){toast('⚠️ What can you help with?');return;}
  const user = window._currentUser;
  const author = user.displayName || user.email || 'You';
  const initials = author.split(' ').map(s=>s[0]).slice(0,2).join('');
  const newOffer = {id:Date.now(),title,desc:desc||'Reach out for details!',author,authorId:user.uid,initials,color:'linear-gradient(135deg,var(--accent),var(--accent-light))'};
  const saved = await addDoc('aidOffers', newOffer);
  aidOffers.unshift(saved);
  closeModal('aidOfferModal');
  document.getElementById('aoTitle').value='';
  document.getElementById('aoDesc').value='';
  renderAid();
  refreshStats();
  updateBadges();
  toast('💚 Offer posted!');
}

// Edit existing comment (owner only)
async function editComment(postId, commentId){
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  if(c.authorId && (!window._currentUser || window._currentUser.uid !== c.authorId)){ toast('🔐 Only comment owner can edit'); return; }
  // toggle inline edit mode
  c.editing = true;
  renderFeed();
}

function saveCommentEdit(postId, commentId){
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  const textarea = document.querySelector(`#post-${postId} .comment[data-id="${commentId}"] textarea.comment-edit-input`);
  if(!textarea) return;
  const txt = textarea.value.trim();
  if(!txt) return toast('⚠️ Comment cannot be empty');
  c.text = txt;
  delete c.editing;
  renderFeed();
  updateCommentFirestore(postId, c).catch(e=>console.warn('editComment failed',e));
}

function cancelCommentEdit(postId, commentId){
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  delete c.editing;
  renderFeed();
}

// Delete comment (owner only)
async function deleteComment(postId, commentId){
  if(!confirm('Delete this comment?')) return;
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  if(c.authorId && (!window._currentUser || window._currentUser.uid !== c.authorId)){ toast('🔐 Only comment owner can delete'); return; }
  p.commentsArray = p.commentsArray.filter(x => x.id !== commentId);
  p.comments = p.commentsArray.length;
  renderFeed();
  try{
    await deleteCommentFirestore(postId, c);
  }catch(e){console.warn('deleteComment failed',e)}
}

// Reply to a comment (creates a reply object under comment.replies)
async function replyToComment(postId, commentId){
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  if(!window._currentUser){ toast('🔐 Sign in to reply'); return; }
  // toggle reply mode
  c.replyingTo = !c.replyingTo;
  renderFeed();
}

async function submitReply(postId, commentId){
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  const textarea = document.querySelector(`#post-${postId} .comment[data-id="${commentId}"] .reply-textarea`);
  if(!textarea) return;
  const txt = textarea.value.trim();
  if(!txt) return toast('⚠️ Reply cannot be empty');
  const user = window._currentUser;
  const reply = { id: Date.now(), author: user.displayName || user.email || 'You', authorId: user.uid, initials: (user.displayName||'').split(' ').map(s=>s[0]).slice(0,2).join(''), text: txt, createdAt: Date.now(), color: randColor() };
  c.replies = c.replies || [];
  c.replies.push(reply);
  delete c.replyingTo;
  renderFeed();
  updateCommentFirestore(postId, c).catch(e=>console.warn('submitReply failed',e));
}

function cancelReply(postId, commentId){
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  delete c.replyingTo;
  renderFeed();
}

// Toggle like on a comment
async function toggleLikeComment(postId, commentId){
  if(!window._currentUser){ toast('🔐 Sign in to like'); return; }
  const p = posts.find(x => x.id === postId);
  if(!p || !p.commentsArray) return;
  const c = p.commentsArray.find(x => x.id === commentId);
  if(!c) return;
  c.likedBy = c.likedBy || [];
  const uid = window._currentUser.uid;
  if(c.likedBy.includes(uid)){
    c.likedBy = c.likedBy.filter(u => u !== uid);
  } else {
    c.likedBy.push(uid);
  }
  c.likes = c.likedBy.length;
  renderFeed();
  updateCommentFirestore(postId, c).catch(e=>console.warn('toggleLikeComment failed',e));
}

// --- DIRECTORY FILTER ---
function filterDir(){
  const q = document.getElementById('dirSearch').value.toLowerCase();
  document.querySelectorAll('.dir-card').forEach(card => {
    const data = card.dataset.name || '';
    card.classList.toggle('hidden', q && !data.includes(q));
  });
}

// Report post
async function reportPost(id){
  if(!window._currentUser){ toast('🔐 Sign in to report'); return; }
  const reason = prompt('Why are you reporting this post?');
  if(!reason || !reason.trim()) return;
  const p = posts.find(x=>x.id===id);
  if(!p) return;
  p.reported = (p.reported || 0) + 1;
  renderFeed();
  try{
    if(window._db) await _db.collection('reports').add({type:'post',postId:id,reporterId:window._currentUser.uid,reason,createdAt:new Date()});
  }catch(e){console.warn('report failed',e)}
  toast('🚩 Post reported to moderators');
}

// Report comment
async function reportComment(postId, commentId){
  if(!window._currentUser){ toast('🔐 Sign in to report'); return; }
  const reason = prompt('Why are you reporting this comment?');
  if(!reason || !reason.trim()) return;
  try{
    if(window._db) await _db.collection('reports').add({type:'comment',postId,commentId,reporterId:window._currentUser.uid,reason,createdAt:new Date()});
  }catch(e){console.warn('report failed',e)}
  toast('🚩 Comment reported to moderators');
}

// Open admin panel (only admins)
function openAdminPanel(){
  if(!window._currentUser || !ADMIN_UIDS.includes(window._currentUser.uid)){
    toast('🔐 Admin access only');
    return;
  }
  const modal = document.getElementById('adminModal');
  if(!modal) return;
  loadReports();
  modal.classList.add('open');
}

// Load and display reports
async function loadReports(){
  try{
    if(!window._db) return;
    const snap = await _db.collection('reports').orderBy('createdAt','desc').get();
    const reports = snap.docs.map(d=>({...d.data(),docId:d.id}));
    const list = document.getElementById('reportsList');
    if(!list) return;
    if(reports.length === 0){
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-light)">No reports</div>';
      return;
    }
    list.innerHTML = reports.map(r=> `
      <div class="card" style="padding:12px;margin-bottom:8px">
        <div style="font-size:0.9rem;color:var(--text-light)">${r.type.toUpperCase()} • ${new Date(r.createdAt).toLocaleString()}</div>
        <div style="margin-top:6px"><strong>Reason:</strong> ${r.reason}</div>
        <div style="margin-top:8px;display:flex;gap:6px">
          <button class="btn btn-p" onclick="deleteReportedItem('${r.type}','${r.type==='post'?r.postId:r.commentId}','${r.type==='comment'?r.postId:''}')" >🗑️ Delete</button>
          <button class="btn btn-o" onclick="dismissReport('${r.docId}')">✓ Dismiss</button>
        </div>
      </div>
    `).join('');
  }catch(e){console.warn('loadReports failed',e)}
}

// Delete reported post or comment
async function deleteReportedItem(type, id, postId){
  if(type === 'post'){
    posts = posts.filter(p=>p.id !== parseInt(id));
    if(window._db) await _db.collection('posts').doc(id.toString()).delete();
  } else if(type === 'comment' && postId){
    const p = posts.find(x=>x.id === parseInt(postId));
    if(p) p.commentsArray = p.commentsArray.filter(c=>c.id !== parseInt(id));
    if(window._db) await _db.collection('posts').doc(postId.toString()).collection('comments').doc(id.toString()).delete();
  }
  renderFeed();
  loadReports();
  toast('🗑️ Item deleted');
}

// Dismiss a report
async function dismissReport(docId){
  if(window._db) await _db.collection('reports').doc(docId).delete();
  loadReports();
  toast('✓ Report dismissed');
}

// --- LOST & FOUND ---
async function createLostFound(){
  const title = document.getElementById('lfTitle').value.trim();
  const desc = document.getElementById('lfDesc').value.trim();
  const type = document.getElementById('lfType').value;
  const contact = document.getElementById('lfContact').value.trim();
  if(!title){ toast('⚠️ Enter a title'); return; }
  if(!window._currentUser){ toast('🔐 Please sign in to post'); return; }
  const ownerId = window._currentUser && window._currentUser.uid;
  const item = { id: Date.now(), title, desc, type, contact, ownerId, createdAt: Date.now() };
  const saved = await addDoc('lostfound', item);
  lostfound.unshift(saved);
  closeModal('lfModal');
  document.getElementById('lfTitle').value = '';
  document.getElementById('lfDesc').value = '';
  document.getElementById('lfContact').value = '';
  renderLostFound();
  refreshStats();
  updateBadges();
  toast('🔎 Item posted to Lost & Found');
}

async function markFound(id){
  // mark as resolved: remove locally and in firestore
  lostfound = lostfound.filter(i => i.id !== id);
  renderLostFound();
  await updateDocByQuery('lostfound','id',id,{resolved:true,id:id});
  toast('✅ Marked resolved');
  refreshStats();
  updateBadges();
}

// --- MODALS ---
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

// Close modals on Escape
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
});

// --- TOAST ---
function toast(msg){
  const box = document.getElementById('toastBox');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Update tab and top-nav notification badges
function updateBadges(){
  try{
    // Per-tab unread counts (use composite IDs to avoid collisions)
    const eventsTab = document.querySelector('.tab[data-tab="events"]');
    if(eventsTab){
      const unread = events.filter(e => !readNotifications.has(`event:${e.id}`)).length;
      const badge = eventsTab.querySelector('.tab-badge') || document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = unread || '';
      if(!eventsTab.contains(badge)) eventsTab.appendChild(badge);
    }

    const toolsTab = document.querySelector('.tab[data-tab="tools"]');
    if(toolsTab){
      const unread = tools.filter(t => !readNotifications.has(`tool:${t.id}`)).length;
      const badge = toolsTab.querySelector('.tab-badge') || document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = unread || '';
      if(!toolsTab.contains(badge)) toolsTab.appendChild(badge);
    }

    // Aid badge (sum of unread requests+offers)
    const aidTab = document.querySelector('.tab[data-tab="aid"]');
    if(aidTab){
      const unread = aidRequests.filter(a => !readNotifications.has(`aidreq:${a.id}`)).length
        + aidOffers.filter(a => !readNotifications.has(`aidoff:${a.id}`)).length;
      const badge = aidTab.querySelector('.tab-badge') || document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = unread || '';
      if(!aidTab.contains(badge)) aidTab.appendChild(badge);
    }

    const dirTab = document.querySelector('.tab[data-tab="directory"]');
    if(dirTab){
      const unread = directory.filter(d => !readNotifications.has(`dir:${d.id}`)).length;
      const badge = dirTab.querySelector('.tab-badge') || document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = unread || '';
      if(!dirTab.contains(badge)) dirTab.appendChild(badge);
    }

    const lfTab = document.querySelector('.tab[data-tab="lostfound"]');
    if(lfTab){
      const unread = lostfound.filter(i => !readNotifications.has(`lf:${i.id}`)).length;
      const badge = lfTab.querySelector('.tab-badge') || document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = unread || '';
      if(!lfTab.contains(badge)) lfTab.appendChild(badge);
    }

    // Topnav bell badge: count only unread notifications (all types)
    const topBadgeEl = document.querySelector('.topnav .badge');
    if(topBadgeEl){
      let unreadCount = 0;
      unreadCount += posts.filter(p => !readNotifications.has(`post:${p.id}`)).length;
      unreadCount += events.filter(e => !readNotifications.has(`event:${e.id}`)).length;
      unreadCount += aidRequests.filter(a => !readNotifications.has(`aidreq:${a.id}`)).length;
      unreadCount += aidOffers.filter(a => !readNotifications.has(`aidoff:${a.id}`)).length;
      unreadCount += lostfound.filter(i => !readNotifications.has(`lf:${i.id}`)).length;
      unreadCount += tools.filter(t => !readNotifications.has(`tool:${t.id}`)).length;
      unreadCount += directory.filter(d => !readNotifications.has(`dir:${d.id}`)).length;
      topBadgeEl.textContent = unreadCount > 0 ? unreadCount : '';
    }
  }catch(e){ console.warn('updateBadges error',e); }
}

// --- STATS ---
function updateStat(id, delta){
  const el = document.getElementById(id);
  el.textContent = parseInt(el.textContent) + delta;
}

// Recompute community stats from current data arrays
function refreshStats(){
  try{
    const neighbors = Array.isArray(directory) ? directory.length : 0;
    const shared = Array.isArray(tools) ? tools.length : 0; // items listed
    const helped = Array.isArray(aidOffers) ? aidOffers.length : 0; // offers posted
    const evs = Array.isArray(events) ? events.length : 0;
    const elN = document.getElementById('statNeighbors'); if(elN) elN.textContent = neighbors;
    const elS = document.getElementById('statShared'); if(elS) elS.textContent = shared;
    const elH = document.getElementById('statHelped'); if(elH) elH.textContent = helped;
    const elE = document.getElementById('statEvents'); if(elE) elE.textContent = evs;
  }catch(e){ console.warn('refreshStats error',e); }
}

// ============================================================
// NOTIFICATIONS
// ============================================================
let notificationList = []; // track recent items
let readNotifications = new Set(); // track which notifications have been read (composite keys like "event:123")
let _initialSnapshotDone = false; // on first load treat existing items as already read

function generateNotifications(){
  notificationList = [];
  // Add recent posts
  posts.slice(0,3).forEach(p => {
    notificationList.push({type:'post',data:p,compId:`post:${p.id}`,emoji:'📢',title:`${p.author}: ${p.body.substring(0,50)}...`});
  });
  // Add recent events
  events.slice(0,2).forEach(e => {
    notificationList.push({type:'event',data:e,compId:`event:${e.id}`,emoji:'📅',title:`${e.name} - ${e.date}`});
  });
  // Add recent aid items
  aidRequests.slice(0,2).forEach(a => {
    notificationList.push({type:'aid',data:a,compId:`aidreq:${a.id}`,emoji:'🙋',title:`${a.author} needs: ${a.title}`});
  });
  aidOffers.slice(0,2).forEach(a => {
    notificationList.push({type:'offer',data:a,compId:`aidoff:${a.id}`,emoji:'💚',title:`${a.author} offers: ${a.title}`});
  });
  // Add recent lost&found
  lostfound.slice(0,2).forEach(i => {
    notificationList.push({type:'lf',data:i,compId:`lf:${i.id}`,emoji:i.type==='lost'?'🔍':'✨',title:`${i.type.toUpperCase()}: ${i.title}`});
  });
  // Sort by ID descending (most recent first) and limit to 10
  notificationList.sort((a,b)=>(b.data.id||0)-(a.data.id||0));
  notificationList = notificationList.slice(0,10);
}

function openNotifications(){
  generateNotifications();
  // Mark all current notifications as read
  notificationList.forEach(n => {
    if(n.compId) readNotifications.add(n.compId);
    else if(n.data && n.data.id) readNotifications.add(`${n.type}:${n.data.id}`);
  });
  const el = document.getElementById('notificationsList');
  if(!el) return;
  if(notificationList.length === 0){
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-light)">No new notifications</div>';
  }else{
    el.innerHTML = notificationList.map(n => `
      <div class="card" style="padding:12px;cursor:pointer" onclick="toast('${n.emoji} ${n.title}')">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="font-size:1.5rem">${n.emoji}</div>
          <div style="flex:1">
            <strong>${n.data.author || n.data.name || 'Item'}</strong>
            <div style="font-size:0.9rem;color:var(--text-light);margin-top:4px">${n.title}</div>
          </div>
        </div>
      </div>
    `).join('');
  }
  updateBadges(); // refresh badge to show 0 unread
  openModal('notificationsModal');
}

// Share post: copy link to clipboard and toast
async function sharePost(id){
  const link = `${location.origin}${location.pathname}#post-${id}`;
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(link);
    }else{
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast('📤 Post link copied to clipboard');
  }catch(e){
    toast('⚠️ Could not copy link');
  }
}

// Toggle comments area visibility
function toggleComments(id){
  const el = document.getElementById(`comments-${id}`);
  if(!el) return;
  el.classList.toggle('open');
  if(el.classList.contains('open')){
    const input = document.getElementById(`comment-input-${id}`);
    if(input) input.focus();
  }
}

// Submit a comment for a post (adds locally and attempts to persist)
async function submitComment(id){
  const input = document.getElementById(`comment-input-${id}`);
  if(!input) return;
  const txt = input.value && input.value.trim();
  if(!txt) return toast('⚠️ Enter a comment');
  const p = posts.find(x => x.id === id);
  if(!p) return;
  const user = window._currentUser;
  const author = user ? (user.displayName || user.email || 'You') : 'Guest';
  const initials = author.split(' ').map(s=>s[0]).slice(0,2).join('');
  const comment = { id: Date.now(), author, authorId: user ? user.uid : null, initials, text: txt, createdAt: Date.now(), color: randColor() };
  p.commentsArray = p.commentsArray || [];
  p.commentsArray.push(comment);
  // keep legacy comments count for compatibility
  p.comments = p.commentsArray.length;
  renderFeed();
  input.value = '';
  // persist to Firestore if available
  try{
    const saved = await addCommentFirestore(id, comment);
    if(saved && saved.docId) comment.docId = saved.docId;
  }catch(e){
    // fallback: try existing API
    try{ await updateDocByQuery('posts','id',id,{comments:p.comments,commentsArray:p.commentsArray,id:id}); }catch(e2){}
  }
  updateBadges();
  toast('💬 Comment posted');
}

// Persist a comment to Firestore as a subcollection document
async function addCommentFirestore(postId, comment){
  if(!window._db) throw new Error('no-firestore');
  const postRef = _db.collection('posts').doc(postId.toString());
  const comRef = await postRef.collection('comments').add(comment);
  comment.docId = comRef.id;
  // increment comment count on parent
  await postRef.update({comments: firebase.firestore.FieldValue.increment(1)});
  return comment;
}

async function updateCommentFirestore(postId, comment){
  if(!window._db || !comment.docId) return;
  const ref = _db.collection('posts').doc(postId.toString()).collection('comments').doc(comment.docId);
  await ref.set(comment, {merge:true});
}

async function deleteCommentFirestore(postId, comment){
  if(!window._db || !comment.docId) return;
  const ref = _db.collection('posts').doc(postId.toString()).collection('comments').doc(comment.docId);
  await ref.delete();
  const postRef = _db.collection('posts').doc(postId.toString());
  await postRef.update({comments: firebase.firestore.FieldValue.increment(-1)});
}


// ============================================================
// INIT
// ============================================================
loadData();

