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

// ============================================================================
// 📁 PERMANENT STORAGE ENGINE (Direct File-System Storage)
// ============================================================================
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
      description: 'Account Opening Initial Deposit (UPI QR)',
      amount: 35000,
      txType: 'CREDIT',
      timestamp: '24/09/2026, 09:00:00 am',
      isoTime: '2026-09-24T09:00:00.000Z',
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
    console.error('DB load error, initializing default:', err.message);
  }
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initialDatabaseTemplate, null, 2), 'utf8');
  return JSON.parse(JSON.stringify(initialDatabaseTemplate));
}

const DB = loadDatabaseFromDisk();

function commitToDisk() {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(DB, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving DB to disk:', err.message);
  }
}

function getFormattedDateTime() {
  const now = new Date();
  return now.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
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
  if (!DB.userNotifications[clean]) {
    DB.userNotifications[clean] = [];
  }
  
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
    id: 'POLICE-SOS-' + Math.floor(1000 + Math.random() * 9000),
    orderId: orderId || 'V-101',
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

// 1-Hour Timer Background Worker
setInterval(() => {
  const now = Date.now();
  let stateModified = false;

  (DB.orders || []).forEach(order => {
    if (order.status === 'IN_TRANSIT' && order.expiryEpoch) {
      if (now > order.expiryEpoch) {
        order.status = 'AUTO_FROZEN';
        order.otp = 'EXPIRED_LOCKED';
        order.currentLocation = '🚨 1-HOUR AGENT TRANSIT LIMIT EXCEEDED! Vault Auto-Frozen. OTP Destroyed.';
        
        const tx = DB.transactions.find(t => t.orderId === order.id);
        if (tx) tx.status = 'FAILED (VAULT AUTO-FROZEN)';

        dispatchPoliceAndBankAlert(
          order.id, 
          'ANTI-HIJACK 1-HOUR TIMEOUT BREACH', 
          `Vault #${order.vaultId} transit exceeded 1-hour window after agent pickup. Anti-Hijack lock activated. Cash neutralized.`, 
          order.lat, 
          order.lng
        );

        sendUserScopedSMS(order.userPhone, `[SECURITY ALERT] Vault #${order.vaultId} exceeded 1-hour transit time. Anti-Hijack lock activated. Customer funds remain 100% safe.`);
        stateModified = true;
      }
    }
  });

  if (stateModified) {
    commitToDisk();
  }
}, 10000);

// ============================================================================
// 1. CUSTOMER PORTAL APIS
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
    name,
    phone: cleanPhone,
    password: String(password).trim(),
    accType,
    initialDeposit: parseFloat(initialDeposit) || 0,
    address: address || 'Surat, Gujarat',
    otp
  };
  commitToDisk();

  sendUserScopedSMS(cleanPhone, `[BHARAT EXPRESS BANK] Your OTP for Account Opening registration is: ${otp}. Valid for 5 minutes.`);
  res.json({ success: true, message: `OTP sent to ${cleanPhone}!`, demoOtp: otp });
});

app.post('/api/user/verify-reg-otp', (req, res) => {
  const { phone, otp } = req.body;
  const pKey = String(phone || '').trim();
  const pending = DB.tempRegistrations[pKey];

  if (!pending) return res.status(400).json({ error: 'No registration request pending for this number.' });
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
    address: pending.address
  };

  DB.users.push(newUser);

  if (newUser.balance > 0) {
    const timeNow = getFormattedDateTime();
    DB.transactions.unshift({
      id: 'TXN-' + Math.floor(1000 + Math.random() * 9000),
      userId: newId,
      orderId: null,
      type: 'OPENING_DEPOSIT',
      description: 'Account Opening Initial Deposit (UPI QR)',
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
  if (!user) return res.status(401).json({ error: 'Invalid phone or password.' });
  res.json({ success: true, user });
});

app.post('/api/user/change-password', (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  const user = DB.users.find(u => String(u.id).trim() === String(userId).trim());
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (String(user.password).trim() !== String(oldPassword).trim()) return res.status(400).json({ error: 'Current password does not match.' });
  if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'New password must be at least 3 characters.' });

  user.password = String(newPassword).trim();
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, message: 'Password updated successfully!' });
});

