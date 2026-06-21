// src/ui/auth.js — Login / Register screen
import { authLogin, authRegister } from '../api/client.js';

const BASE      = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const TOKEN_KEY = 'sb_token';
const USER_KEY  = 'sb_user';

export function getToken()        { return localStorage.getItem(TOKEN_KEY); }
export function getUser()         { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; }
function saveSession(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
export function clearSession()    { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

// ── verify stored token is still valid ───────────────────────────────
// Only clears the session on an explicit 401 (invalid/expired token).
// Network errors and server errors (Render cold-start) keep the stored session alive.
export async function checkSession() {
  const token = getToken();
  if (!token) return false;
  try {
    const r = await fetch(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) { clearSession(); return false; }
    if (!r.ok) { return !!getUser(); }          // server error — keep session
    const user = await r.json();
    saveSession(token, user);
    return true;
  } catch {
    // Network error (service sleeping / no internet) — keep stored session
    return !!getUser();
  }
}

// ── inject auth screen over everything ───────────────────────────────
export function showAuthScreen(onSuccess) {
  document.body.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:10000;
    background:linear-gradient(135deg,#07090f 0%,#0d1526 60%,#091a1a 100%);
    display:flex;align-items:center;justify-content:center;
    font-family:'Syne',sans-serif;`;

  overlay.innerHTML = `
    <div style="width:100%;max-width:440px;padding:0 20px;">
      <!-- Logo -->
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:28px;font-weight:800;color:#e8f0fe;letter-spacing:-0.5px;">
          SmartBin <span style="color:#00e5ff;">/ MDVRP</span>
        </div>
        <div style="color:#637496;font-size:13px;margin-top:6px;">Municipal Intelligence Platform</div>
      </div>

      <!-- Card -->
      <div id="auth-card" style="background:#111720;border:1px solid #1e2d42;border-radius:14px;padding:32px;">

        <!-- Tabs -->
        <div style="display:flex;gap:0;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;margin-bottom:28px;">
          <button id="tab-login" onclick="sbAuthTab('login')"
            style="flex:1;padding:10px;border:none;background:#00e5ff;color:#07090f;font-family:Syne;font-weight:700;cursor:pointer;font-size:13px;">
            Sign In
          </button>
          <button id="tab-register" onclick="sbAuthTab('register')"
            style="flex:1;padding:10px;border:none;background:transparent;color:#637496;font-family:Syne;font-weight:700;cursor:pointer;font-size:13px;">
            Register
          </button>
        </div>

        <!-- LOGIN FORM -->
        <form id="form-login" onsubmit="sbDoLogin(event)">
          <div style="margin-bottom:16px;">
            <label style="display:block;color:#637496;font-size:11px;letter-spacing:.08em;margin-bottom:6px;">EMAIL</label>
            <input id="li-email" type="email" required placeholder="you@municipality.gov"
              style="width:100%;padding:10px 14px;background:#0a0e14;border:1px solid #1e2d42;border-radius:7px;color:#e8f0fe;font-family:Syne;font-size:14px;outline:none;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:22px;">
            <label style="display:block;color:#637496;font-size:11px;letter-spacing:.08em;margin-bottom:6px;">PASSWORD</label>
            <input id="li-pass" type="password" required placeholder="••••••••"
              style="width:100%;padding:10px 14px;background:#0a0e14;border:1px solid #1e2d42;border-radius:7px;color:#e8f0fe;font-family:Syne;font-size:14px;outline:none;box-sizing:border-box;">
          </div>
          <div id="li-err" style="color:#ff1744;font-size:12px;margin-bottom:12px;display:none;"></div>
          <button type="submit"
            style="width:100%;padding:12px;background:#00e5ff;color:#07090f;border:none;border-radius:7px;font-family:Syne;font-weight:700;font-size:15px;cursor:pointer;">
            Sign In
          </button>
        </form>

        <!-- REGISTER FORM -->
        <form id="form-register" onsubmit="sbDoRegister(event)" style="display:none;">
          <div style="margin-bottom:14px;">
            <label style="display:block;color:#637496;font-size:11px;letter-spacing:.08em;margin-bottom:6px;">FULL NAME</label>
            <input id="re-name" type="text" required placeholder="Your name"
              style="width:100%;padding:10px 14px;background:#0a0e14;border:1px solid #1e2d42;border-radius:7px;color:#e8f0fe;font-family:Syne;font-size:14px;outline:none;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block;color:#637496;font-size:11px;letter-spacing:.08em;margin-bottom:6px;">EMAIL</label>
            <input id="re-email" type="email" required placeholder="you@municipality.gov"
              style="width:100%;padding:10px 14px;background:#0a0e14;border:1px solid #1e2d42;border-radius:7px;color:#e8f0fe;font-family:Syne;font-size:14px;outline:none;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block;color:#637496;font-size:11px;letter-spacing:.08em;margin-bottom:6px;">PASSWORD</label>
            <input id="re-pass" type="password" required placeholder="••••••••" minlength="6"
              style="width:100%;padding:10px 14px;background:#0a0e14;border:1px solid #1e2d42;border-radius:7px;color:#e8f0fe;font-family:Syne;font-size:14px;outline:none;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:14px;">
            <label style="display:block;color:#637496;font-size:11px;letter-spacing:.08em;margin-bottom:6px;">MUNICIPALITY / REGION</label>
            <input id="re-region" type="text" placeholder="e.g. Bangalore Municipal Corporation"
              style="width:100%;padding:10px 14px;background:#0a0e14;border:1px solid #1e2d42;border-radius:7px;color:#e8f0fe;font-family:Syne;font-size:14px;outline:none;box-sizing:border-box;">
          </div>
          <div id="re-err" style="color:#ff1744;font-size:12px;margin-bottom:12px;display:none;"></div>
          <button type="submit"
            style="width:100%;padding:12px;background:#00e676;color:#07090f;border:none;border-radius:7px;font-family:Syne;font-weight:700;font-size:15px;cursor:pointer;">
            Create Account
          </button>
        </form>
      </div>

      <div style="text-align:center;color:#2a3d5c;font-size:11px;margin-top:18px;">
        SmartBin MDVRP · Municipal Waste Intelligence
      </div>
    </div>`;

  document.body.appendChild(overlay);

  window.sbAuthTab = (tab) => {
    const isLogin = tab === 'login';
    document.getElementById('form-login').style.display    = isLogin ? '' : 'none';
    document.getElementById('form-register').style.display = isLogin ? 'none' : '';
    document.getElementById('tab-login').style.background    = isLogin ? '#00e5ff' : 'transparent';
    document.getElementById('tab-login').style.color         = isLogin ? '#07090f' : '#637496';
    document.getElementById('tab-register').style.background = isLogin ? 'transparent' : '#00e5ff';
    document.getElementById('tab-register').style.color      = isLogin ? '#637496' : '#07090f';
  };

  window.sbDoLogin = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const err = document.getElementById('li-err');
    btn.disabled = true; btn.textContent = 'Signing in…'; err.style.display = 'none';
    try {
      const { access_token, user } = await authLogin(
        document.getElementById('li-email').value,
        document.getElementById('li-pass').value,
      );
      saveSession(access_token, user);
      overlay.remove();
      document.body.style.overflow = '';
      onSuccess(user);
    } catch (ex) {
      err.textContent = ex.message; err.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  };

  window.sbDoRegister = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const err = document.getElementById('re-err');
    btn.disabled = true; btn.textContent = 'Creating…'; err.style.display = 'none';
    try {
      const { access_token, user } = await authRegister({
        name:     document.getElementById('re-name').value,
        email:    document.getElementById('re-email').value,
        password: document.getElementById('re-pass').value,
        role:     'municipality',
        region:   document.getElementById('re-region').value,
      });
      saveSession(access_token, user);
      overlay.remove();
      document.body.style.overflow = '';
      onSuccess(user);
    } catch (ex) {
      err.textContent = ex.message; err.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  };
}
