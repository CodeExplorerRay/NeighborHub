// Initialize Firebase using the global config object
if(!window.__FIREBASE_CONFIG__){
  console.warn('Firebase config not found. Please populate public/firebase-config.js');
}

try{
  const cfg = window.__FIREBASE_CONFIG__ || {};
  firebase.initializeApp(cfg);
  window._auth = firebase.auth();
  window._db = firebase.firestore();

  // Enable persistence using newer cache API (or fallback for older SDKs)
  try{
    if(_db.settings && typeof _db.settings === 'function'){
      // newer SDK: use settings
      _db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
    } else if(_db.enablePersistence){
      _db.enablePersistence().catch(()=>{});
    }
  }catch(e){ console.warn('Persistence setup', e); }

  // App Check: only activate if a valid (non-placeholder) site key is provided
  try{
    const appCheckKey = window.__FIREBASE_APPCHECK_SITE_KEY__;
    if(appCheckKey && appCheckKey !== 'REPLACE_ME'){
      try{ firebase.appCheck().activate(appCheckKey, true); console.log('App Check activated'); }
      catch(e){ console.warn('App Check activation failed', e); }
    } else {
      console.log('App Check not configured; set a valid site key in __FIREBASE_APPCHECK_SITE_KEY__ to enable');
    }
  }catch(e){ console.warn('App Check setup exception', e); }

  // Auth state listener
  _auth.onAuthStateChanged(user => {
    window._currentUser = user;
    const avatar = document.getElementById('userAvatar');
    const signInBtn = document.getElementById('signInBtn');
    const adminBtn = document.getElementById('adminPanelBtn');
    const postAv = document.querySelector('.post-av');
    if(user){
      const initials = user.displayName ? user.displayName.split(' ').map(s=>s[0]).slice(0,2).join('') : 'U';
      avatar.textContent = initials;
      avatar.style.display = 'flex';
      if(postAv) postAv.textContent = initials;
      signInBtn.style.display = 'none';
      // show admin panel button if user is admin
      const ADMIN_UIDS = ['yYV8n0hoqtd3ZWAu6HULsChtFBn1', '5qUQvAsHF6YiFlRgYCQY0pxHC2y1'];
      if(adminBtn && ADMIN_UIDS.includes(user.uid)) adminBtn.style.display = 'inline-block';
      document.body.classList.add('signed-in');
      toast(`Signed in as ${user.displayName}`);
      // reload and sync state
      if(typeof loadReadNotifications === 'function') loadReadNotifications();
      if(typeof loadData === 'function') loadData();
      // check and create welcome post for new users
      if(typeof createWelcomePost === 'function') createWelcomePost(user);
    } else {
      avatar.style.display = 'none';
      if(postAv) postAv.textContent = 'AM';
      if(adminBtn) adminBtn.style.display = 'none';
      signInBtn.style.display = 'inline-block';
      document.body.classList.remove('signed-in');
      // Reload UI when user logs out
      if(typeof loadData === 'function') loadData();
    }
  });

  // Expose signin/signout helpers
  window.signInWithGoogle = async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    await _auth.signInWithPopup(provider);
  }
  window.signOut = async () => { await _auth.signOut(); toast('Signed out'); }
  // Toggle auth helper for UI (click avatar to sign in/out)
  window.toggleAuth = async () => {
    if(window._currentUser){
      await window.signOut();
    } else {
      await window.signInWithGoogle();
    }
  }
} catch (e){ console.error('Firebase init error', e); }