app.post('/api/user/delete-account', (req, res) => {
  const { userId, password } = req.body;
  const uid = String(userId || '').trim();
  const pwd = String(password || '').trim();

  const index = DB.users.findIndex(u => String(u.id).trim() === uid);
  if (index === -1) return res.status(404).json({ error: 'Customer account not found.' });
  if (String(DB.users[index].password).trim() !== pwd) return res.status(400).json({ error: 'Incorrect password!' });

  const phone = DB.users[index].phone;
  DB.users.splice(index, 1);
  DB.transactions = DB.transactions.filter(t => String(t.userId).trim() !== uid);
  if (DB.userNotifications) delete DB.userNotifications[phone];

  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, message: 'Your Bank Account has been permanently closed.' });
});

app.post('/api/user/deposit', (req, res) => {
  const { userId, amount } = req.body;
  const user = DB.users.find(u => String(u.id).trim() === String(userId).trim());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const val = parseFloat(amount);
  if (!val || val <= 0) return res.status(400).json({ error: 'Enter valid amount' });

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

app.post('/api/user/request-cash', (req, res) => {
  const { userId, amount, lat, lng } = req.body;
  const user = DB.users.find(u => String(u.id).trim() === String(userId).trim());
  if (!user) return res.status(404).json({ error: 'User not found' });

  const val = parseFloat(amount);
  const maxLimit = user.accType === 'SAVINGS' ? 20000 : 100000;
  if (val > maxLimit) return res.status(400).json({ error: `Withdrawal limit for ${user.accType} is ₹${maxLimit.toLocaleString()}` });
  if (val > user.balance) return res.status(400).json({ error: `Insufficient balance! You have ₹${user.balance.toLocaleString()}.` });

  const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  const timeNow = getFormattedDateTime();
  const isoTime = new Date().toISOString();

  const order = {
    id: orderId,
    userId: user.id,
    userName: user.name,
    userPhone: user.phone,
    accNumber: user.accNumber,
    accType: user.accType,
    amount: val,
    status: 'PENDING',
    otp: null,
    wrongOtpAttempts: 0,
    vaultId: 'VAULT-IoT-901',
    agentId: null,
    agentName: null,
    agentPhone: null,
    agentVehicle: null,
    currentLocation: 'Waiting at Bank Vault Hub (Surat)',
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
    status: 'PENDING (VERIFYING FUNDS)'
  });

  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, order });
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
  res.json({ success: true, message: 'Message submitted to customer care.' });
});

// ============================================================================
// 2. BANK STAFF INFRASTRUCTURE APIS
// ============================================================================

app.post('/api/bank/send-staff-reg-otp', (req, res) => {
  const { name, username, phone, branch, role, password } = req.body;
  if (!name || !username || !phone || !password) return res.status(400).json({ error: 'Please fill all credentials.' });

  const cleanUser = username.trim().toLowerCase();
  if (DB.bankStaff.some(s => s.username.toLowerCase() === cleanUser)) {
    return res.status(400).json({ error: 'Username already in use.' });
  }

  const cleanPhone = String(phone).trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  DB.tempStaffRegistrations[cleanPhone] = {
    name,
    username: cleanUser,
    phone: cleanPhone,
    branch: branch || 'Surat Main Branch',
    role: role || 'Branch Operations Officer',
    password: String(password).trim(),
    otp
  };
  commitToDisk();

  sendUserScopedSMS(cleanPhone, `[BHARAT EXPRESS BANK] Staff Authorization OTP: ${otp}.`);
  res.json({ success: true, message: `OTP sent to ${cleanPhone}`, demoOtp: otp });
});

