const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE_PATH = path.join(__dirname, 'bharat_express_db.json');

// Default Seed Data
const initialDatabaseTemplate = {
  users: [
    {
      id: 'USR-101',
      name: 'Savban Kagzi',
      phone: '9876543210',
      password: '123',
      accNumber: 'BEB-700109',
      accType: 'SAVINGS',
      balance: 35000,
      address: 'Ring Road, Surat, Gujarat'
    }
  ],
  bankStaff: [
    { 
      id: 'STAFF-01', 
      username: 'admin', 
      password: '123', 
      name: 'Branch Officer (Surat)', 
      phone: '9825012345', 
      branch: 'Surat Main Branch', 
      role: 'Senior Vault Dispatch Officer' 
    }
  ],
  agents: [
    { 
      id: 'AGT-01', 
      username: 'ramesh', 
      phone: '9988776655', 
      password: '123', 
      name: 'Ramesh Patel', 
      vehicle: 'GJ-05-AB-1234',
      status: 'AVAILABLE'
    }
  ],
  orders: [],
  transactions: [
    {
      id: 'TXN-9011',
      userId: 'USR-101',
      orderId: null,
      type: 'ACCOUNT_OPENING',
      description: 'Account Opening Deposit',
      amount: 35000,
      txType: 'CREDIT',
      timestamp: '26/09/2026, 08:30:00 am',
      isoTime: '2026-09-26T08:30:00.000Z',
      status: 'SUCCESS'
    }
  ],
  securityAlerts: [],
  userNotifications: {},
  tempRegistrations: {},
  tempStaffRegistrations: {},
  tempAgentRegistrations: {},
  contactMessages: []
};

// Permanent Active Database Instance
let DB = null;

function initDatabase() {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const fileData = fs.readFileSync(DB_FILE_PATH, 'utf8');
      DB = JSON.parse(fileData);
      if (!DB.users) DB.users = [];
      if (!DB.bankStaff) DB.bankStaff = [];
      if (!DB.agents) DB.agents = [];
      if (!DB.orders) DB.orders = [];
      if (!DB.transactions) DB.transactions = [];
      if (!DB.securityAlerts) DB.securityAlerts = [];
      if (!DB.userNotifications) DB.userNotifications = {};
      if (!DB.tempRegistrations) DB.tempRegistrations = {};
      console.log(`[DATABASE] Loaded ${DB.users.length} active registered users from storage.`);
      return;
    }
  } catch (err) {
    console.error('[DATABASE LOAD ERROR]:', err.message);
  }
  DB = JSON.parse(JSON.stringify(initialDatabaseTemplate));
  saveToDisk();
}

function saveToDisk() {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(DB, null, 2), 'utf8');
  } catch (err) {
    console.error('[DATABASE WRITE ERROR]:', err.message);
  }
}

initDatabase();

function getFormattedDateTime() {
  return new Date().toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
}

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function sendUserScopedSMS(phone, message) {
  const clean = String(phone).trim();
  if (!DB.userNotifications) DB.userNotifications = {};
  if (!DB.userNotifications[clean]) DB.userNotifications[clean] = [];

  const notifObj = {
    to: clean,
    message: message,
    timestamp: getFormattedDateTime()
  };

  DB.userNotifications[clean].unshift(notifObj);
  saveToDisk();
  broadcast('SMS_NOTIFICATION', notifObj);
}

function dispatchPoliceAndBankAlert(orderId, breachType, description, lat, lng) {
  const incident = {
    id: 'SOS-' + Math.floor(1000 + Math.random() * 9000),
    orderId: orderId || 'VAULT-SYS',
    breachType: breachType,
    description: description,
    policeStation: 'Surat Central Police Control Room (Dial 112)',
    coordinates: `${lat || 21.1702}, ${lng || 72.8311}`,
    timestamp: getFormattedDateTime(),
    isoTime: new Date().toISOString()
  };

  if (!DB.securityAlerts) DB.securityAlerts = [];
  DB.securityAlerts.unshift(incident);
  saveToDisk();

  broadcast('SECURITY_ALARM', incident);
  broadcast('STATE_CHANGED', {});
}

