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

const initialDatabaseTemplate = {
  users: [
    {
      id: 'USR-101',
      name: 'Savban Kagzi',
      phone: '9876543210',
      password: '123',
      accNumber: 'BEB-700109',
      accType: 'SAVINGS',
      balance: 45000,
      address: 'Ring Road, Surat, Gujarat',
      kycVerified: true,
      riskScore: 98 // 100 = Lowest Risk, Verified
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
      role: 'Chief AI Clearance & Vault Supervisor' 
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
      status: 'AVAILABLE',
      trustRating: 4.9
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
      amount: 45000,
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

function loadDatabaseFromDisk() {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const fileData = fs.readFileSync(DB_FILE_PATH, 'utf8');
      const parsed = JSON.parse(fileData);
      if (!parsed.userNotifications) parsed.userNotifications = {};
      if (!parsed.securityAlerts) parsed.securityAlerts = [];
      return parsed;
    }
  } catch (err) {
    console.error('DB initialization fallback:', err.message);
  }
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initialDatabaseTemplate, null, 2), 'utf8');
  return JSON.parse(JSON.stringify(initialDatabaseTemplate));
}

const DB = loadDatabaseFromDisk();

function commitToDisk() {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(DB, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving DB:', err.message);
  }
}

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
  commitToDisk();
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
  commitToDisk();

  broadcast('SECURITY_ALARM', incident);
  broadcast('STATE_CHANGED', {});
}

// Anti-Hijack Timeout Check Engine (Runs every 8 seconds)
setInterval(() => {
  const now = Date.now();
  let modified = false;

  (DB.orders || []).forEach(order => {
    if (order.status === 'IN_TRANSIT' && order.expiryEpoch && now > order.expiryEpoch) {
      order.status = 'AUTO_FROZEN';
      order.otp = 'SELF_DESTRUCTED';
      order.currentLocation = '🚨 1-HOUR LIMIT EXCEEDED! Vault Auto-Frozen. Forensic Ink Deployed.';

      const tx = DB.transactions.find(t => t.orderId === order.id);
      if (tx) tx.status = 'FAILED (VAULT AUTO-FROZEN)';

      dispatchPoliceAndBankAlert(
        order.id,
        'ANTI-HIJACK 1-HOUR TIMEOUT BREACH',
        `Vault #${order.vaultId} timed out in transit. Automatic self-lockdown activated. Neutralizer released.`,
        order.lat,
        order.lng
      );

      sendUserScopedSMS(order.userPhone, `[SECURITY ALERT] Vault #${order.vaultId} transit window expired. Autonomous self-lockdown activated. Your balance is 100% untouched and safe.`);
      modified = true;
    }
  });

  if (modified) commitToDisk();
}, 8000);

// ============================================================================
// AI AUTONOMOUS CLEARANCE ENGINE (RBI Anti-Money Laundering Framework)
// ============================================================================
function runAiFraudAndEligibilityCheck(user, amount, lat, lng) {
  let score = 95;
  let flags = [];

  // 1. RBI Hard Rule: Maximum ₹25,000 for any doorstep cash withdrawal
  if (amount > 25000) {
    return {
      passed: false,
      reason: 'RBI Mandate Breach: Maximum doorstep cash withdrawal is strictly capped at ₹25,000 per request.'
    };
  }

  // 2. Solvency Ratio Check
  if (user.balance < amount) {
    return {
      passed: false,
      reason: `Insufficient Balance. Available balance: ₹${user.balance.toLocaleString('en-IN')}`
    };
  }

  // 3. Geofencing Velocity Check (Surat Core Zone: 21.0 - 21.3 N, 72.7 - 73.0 E)
  const isSurat = (lat >= 21.0 && lat <= 21.3) && (lng >= 72.7 && lng <= 73.0);
  if (!isSurat) {
    score -= 35;
    flags.push('GEOFENCE_DRIFT_DETECTED');
  }

  // 4. Identity Confidence & KYC Integrity
  if (!user.kycVerified) {
    score -= 40;
    flags.push('KYC_TIER_UNCONFIRMED');
  }

  return {
    passed: score >= 60,
    confidenceScore: score,
    flags: flags,
    reason: score >= 60 ? 'AI Risk Assessment: CLEAN' : 'AI Risk Score High: Flagged for Suspicious Anomaly'
  };
}