app.post('/api/bank/verify-staff-reg-otp', (req, res) => {
  const { phone, otp } = req.body;
  const pKey = String(phone || '').trim();
  const pending = DB.tempStaffRegistrations[pKey];

  if (!pending) return res.status(400).json({ error: 'No registration session found.' });
  if (pending.otp !== String(otp).trim()) return res.status(400).json({ error: 'Incorrect OTP entered.' });

  const newStaff = {
    id: 'STAFF-' + Math.floor(10 + Math.random() * 90),
    username: pending.username,
    name: pending.name,
    phone: pending.phone,
    branch: pending.branch,
    role: pending.role,
    password: pending.password
  };

  DB.bankStaff.push(newStaff);
  delete DB.tempStaffRegistrations[pKey];
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, staff: newStaff });
});

app.post('/api/bank/login', (req, res) => {
  const { username, password } = req.body;
  const staff = DB.bankStaff.find(s => s.username.toLowerCase() === String(username).trim().toLowerCase() && String(s.password).trim() === String(password).trim());
  if (!staff) return res.status(401).json({ error: 'Invalid Staff Credentials.' });
  res.json({ success: true, staff });
});

app.post('/api/bank/change-password', (req, res) => {
  const { staffId, oldPassword, newPassword } = req.body;
  const staff = DB.bankStaff.find(s => String(s.id).trim() === String(staffId).trim());
  if (!staff) return res.status(404).json({ error: 'Staff record not found' });
  if (String(staff.password).trim() !== String(oldPassword).trim()) return res.status(400).json({ error: 'Current password does not match.' });
  if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'Password must be at least 3 characters.' });

  staff.password = String(newPassword).trim();
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, message: 'Password updated successfully!' });
});

app.post('/api/bank/delete-account', (req, res) => {
  const { staffId, password } = req.body;
  const sid = String(staffId || '').trim();
  const pwd = String(password || '').trim();

  const index = DB.bankStaff.findIndex(s => String(s.id).trim() === sid);
  if (index === -1) return res.status(404).json({ error: 'Staff record not found.' });
  if (String(DB.bankStaff[index].password).trim() !== pwd) return res.status(400).json({ error: 'Incorrect password!' });

  DB.bankStaff.splice(index, 1);
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, message: 'Staff profile removed successfully from Bank database.' });
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
  order.wrongOtpAttempts = 0;
  order.dispatchedAt = null;
  order.expiryEpoch = null;
  order.currentLocation = 'Vault Sealed at Central Bank Desk. Waiting for Delivery Agent Pick-Up.';

  const tx = DB.transactions.find(t => t.orderId === orderId);
  if (tx) tx.status = 'DISPATCHED (AWAITING AGENT PICKUP)';

  commitToDisk();
  sendUserScopedSMS(user.phone, `[BHARAT EXPRESS BANK] Request Approved! Vault #${order.vaultId} sealed at bank desk. Awaiting agent pick-up.`);
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
    if (user.balance < val) return res.status(400).json({ error: 'Cannot debit more than customer balance.' });
    user.balance -= val;
  } else {
    user.balance += val;
  }

  DB.transactions.unshift({
    id: 'TXN-' + Math.floor(1000 + Math.random() * 9000),
    userId: user.id,
    orderId: null,
    type: 'BANK_ADJUSTMENT',
    description: `Branch Officer ${adjustmentType === 'DEBIT' ? 'Debit' : 'Credit'} Adjustment`,
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
// 3. DELIVERY AGENT APIS
// ============================================================================

app.post('/api/agent/send-reg-otp', (req, res) => {
  const { name, phone, vehicle, password } = req.body;
  if (!name || !phone || !password || !vehicle) return res.status(400).json({ error: 'Please enter all details.' });

  const cleanPhone = String(phone).trim();
  if (DB.agents.some(a => String(a.phone).trim() === cleanPhone)) {
    return res.status(400).json({ error: 'Mobile number already registered.' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  DB.tempAgentRegistrations[cleanPhone] = {
    name,
    phone: cleanPhone,
    vehicle: vehicle.trim(),
    password: String(password).trim(),
    otp
  };
  commitToDisk();

  sendUserScopedSMS(cleanPhone, `[BHARAT EXPRESS BANK] Agent Onboarding OTP: ${otp}.`);
  res.json({ success: true, message: `OTP sent to ${cleanPhone}`, demoOtp: otp });
});

app.post('/api/agent/verify-reg-otp', (req, res) => {
  const { phone, otp } = req.body;
  const pKey = String(phone || '').trim();
  const pending = DB.tempAgentRegistrations[pKey];

  if (!pending) return res.status(400).json({ error: 'No registration session found.' });
  if (pending.otp !== String(otp).trim()) return res.status(400).json({ error: 'Incorrect OTP entered.' });

  const newAgent = {
    id: 'AGT-' + Math.floor(10 + Math.random() * 90),
    username: pending.name.toLowerCase().replace(/\s+/g, '_'),
    name: pending.name,
    phone: pending.phone,
    vehicle: pending.vehicle,
    password: pending.password,
    status: 'AVAILABLE'
  };

  DB.agents.push(newAgent);
  delete DB.tempAgentRegistrations[pKey];
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, agent: newAgent });
});

app.post('/api/agent/login', (req, res) => {
  const { phone, password } = req.body;
  const agent = DB.agents.find(a => String(a.phone).trim() === String(phone).trim() && String(a.password).trim() === String(password).trim());
  if (!agent) return res.status(401).json({ error: 'Invalid Agent Credentials.' });
  res.json({ success: true, agent });
});

app.post('/api/agent/change-password', (req, res) => {
  const { agentId, oldPassword, newPassword } = req.body;
  const agent = DB.agents.find(a => String(a.id).trim() === String(agentId).trim());
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (String(agent.password).trim() !== String(oldPassword).trim()) return res.status(400).json({ error: 'Current password does not match.' });
  if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'Password must be at least 3 characters.' });

  agent.password = String(newPassword).trim();
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, message: 'Password updated successfully!' });
});