// 1-Hour Hijack Timeout Checker
setInterval(() => {
  const now = Date.now();
  let modified = false;

  (DB.orders || []).forEach(order => {
    if (order.status === 'IN_TRANSIT' && order.expiryEpoch && now > order.expiryEpoch) {
      order.status = 'AUTO_FROZEN';
      order.otp = 'SELF_DESTRUCTED';
      order.currentLocation = '🚨 1-HOUR LIMIT EXCEEDED! Vault Auto-Frozen. Forensic Dye Deployed.';

      const tx = DB.transactions.find(t => t.orderId === order.id);
      if (tx) tx.status = 'FAILED (VAULT AUTO-FROZEN)';

      dispatchPoliceAndBankAlert(
        order.id,
        'ANTI-HIJACK 1-HOUR TIMEOUT BREACH',
        `Vault #${order.vaultId} transit exceeded 1-hour window. Neutralizer ink deployed.`,
        order.lat,
        order.lng
      );

      sendUserScopedSMS(order.userPhone, `[SECURITY ALERT] Vault #${order.vaultId} transit window expired. Self-lockdown activated. Your balance is 100% safe.`);
      modified = true;
    }
  });

  if (modified) saveToDisk();
}, 8000);

// ============================================================================
// CUSTOMER REGISTRATION & ACTIVE USER ENDPOINTS
// ============================================================================
app.post('/api/user/send-reg-otp', (req, res) => {
  const { name, phone, password, accType, initialDeposit, address } = req.body;
  if (!name || !phone || !password || !accType) {
    return res.status(400).json({ error: 'Please fill all required registration fields.' });
  }

  const cleanPhone = String(phone).trim();
  if (DB.users.some(u => String(u.phone).trim() === cleanPhone)) {
    return res.status(400).json({ error: 'This mobile number is already registered!' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  DB.tempRegistrations[cleanPhone] = {
    name: name.trim(),
    phone: cleanPhone,
    password: String(password).trim(),
    accType,
    initialDeposit: parseFloat(initialDeposit) || 0,
    address: address ? address.trim() : 'Surat, Gujarat',
    otp
  };
  saveToDisk();

  sendUserScopedSMS(cleanPhone, `[BHARAT EXPRESS BANK] Your Account Registration OTP is: ${otp}. Valid for 5 minutes.`);
  res.json({ success: true, message: `OTP sent to ${cleanPhone}!`, demoOtp: otp });
});

app.post('/api/user/verify-reg-otp', (req, res) => {
  const { phone, otp } = req.body;
  const pKey = String(phone || '').trim();
  const pending = DB.tempRegistrations[pKey];

  if (!pending) {
    return res.status(400).json({ error: 'No pending registration found for this mobile number.' });
  }
  if (pending.otp !== String(otp).trim()) {
    return res.status(400).json({ error: 'Incorrect OTP entered. Please try again.' });
  }

  const newId = 'USR-' + Math.floor(1000 + Math.random() * 9000);
  const newAccountNo = 'BEB-' + Math.floor(100000 + Math.random() * 900000);

  const newUser = {
    id: newId,
    name: pending.name,
    phone: pending.phone,
    password: pending.password,
    accNumber: newAccountNo,
    accType: pending.accType,
    balance: pending.initialDeposit,
    address: pending.address
  };

  // Directly push to active in-memory list
  DB.users.unshift(newUser);

  if (newUser.balance > 0) {
    const timeNow = getFormattedDateTime();
    DB.transactions.unshift({
      id: 'TXN-' + Math.floor(1000 + Math.random() * 9000),
      userId: newId,
      orderId: null,
      type: 'OPENING_DEPOSIT',
      description: 'Account Opening Deposit (UPI QR)',
      amount: newUser.balance,
      txType: 'CREDIT',
      timestamp: timeNow,
      isoTime: new Date().toISOString(),
      status: 'SUCCESS'
    });
  }

  delete DB.tempRegistrations[pKey];
  saveToDisk();

  console.log(`[USER REGISTERED] User: ${newUser.name} | Acc: ${newUser.accNumber} | Total Users: ${DB.users.length}`);

  // Broadcast immediate sync to all open browser windows
  broadcast('STATE_CHANGED', { totalUsers: DB.users.length });
  res.json({ success: true, user: newUser });
});

app.post('/api/user/login', (req, res) => {
  const { phone, password } = req.body;
  const cleanPhone = String(phone || '').trim();
  const cleanPass = String(password || '').trim();

  const user = DB.users.find(u => String(u.phone).trim() === cleanPhone && String(u.password).trim() === cleanPass);
  if (!user) return res.status(401).json({ error: 'Invalid registered phone number or password.' });
  res.json({ success: true, user });
});

app.post('/api/user/deposit', (req, res) => {
  const { userId, amount } = req.body;
  const user = DB.users.find(u => String(u.id).trim() === String(userId).trim());
  if (!user) return res.status(404).json({ error: 'User account not found' });

  const val = parseFloat(amount);
  if (!val || val <= 0) return res.status(400).json({ error: 'Enter valid deposit amount' });

  user.balance += val;
  const timeNow = getFormattedDateTime();
  const txId = 'TXN-' + Math.floor(1000 + Math.random() * 9000);

  DB.transactions.unshift({
    id: txId,
    userId: user.id,
    orderId: null,
    type: 'DEPOSIT',
    description: 'Instant Account Deposit (UPI QR)',
    amount: val,
    txType: 'CREDIT',
    timestamp: timeNow,
    isoTime: new Date().toISOString(),
    status: 'SUCCESS'
  });

  saveToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, user, txId });
});

// CASH REQUEST WITH REAL-TIME AI CLEARANCE
app.post('/api/user/request-cash', (req, res) => {
  const { userId, amount, lat, lng } = req.body;
  const user = DB.users.find(u => String(u.id).trim() === String(userId).trim());
  if (!user) return res.status(404).json({ error: 'User account not found.' });

  const val = parseFloat(amount);
  if (!val || val <= 0) return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });

  if (val > 25000) {
    return res.status(400).json({ error: 'Regulatory Rule: Maximum doorstep cash withdrawal limit is ₹25,000 per request.' });
  }

  if (user.balance < val) {
    return res.status(400).json({ error: `Insufficient balance! Your current balance is ₹${user.balance.toLocaleString('en-IN')}.` });
  }

  const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  const timeNow = getFormattedDateTime();
  const isoTime = new Date().toISOString();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const order = {
    id: orderId,
    userId: user.id,
    userName: user.name,
    userPhone: user.phone,
    accNumber: user.accNumber,
    accType: user.accType,
    amount: val,
    status: 'ACCEPTED_BY_BANK',
    aiCleared: true,
    aiConfidence: '98%',
    otp: otp,
    wrongOtpAttempts: 0,
    vaultId: 'VAULT-IoT-' + Math.floor(100 + Math.random() * 900),
    agentId: null,
    agentName: null,
    agentPhone: null,
    agentVehicle: null,
    currentLocation: 'AI Cleared. Vault Sealed at Central Branch. Waiting for Delivery Agent pickup.',
    lat: lat || 21.1702,
    lng: lng || 72.8311,
    deliveryAddress: user.address || 'Ring Road, Surat, Gujarat',
    bankAddress: 'BHARAT EXPRESS BANK, Central Branch, Surat',
    bankLat: 21.1895,
    bankLng: 72.8258,
    timestamp: timeNow,
    isoTime: isoTime,
    dispatchedAt: null,
    expiryEpoch: null
  };

  DB.orders.unshift(order);
  DB.transactions.unshift({
    id: 'TXN-' + Math.floor(1000 + Math.random() * 9000),
    userId: user.id,
    orderId: orderId,
    type: 'CASHBRIDGE_REQUEST',
    description: `Doorstep Cash Request (${orderId})`,
    amount: val,
    txType: 'DEBIT',
    timestamp: timeNow,
    isoTime: isoTime,
    status: 'AI APPROVED (WAITING AGENT PICKUP)'
  });

  saveToDisk();
  sendUserScopedSMS(user.phone, `[AI CLEARANCE APPROVED] CashBridge Order #${orderId} of ₹${val.toLocaleString('en-IN')} approved by Bank AI. Vault #${order.vaultId} sealed. OTP will activate on agent pickup.`);
  
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, order, message: 'AI Autonomous Clearance Approved: Vault sealed and queued for agent pickup.' });
});