// ============================================================================
// CUSTOMER APIS
// ============================================================================
app.post('/api/user/send-reg-otp', (req, res) => {
  const { name, phone, password, accType, initialDeposit, address } = req.body;
  if (!name || !phone || !password || !accType) return res.status(400).json({ error: 'Please fill all required fields.' });

  const cleanPhone = String(phone).trim();
  if (DB.users.some(u => String(u.phone).trim() === cleanPhone)) {
    return res.status(400).json({ error: 'Mobile number already registered.' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  DB.tempRegistrations[cleanPhone] = {
    name, phone: cleanPhone, password: String(password).trim(), accType,
    initialDeposit: parseFloat(initialDeposit) || 0,
    address: address || 'Surat, Gujarat',
    otp
  };
  commitToDisk();

  sendUserScopedSMS(cleanPhone, `[BHARAT EXPRESS BANK] Your Account Registration OTP is: ${otp}. Valid for 5 minutes.`);
  res.json({ success: true, message: `OTP dispatched to ${cleanPhone}!`, demoOtp: otp });
});

app.post('/api/user/verify-reg-otp', (req, res) => {
  const { phone, otp } = req.body;
  const pKey = String(phone || '').trim();
  const pending = DB.tempRegistrations[pKey];

  if (!pending) return res.status(400).json({ error: 'No registration session found.' });
  if (pending.otp !== String(otp).trim()) return res.status(400).json({ error: 'Incorrect OTP entered.' });

  const newId = 'USR-' + Math.floor(100 + Math.random() * 900);
  const newUser = {
    id: newId,
    name: pending.name,
    phone: pending.phone,
    password: pending.password,
    accNumber: 'BEB-' + Math.floor(100000 + Math.random() * 900000),
    accType: pending.accType,
    balance: pending.initialDeposit,
    address: pending.address,
    kycVerified: true,
    riskScore: 98
  };

  DB.users.push(newUser);

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
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, user: newUser });
});

app.post('/api/user/login', (req, res) => {
  const { phone, password } = req.body;
  const user = DB.users.find(u => String(u.phone).trim() === String(phone).trim() && String(u.password).trim() === String(password).trim());
  if (!user) return res.status(401).json({ error: 'Invalid phone or security password.' });
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

  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, user, txId });
});

// CASH REQUEST WITH EMBEDDED AI AUTONOMOUS CLEARANCE ENGINE
app.post('/api/user/request-cash', (req, res) => {
  const { userId, amount, lat, lng } = req.body;
  const user = DB.users.find(u => String(u.id).trim() === String(userId).trim());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const val = parseFloat(amount);

  // 1. Strict Flat Limit: ₹25,000 for Both Savings & Current
  if (val > 25000) {
    return res.status(400).json({ error: 'RBI Compliance Rule: Doorstep cash delivery is strictly capped at ₹25,000 per order for all accounts.' });
  }

  // 2. AI Autonomous Evaluation
  const aiResult = runAiFraudAndEligibilityCheck(user, val, lat || 21.1702, lng || 72.8311);
  if (!aiResult.passed) {
    return res.status(400).json({ error: `AI Safety Block: ${aiResult.reason}` });
  }

  const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  const timeNow = getFormattedDateTime();
  const isoTime = new Date().toISOString();

  // Instant Automated Approval by AI
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const order = {
    id: orderId,
    userId: user.id,
    userName: user.name,
    userPhone: user.phone,
    accNumber: user.accNumber,
    accType: user.accType,
    amount: val,
    status: 'ACCEPTED_BY_BANK', // AI Automatically Clears & Seals Vault
    aiCleared: true,
    aiConfidence: `${aiResult.confidenceScore}%`,
    otp: otp,
    wrongOtpAttempts: 0,
    vaultId: 'VAULT-IoT-' + Math.floor(100 + Math.random() * 900),
    agentId: null,
    agentName: null,
    agentPhone: null,
    agentVehicle: null,
    currentLocation: 'AI Autonomous Clearance SUCCESS. Smart Vault Sealed at Central Branch. Waiting for Delivery Agent.',
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

  commitToDisk();

  sendUserScopedSMS(user.phone, `[AI CLEARANCE SUCCESS] CashBridge Request #${orderId} of ₹${val.toLocaleString('en-IN')} approved by Bank AI. Vault #${order.vaultId} sealed. 1-Hour timer starts upon agent pickup.`);
  
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
      error: 'Security Lock: Cash delivery is currently active! Vault unlock OTP and agent tracking telemetry cannot be cleared until the cash is safely delivered and verified via photographic proof.'
    });
  }

  if (DB.userNotifications && DB.userNotifications[cleanPhone]) {
    DB.userNotifications[cleanPhone] = [];
    commitToDisk();
  }

  res.json({ success: true, message: 'All notifications have been successfully cleared from your private inbox.' });
});