app.post('/api/agent/delete-account', (req, res) => {
  const { agentId, password } = req.body;
  const aid = String(agentId || '').trim();
  const pwd = String(password || '').trim();

  const index = DB.agents.findIndex(a => String(a.id).trim() === aid);
  if (index === -1) return res.status(404).json({ error: 'Delivery agent record not found.' });
  if (String(DB.agents[index].password).trim() !== pwd) return res.status(400).json({ error: 'Incorrect password!' });

  DB.agents.splice(index, 1);
  commitToDisk();
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, message: 'Delivery Agent account successfully deregistered from database.' });
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
  order.currentLocation = 'Vault Picked Up by Agent! En Route to Customer. 1-Hour Anti-Hijack Active.';

  const tx = DB.transactions.find(t => t.orderId === orderId);
  if (tx) tx.status = 'IN_TRANSIT (1-HR TIMER ACTIVE)';

  commitToDisk();
  sendUserScopedSMS(order.userPhone, `[CashBridge Dispatch] Agent ${agent.name} (Phone: ${agent.phone}, Vehicle: ${agent.vehicle}) has collected your Vault! 1-Hour delivery countdown started. Unlock OTP: ${order.otp}.`);
  broadcast('STATE_CHANGED', {});
  res.json({ success: true, expiryEpoch: order.expiryEpoch });
});