app.post('/api/user/clear-notifications', (req, res) => {
  const { userId, phone } = req.body;
  const cleanPhone = String(phone || '').trim();

  const hasActiveVaultOrder = (DB.orders || []).some(o => 
    String(o.userId).trim() === String(userId).trim() && 
    ['PENDING', 'ACCEPTED_BY_BANK', 'IN_TRANSIT', 'VAULT_OPENED'].includes(o.status)
  );

  if (hasActiveVaultOrder) {
    return res.status(403).json({
      error: 'Security Lock: Cash delivery is currently active! Vault unlock OTP cannot be cleared until delivery is completed.'
    });
  }

  if (DB.userNotifications && DB.userNotifications[cleanPhone]) {
    DB.userNotifications[cleanPhone] = [];
    saveToDisk();
  }

  res.json({ success: true, message: 'All notifications have been successfully cleared from your private inbox.' });
});

app.post('/api/user/contact', (req, res) => {
  const { name, phone, subject, message } = req.body;
  DB.contactMessages.unshift({ name, phone, subject, message, time: getFormattedDateTime() });
  saveToDisk();
  res.json({ success: true, message: 'Inquiry received by customer helpdesk.' });
});

// ============================================================================
// BANK STAFF APIS
// ============================================================================
app.post('/api/bank/login', (req, res) => {
  const { username, password } = req.body;
  const staff = DB.bankStaff.find(s => s.username.toLowerCase() === String(username).trim().toLowerCase() && String(s.password).trim() === String(password).trim());
  if (!staff) return res.status(401).json({ error: 'Invalid Staff Credentials.' });
  res.json({ success: true, staff });
});

