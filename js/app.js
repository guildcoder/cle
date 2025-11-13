// js/app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, addDoc, collection,
  getDoc, getDocs, query, where, updateDoc, serverTimestamp,
  orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getStorage, ref as sref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCquC_ZsPf59yGnlFLzK8Du1mgibvKOK_M",
  authDomain: "biddingapp-a6d8e.firebaseapp.com",
  projectId: "biddingapp-a6d8e",
  storageBucket: "biddingapp-a6d8e.firebasestorage.app",
  messagingSenderId: "870014358891",
  appId: "1:870014358891:web:b74cf577dfd38eff46e82e",
  measurementId: "G-0QWG9DQCLG"
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);
const storage = getStorage(appFirebase);

// Export a global app object for each HTML to call init functions.
window.app = {
  initSellerPage,
  initLivePage,
  initAdminPage
};

/* --------------------------
   Seller page logic
   -------------------------- */
async function initSellerPage() {
  // DOM elements
  const entryCheckBtn = document.getElementById('entryCheckBtn');
  const entryCodeInput = document.getElementById('entryCodeInput');
  const entryMsg = document.getElementById('entryMsg');

  const sellerSection = document.getElementById('seller-form-section');
  const entrySection = document.getElementById('entry-section');
  const lotEntrySection = document.getElementById('lot-entry-section');
  const dashboardSection = document.getElementById('dashboard-section');

  let currentSaleId = null;
  let currentLotIndex = 0;
  let lotTotal = 1;
  let lotsBuffer = []; // local buffer while building lots

  entryCheckBtn.addEventListener('click', async () => {
    const code = entryCodeInput.value.trim();
    if (!code) { entryMsg.textContent = 'Please enter a code.'; return; }
    entryMsg.textContent = 'Checking...';

    try {
      const codeDoc = await getDoc(doc(db, 'entryCodes', code));
      if (!codeDoc.exists()) {
        entryMsg.textContent = 'Invalid entry code.';
        return;
      }
      entryMsg.textContent = 'Unlocked. You may proceed.';
      entrySection.classList.add('hidden');
      sellerSection.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      entryMsg.textContent = 'Error checking code.';
    }
  });

  // create sale button
  document.getElementById('createSaleBtn').addEventListener('click', async () => {
    const businessName = document.getElementById('businessName').value.trim();
    const saleName = document.getElementById('saleName').value.trim();
    const saleDesc = document.getElementById('saleDesc').value.trim();
    const numLots = parseInt(document.getElementById('numLots').value, 10) || 1;
    const globalPrices = document.getElementById('globalPrices').value === 'yes';
    const globalOpening = parseFloat(document.getElementById('globalOpening').value || 0);
    const globalIncrement = parseFloat(document.getElementById('globalIncrement').value || 0);

    const startLocal = document.getElementById('startDate').value;
    const endLocal = document.getElementById('endDate').value;
    const startTz = document.getElementById('startTz').value;
    const endTz = document.getElementById('endTz').value;

    if (!businessName || !saleName || !startLocal || !endLocal) {
      alert('Please fill business name, sale name, start and end.');
      return;
    }

    const saleObj = {
      businessName, saleName, saleDesc,
      createdAt: serverTimestamp(),
      startLocal, endLocal, startTz, endTz,
      globalPrices, globalOpening, globalIncrement,
      status: 'draft' // draft | live | paused | ended
    };

    try {
      const saleRef = await addDoc(collection(db, 'sales'), saleObj);
      currentSaleId = saleRef.id;
      lotTotal = numLots;
      lotsBuffer = Array.from({length: numLots}).map(()=>({}));
      document.getElementById('lotIndexDisplay').textContent = '1';
      document.getElementById('lotTotalDisplay').textContent = String(lotTotal);

      // Move to lot entry
      sellerSection.classList.add('hidden');
      lotEntrySection.classList.remove('hidden');

      // Display/hide per-lot pricing
      togglePerLotPricing(!globalPrices);
    } catch (err) {
      console.error(err);
      alert('Failed to create sale.');
    }
  });

  // show/hide per-lot pricing rows
  document.getElementById('globalPrices').addEventListener('change', (e) => {
    togglePerLotPricing(e.target.value === 'no');
  });

  function togglePerLotPricing(show) {
    document.getElementById('perLotPricingRow').style.display = show ? 'block' : 'none';
    document.getElementById('perLotIncrementRow').style.display = show ? 'block' : 'none';
    document.getElementById('globalPricingInputs').style.display = show ? 'none' : 'grid';
  }

  // save lot button
  document.getElementById('saveLotBtn').addEventListener('click', async (evt) => {
    evt.preventDefault();
    if (!currentSaleId) { alert('Sale not created'); return; }

    const earNotch = document.getElementById('earNotch').value.trim();
    const pedigree = document.getElementById('pedigree').value.trim();
    const breed = document.getElementById('breed').value.trim();

    const lotStartingBid = parseFloat(document.getElementById('lotStartingBid').value || 0);
    const lotIncrement = parseFloat(document.getElementById('lotIncrement').value || 0);

    const photoFile = document.getElementById('lotPhoto').files[0] || null;
    const lotNumber = currentLotIndex + 1;

    if (!earNotch) { alert('Ear Notch required'); return; }

    try {
      let photoUrl = '';
      if (photoFile) {
        const path = `sales/${currentSaleId}/lotPhotos/lot${lotNumber}_${Date.now()}`;
        const storageRef = sref(storage, path);
        await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(storageRef);
      }

      // create lot doc
      const lotObj = {
        saleId: currentSaleId,
        lotNumber,
        earNotch,
        pedigree,
        breed,
        photoUrl,
        createdAt: serverTimestamp(),
        startingBid: lotStartingBid || undefined,
        increment: lotIncrement || undefined,
        currentBid: null, // to be updated later
        winningBidder: null
      };

      await addDoc(collection(db, 'lots'), lotObj);

      // advance index or finish
      currentLotIndex++;
      if (currentLotIndex < lotTotal) {
        document.getElementById('lotIndexDisplay').textContent = String(currentLotIndex + 1);
        // clear inputs for next lot
        document.getElementById('earNotch').value = '';
        document.getElementById('pedigree').value = '';
        document.getElementById('breed').value = '';
        document.getElementById('lotPhoto').value = '';
        document.getElementById('lotStartingBid').value = '';
        document.getElementById('lotIncrement').value = '';
      } else {
        // all lots saved: show dashboard
        lotEntrySection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        await loadDashboard(currentSaleId);
      }

    } catch (err) {
      console.error(err);
      alert('Failed to save lot.');
    }
  });

  document.getElementById('finishSaleBtn').addEventListener('click', (e) => {
    e.preventDefault();
    // user chooses to finish early
    if (!currentSaleId) return;
    lotEntrySection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    loadDashboard(currentSaleId);
  });

  async function loadDashboard(saleId) {
    // load sale meta and lots
    const saleDoc = await getDoc(doc(db, 'sales', saleId));
    if (!saleDoc.exists()) {
      alert('Sale not found.');
      return;
    }
    const sale = saleDoc.data();
    document.getElementById('dashboardSaleTitle').textContent = `${sale.businessName} — ${sale.saleName}`;
    const start = `${sale.startLocal} ${sale.startTz}`;
    const end = `${sale.endLocal} ${sale.endTz}`;
    document.getElementById('dashboardSaleDates').textContent = `Sale Date (${start} thru ${end})`;

    // generate live url
    const liveUrl = `${location.origin}/biddingform/live.html?saleId=${saleId}`;
    document.getElementById('liveLinkDisplay').textContent = liveUrl;

    // attach button handlers
    document.getElementById('shareBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(liveUrl).then(()=> {
        alert('Live link copied to clipboard.');
      });
    });

    document.getElementById('startSaleBtn').addEventListener('click', async () => {
      await updateDoc(doc(db,'sales',saleId), { status: 'live' });
      alert('Sale started.');
    });
    document.getElementById('pauseSaleBtn').addEventListener('click', async () => {
      await updateDoc(doc(db,'sales',saleId), { status: 'paused' });
      alert('Sale paused.');
    });
    document.getElementById('endSaleBtn').addEventListener('click', async () => {
      await updateDoc(doc(db,'sales',saleId), { status: 'ended' });
      alert('Sale ended.');
    });

    document.getElementById('exportAllBtn').addEventListener('click', async () => {
      const bids = await getDocs(collection(db, 'bids'));
      downloadCSV(snapshotToRows(bids), `all_bids_${saleId}.csv`);
    });

    document.getElementById('exportWinningBtn').addEventListener('click', async () => {
      // get latest lot winners
      const lotsSnap = await getDocs(query(collection(db,'lots'), where('saleId','==', saleId), orderBy('lotNumber')));
      const rows = [];
      lotsSnap.forEach(docSnap => {
        const d = docSnap.data();
        rows.push({
          lotNumber: d.lotNumber,
          earNotch: d.earNotch,
          currentBid: d.currentBid || '',
          winningBidder: d.winningBidder || ''
        });
      });
      downloadCSV(rows, `winning_bids_${saleId}.csv`);
    });

    // show lot grid
    await renderLotsGrid(saleId);
  }

  async function renderLotsGrid(saleId) {
    const lotsGrid = document.getElementById('lotsGrid');
    lotsGrid.innerHTML = '';
    const q = query(collection(db,'lots'), where('saleId','==', saleId), orderBy('lotNumber'));
    const snap = await getDocs(q);
    snap.forEach(ldoc => {
      const d = ldoc.data();
      const card = document.createElement('div');
      card.className = 'lot-card';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>Lot ${d.lotNumber}</strong><small>${d.earNotch}</small>
        </div>
        <img src="${d.photoUrl || 'assets/placeholder.png'}" alt="lot photo" />
        <p class="muted">Breed: ${d.breed || ''}</p>
        <p class="muted">Pedigree: ${d.pedigree || ''}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <div><strong>${d.currentBid ? `$${d.currentBid}` : 'Starting Bid'}</strong></div>
          <div class="muted">${d.winningBidder || ''}</div>
        </div>
      `;
      lotsGrid.appendChild(card);
    });
  }

  // small utilities
  function snapshotToRows(snapshot) {
    const rows = [];
    snapshot.forEach(s => {
      const d = s.data();
      rows.push({ id: s.id, ...d });
    });
    return rows;
  }

  function downloadCSV(rows, filename='export.csv') {
    if (!rows || rows.length === 0) { alert('No data'); return; }
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(',')].concat(rows.map(r => keys.map(k => `"${String(r[k]||'').replace(/"/g,'""')}"`).join(','))).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}

/* --------------------------
   Live page logic (view-only)
   -------------------------- */
async function initLivePage() {
  const urlParams = new URLSearchParams(location.search);
  const saleId = urlParams.get('saleId');
  if (!saleId) {
    document.getElementById('lotsSection').innerHTML = '<p class="muted">No sale specified.</p>';
    return;
  }

  // load sale
  const saleDoc = await getDoc(doc(db, 'sales', saleId));
  if (!saleDoc.exists()) {
    document.getElementById('lotsSection').innerHTML = '<p class="muted">Sale not found.</p>';
    return;
  }
  const sale = saleDoc.data();
  document.getElementById('liveBrand').textContent = sale.businessName || 'Caprock';
  document.getElementById('liveSaleName').textContent = sale.saleName || 'Live Board';
  document.getElementById('businessInfo').textContent = sale.saleDesc || '';
  document.getElementById('saleDates').textContent = `${sale.startLocal} ${sale.startTz} thru ${sale.endLocal} ${sale.endTz}`;
  document.getElementById('displayLiveUrl').textContent = location.href;

  // load lots
  const lotsSnap = await getDocs(query(collection(db,'lots'), where('saleId','==', saleId), orderBy('lotNumber')));
  const lotsSection = document.getElementById('lotsSection');
  lotsSection.innerHTML = '';
  lotsSnap.forEach(ld => {
    const d = ld.data();
    const card = document.createElement('div');
    card.className = 'lot-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>Lot ${d.lotNumber}</strong><small>${d.earNotch}</small>
      </div>
      <img src="${d.photoUrl || '../assets/placeholder.png'}" alt="lot photo" />
      <p class="muted">Breed: ${d.breed || ''}</p>
      <p class="muted">Pedigree: ${d.pedigree || ''}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <div><strong>${d.currentBid ? `$${d.currentBid}` : 'Starting Bid'}</strong></div>
        <div class="muted">${d.winningBidder || ''}</div>
      </div>
      <div style="margin-top:8px"><button class="btn outline" disabled>Bid on me!</button></div>
    `;
    // click to enlarge photo
    card.querySelector('img').addEventListener('click', () => {
      openImageModal(d.photoUrl || '../assets/placeholder.png');
    });
    lotsSection.appendChild(card);
  });

  // Get bidding number modal
  const getNumberBtn = document.getElementById('getNumberBtn');
  const getNumberModal = document.getElementById('getNumberModal');
  getNumberBtn.addEventListener('click', () => getNumberModal.classList.remove('hidden'));
  document.getElementById('cancelNumberBtn').addEventListener('click', () => getNumberModal.classList.add('hidden'));
  document.getElementById('requestNumberBtn').addEventListener('click', async () => {
    const name = document.getElementById('bidderName').value.trim();
    const phone = document.getElementById('bidderPhone').value.trim();
    const email = document.getElementById('bidderEmail').value.trim();
    if (!name || !phone) { document.getElementById('bidderMsg').textContent = 'Name and phone required.'; return; }
    const bidNumber = Math.floor(10000 + Math.random()*90000).toString(); // simple 5-digit
    try {
      await addDoc(collection(db, 'bidders'), { saleId, name, phone, email, bidNumber, createdAt: serverTimestamp() });
      document.getElementById('bidderMsg').textContent = `Your bidding number: ${bidNumber}`;
    } catch (err) {
      console.error(err); document.getElementById('bidderMsg').textContent = 'Error creating bidder.';
    }
  });

  // helper: open image in modal
  function openImageModal(src) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content card"><img src="${src}" style="width:100%;height:auto" /><div style="text-align:right;margin-top:8px"><button class="btn" id="closeImgBtn">Close</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#closeImgBtn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target===modal) modal.remove(); });
  }
}

/* --------------------------
   Admin page logic (PIN: KW1912)
   -------------------------- */
async function initAdminPage() {
  const adminPinInput = document.getElementById('adminPinInput');
  const adminPinBtn = document.getElementById('adminPinBtn');
  const adminPanel = document.getElementById('adminPanel');
  const adminPrompt = document.getElementById('adminPrompt');

  const PIN = 'KW1912';

  adminPinBtn.addEventListener('click', async () => {
    const val = adminPinInput.value.trim();
    if (val !== PIN) {
      alert('Invalid PIN');
      return;
    }
    adminPrompt.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    loadEntryCodes();
  });

  document.getElementById('createEntryCodeBtn').addEventListener('click', async () => {
    const code = document.getElementById('newEntryCode').value.trim();
    if (!code) { alert('Enter a code'); return; }
    try {
      await setDoc(doc(db,'entryCodes',code), { createdAt: serverTimestamp(), active: true });
      document.getElementById('newEntryCode').value = '';
      loadEntryCodes();
    } catch (err) {
      console.error(err);
      alert('Failed to create code.');
    }
  });

  async function loadEntryCodes() {
    const list = document.getElementById('entryCodesList');
    list.innerHTML = '<p class="muted">Loading...</p>';
    const snap = await getDocs(collection(db, 'entryCodes'));
    list.innerHTML = '';
    snap.forEach(s => {
      const d = s.data();
      const el = document.createElement('div');
      el.className = 'card';
      el.style.marginTop='8px';
      el.innerHTML = `<strong>${s.id}</strong> <span class="muted">Active: ${d.active? 'yes':'no'}</span>`;
      list.appendChild(el);
    });
  }
}