app.post('/api/user/contact', (req, res) => {
  const { name, phone, subject, message } = req.body;
  DB.contactMessages.unshift({ name, phone, subject, message, time: getFormattedDateTime() });
  commitToDisk();
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

  const user = DB.users.find(u => String(u.id).trim() === String(order.userId).trim());
  if (user.balance < order.amount) return res.status(400).json({ error: 'Insufficient funds.' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  order.status = 'ACCEPTED_BY_BANK';
  order.otp = otp;
  order.currentLocation = 'Vault Sealed at Central Bank Desk. Waiting for Delivery Agent.';

  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, otp });
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

  commitToDisk();
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

  // 1-HOUR COUNTDOWN TIMER STARTS HERE
  order.dispatchedAt = Date.now();
  order.expiryEpoch = Date.now() + (60 * 60 * 1000);
  order.currentLocation = 'Vault Picked Up by Agent! Moving towards Customer Location. 1-Hour Anti-Hijack Timer ACTIVE.';

  const tx = DB.transactions.find(t => t.orderId === orderId);
  if (tx) tx.status = 'IN_TRANSIT (1-HR TIMER ACTIVE)';

  commitToDisk();
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

    commitToDisk();
    broadcast('STATE_CHANGED', {});
    return res.json({ success: true, message: 'Vault Unlocked! Take photographic proof to finalize delivery.' });
  }

  order.wrongOtpAttempts += 1;
  commitToDisk();

  if (order.wrongOtpAttempts >= 3) {
    order.status = 'TAMPERED';
    order.otp = 'SELF_DESTRUCTED';
    order.currentLocation = '🚨 3 WRONG PIN ENTRIES! Vault Locked. Police Control Room Dispatched.';

    const tx = DB.transactions.find(t => t.orderId === orderId);
    if (tx) tx.status = 'FAILED (3 WRONG PINS LOCKDOWN)';

    commitToDisk();

    dispatchPoliceAndBankAlert(
      order.id, 
      'CRITICAL: 3 FAILED PIN ATTEMPTS', 
      `Unauthorized PIN entered 3 times on Vault #${order.vaultId}. Hijack defense protocol activated.`, 
      order.lat, 
      order.lng
    );

    sendUserScopedSMS(order.userPhone, `[SECURITY ALERT] 3 incorrect OTP entries detected on Vault #${order.vaultId}. Vault locked down and Surat Police Control Room dispatched. Your funds remain 100% safe.`);

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

  commitToDisk();
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
    commitToDisk();
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

app.get('/api/state', (req, res) => res.json(DB));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BHARAT EXPRESS BANK (CashBridge) live on port ${PORT}`);
  console.log(`🧠 AI Autonomous Clearance Engine Active`);
  console.log(`🛡️ RBI Compliance Enforced: Max ₹25,000 Flat Withdrawal Cap`);
});