app.post('/api/bank/approve-order', (req, res) => {
  const { orderId } = req.body;
  const order = DB.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.status = 'ACCEPTED_BY_BANK';
  order.currentLocation = 'Vault Sealed at Central Bank Desk. Waiting for Delivery Agent.';
  saveToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, otp: order.otp });
});

app.post('/api/bank/adjust-balance', (req, res) => {
  const { accNumber, amount, adjustmentType } = req.body;
  const user = DB.users.find(u => u.accNumber.trim().toUpperCase() === accNumber.trim().toUpperCase());
  if (!user) return res.status(404).json({ error: 'Account number not found' });

  const val = parseFloat(amount);
  if (!val || val <= 0) return res.status(400).json({ error: 'Enter valid amount.' });

  if (adjustmentType === 'DEBIT') {
    if (user.balance < val) return res.status(400).json({ error: 'Cannot debit more than current balance.' });
    user.balance -= val;
  } else {
    user.balance += val;
  }

  DB.transactions.unshift({
    id: 'TXN-' + Math.floor(1000 + Math.random() * 9000),
    userId: user.id,
    orderId: null,
    type: 'BANK_ADJUSTMENT',
    description: `Staff ${adjustmentType} Adjustment`,
    amount: val,
    txType: adjustmentType === 'DEBIT' ? 'DEBIT' : 'CREDIT',
    timestamp: getFormattedDateTime(),
    isoTime: new Date().toISOString(),
    status: 'SUCCESS'
  });

  saveToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, user });
});

// ============================================================================
// DELIVERY AGENT APIS
// ============================================================================
app.post('/api/agent/login', (req, res) => {
  const { phone, password } = req.body;
  const agent = DB.agents.find(a => String(a.phone).trim() === String(phone).trim() && String(a.password).trim() === String(password).trim());
  if (!agent) return res.status(401).json({ error: 'Invalid Agent Credentials.' });
  res.json({ success: true, agent });
});

app.post('/api/agent/accept-order', (req, res) => {
  const { orderId, agentId } = req.body;
  const order = DB.orders.find(o => o.id === orderId);
  const agent = DB.agents.find(a => a.id === agentId);
  if (!order || !agent) return res.status(404).json({ error: 'Order or Agent not found' });

  order.agentId = agent.id;
  order.agentName = agent.name;
  order.agentPhone = agent.phone;
  order.agentVehicle = agent.vehicle;
  order.status = 'IN_TRANSIT';

  order.dispatchedAt = Date.now();
  order.expiryEpoch = Date.now() + (60 * 60 * 1000);
  order.currentLocation = 'Vault Picked Up by Agent! Moving towards Customer Location. 1-Hour Anti-Hijack Active.';

  const tx = DB.transactions.find(t => t.orderId === orderId);
  if (tx) tx.status = 'IN_TRANSIT (1-HR TIMER ACTIVE)';

  saveToDisk();
  sendUserScopedSMS(order.userPhone, `[CashBridge Dispatch] Agent ${agent.name} (Vehicle: ${agent.vehicle}) has collected your Vault! 1-Hour countdown started. Unlock OTP: ${order.otp}.`);
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, expiryEpoch: order.expiryEpoch });
});