app.post('/api/vault/unlock', (req, res) => {
  const { orderId, enteredOtp } = req.body;
  const order = DB.orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.status === 'AUTO_FROZEN') {
    return res.status(403).json({ error: 'VAULT FROZEN: 1-Hour delivery window expired. Vault is locked down.' });
  }
  if (order.status === 'TAMPERED') {
    return res.status(403).json({ error: 'SECURITY BREACH: Vault is locked out due to tampering. Police notified!' });
  }

  if (!order.wrongOtpAttempts) order.wrongOtpAttempts = 0;

  if (String(order.otp).trim() === String(enteredOtp).trim()) {
    order.status = 'VAULT_OPENED';
    order.currentLocation = 'Vault Reached Doorstep & Unlocked by Customer! Ready for photo handover.';

    const tx = DB.transactions.find(t => t.orderId === orderId);
    if (tx) tx.status = 'VAULT_UNLOCKED (PENDING PHOTO CONFIRMATION)';

    commitToDisk();
    broadcast('STATE_CHANGED', {});
    return res.json({ success: true, message: 'Vault Unlocked! Please take handover photo proof.' });
  }

  order.wrongOtpAttempts += 1;
  commitToDisk();

  if (order.wrongOtpAttempts >= 3) {
    order.status = 'TAMPERED';
    order.otp = 'SELF_DESTRUCTED';
    order.currentLocation = '🚨 3 WRONG PIN ENTRIES! System Locked Down. Police Control Room Dispatched.';

    const tx = DB.transactions.find(t => t.orderId === orderId);
    if (tx) tx.status = 'FAILED (3 WRONG PINS LOCKDOWN)';

    commitToDisk();

    dispatchPoliceAndBankAlert(
      order.id, 
      'CRITICAL: 3 FAILED PIN ATTEMPTS', 
      `Unauthorized PIN entered 3 times on Vault #${order.vaultId}. Forced hijack protocol triggered.`, 
      order.lat, 
      order.lng
    );

    sendUserScopedSMS(order.userPhone, `[SECURITY ALERT] 3 incorrect OTP entries detected on Vault #${order.vaultId}. Vault locked down and Surat Police Control Room dispatched. Your money is 100% safe.`);

    return res.status(403).json({
      error: 'CRITICAL SECURITY BREACH: 3 Incorrect PIN entries! Vault permanently locked down and alert sent to Surat Police Control Room!'
    });
  }

  const remaining = 3 - order.wrongOtpAttempts;
  res.status(400).json({
    error: `Incorrect OTP entered! Security warning: ${remaining} attempt(s) remaining before Police Lockdown Siren.`
  });
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
  } else {
    DB.transactions.unshift({
      id: 'TXN-' + Math.floor(1000 + Math.random() * 9000),
      userId: order.userId,
      orderId: order.id,
      type: 'CASHBRIDGE_REQUEST',
      description: `Doorstep Cash Delivered (${order.id})`,
      amount: order.amount,
      txType: 'DEBIT',
      timestamp: timeNow,
      isoTime: isoTime,
      status: 'SUCCESS (DEBITED ON SAFE HANDOVER)'
    });
  }

  commitToDisk();
  sendUserScopedSMS(order.userPhone, `[BHARAT EXPRESS BANK] Cash of ₹${order.amount.toLocaleString()} successfully handed over by ${order.agentName}. ₹${order.amount.toLocaleString()} has been DEBITED from Acc ${user.accNumber}. Available Balance: ₹${user.balance.toLocaleString()}.`);

  broadcast('STATE_CHANGED', {});
  res.json({ success: true, newBalance: user.balance });
});

app.post('/api/vault/tamper', (req, res) => {
  const { orderId } = req.body;
  const order = DB.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'TAMPERED';
    order.currentLocation = '🚨 TAMPER BREACH DETECTED! Route Diversion / Physical Attack Alert!';
    const tx = DB.transactions.find(t => t.orderId === orderId);
    if (tx) tx.status = 'FAILED (TAMPERED - FUNDS SAFE)';
    commitToDisk();
  }

  dispatchPoliceAndBankAlert(
    order ? order.id : 'V-101', 
    'PHYSICAL ATTACK / SENSOR TAMPER', 
    'Physical tampering or unauthorized chassis breach detected! Cash ink neutralized. Alert sent to Surat Police!', 
    order ? order.lat : 21.1702, 
    order ? order.lng : 72.8311
  );

  res.json({ success: true });
});

app.get('/api/state', (req, res) => res.json(DB));

// DYNAMIC PORT CONFIGURATION FOR CLOUD HOSTING
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BHARAT EXPRESS BANK live at port ${PORT}`);
  console.log(`📡 Ready for Render / Mobile / Desktop Deployment`);
});