app.post('/api/vault/unlock', (req, res) => {
  const { orderId, enteredOtp } = req.body;
  const order = DB.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.status === 'AUTO_FROZEN') {
    return res.status(403).json({ error: 'VAULT FROZEN: 1-Hour delivery window expired. Self-destruction mode active.' });
  }
  if (order.status === 'TAMPERED') {
    return res.status(403).json({ error: 'SECURITY BREACH: Vault locked out due to tampering. Police notified!' });
  }

  if (!order.wrongOtpAttempts) order.wrongOtpAttempts = 0;

  if (String(order.otp).trim() === String(enteredOtp).trim()) {
    order.status = 'VAULT_OPENED';
    order.currentLocation = 'Vault Reached Doorstep & Unlocked by Customer! Ready for photographic handover.';

    const tx = DB.transactions.find(t => t.orderId === orderId);
    if (tx) tx.status = 'VAULT_UNLOCKED (PENDING PHOTO CONFIRMATION)';

    saveToDisk();
    broadcast('STATE_CHANGED', {});
    return res.json({ success: true, message: 'Vault Unlocked! Take photographic proof to finalize delivery.' });
  }

  order.wrongOtpAttempts += 1;
  saveToDisk();

  if (order.wrongOtpAttempts >= 3) {
    order.status = 'TAMPERED';
    order.otp = 'SELF_DESTRUCTED';
    order.currentLocation = '🚨 3 WRONG PIN ENTRIES! Vault Locked. Police Control Room Dispatched.';

    const tx = DB.transactions.find(t => t.orderId === orderId);
    if (tx) tx.status = 'FAILED (3 WRONG PINS LOCKDOWN)';

    saveToDisk();
    dispatchPoliceAndBankAlert(order.id, 'CRITICAL: 3 FAILED PIN ATTEMPTS', `Unauthorized PIN entered 3 times on Vault #${order.vaultId}. Forced hijack protocol triggered.`, order.lat, order.lng);
    sendUserScopedSMS(order.userPhone, `[SECURITY ALERT] 3 incorrect OTP entries detected on Vault #${order.vaultId}. Vault locked down and Surat Police Control Room dispatched. Your money is 100% safe.`);

    return res.status(403).json({ error: 'CRITICAL BREACH: 3 Incorrect PIN entries! Vault permanently locked down and alert sent to Surat Police!' });
  }

  const remaining = 3 - order.wrongOtpAttempts;
  res.status(400).json({ error: `Incorrect OTP entered! Security warning: ${remaining} attempt(s) remaining.` });
});

app.post('/api/agent/complete-delivery', (req, res) => {
  const { orderId, photoBase64 } = req.body;
  const order = DB.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const user = DB.users.find(u => String(u.id).trim() === String(order.userId).trim());
  if (!user) return res.status(404).json({ error: 'User account not found' });

  if (user.balance < order.amount) {
    return res.status(400).json({ error: 'Customer ledger balance insufficient at final settlement!' });
  }
  user.balance -= order.amount;

  const timeNow = getFormattedDateTime();
  const isoTime = new Date().toISOString();

  order.status = 'DELIVERED';
  order.proofPhoto = photoBase64;
  order.deliveredAt = timeNow;
  order.isoTime = isoTime;
  order.currentLocation = 'Delivered & Handed Over Successfully at Customer Destination.';

  const tx = DB.transactions.find(t => t.orderId === orderId);
  if (tx) {
    tx.status = 'SUCCESS (DEBITED ON SAFE HANDOVER)';
    tx.timestamp = timeNow;
    tx.isoTime = isoTime;
  }

  saveToDisk();
  sendUserScopedSMS(order.userPhone, `[BHARAT EXPRESS BANK] Cash of ₹${order.amount.toLocaleString()} safely delivered by ${order.agentName}. ₹${order.amount.toLocaleString()} DEBITED from Acc ${user.accNumber}. Balance: ₹${user.balance.toLocaleString()}.`);

  broadcast('STATE_CHANGED', {});
  res.json({ success: true, newBalance: user.balance });
});

app.post('/api/vault/tamper', (req, res) => {
  const { orderId } = req.body;
  const order = DB.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'TAMPERED';
    order.currentLocation = '🚨 TAMPER BREACH DETECTED! Route Diversion / Attack Alert!';
    const tx = DB.transactions.find(t => t.orderId === orderId);
    if (tx) tx.status = 'FAILED (TAMPERED - FUNDS SAFE)';
    saveToDisk();
  }

  dispatchPoliceAndBankAlert(
    order ? order.id : 'V-101', 
    'PHYSICAL ATTACK / SENSOR TAMPER', 
    'Physical tampering detected! Cash ink neutralized. Alert sent to Surat Police!', 
    order ? order.lat : 21.1702, 
    order ? order.lng : 72.8311
  );

  res.json({ success: true });
});

// Guaranteed Live State Fetch (No Cache)
app.get('/api/state', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(DB);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BHARAT EXPRESS BANK live on port ${PORT}`);
});