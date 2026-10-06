import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://txprypfzdsfaupguhybl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qiCaP0cBNhms5-usSDzKlQ_nywzlU36';
const PIN_UNLOCK_KEY = 'gohan_os_pin_unlocked';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

let authUiReady = false;
let authGatePromise = null;

export async function ensureAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let session = data?.session;
  if (!session) {
    const { data: signed, error: signError } = await supabase.auth.signInAnonymously();
    if (signError) throw signError;
    if (!signed?.session) throw new Error('認証セッションを作成できませんでした。');
    session = signed.session;
  }

  setupAuthUI(session.user);
  await requirePinUnlock();
  return session;
}

function setupAuthUI(user) {
  if (authUiReady) {
    updateAuthButton();
    return;
  }
  authUiReady = true;

  const style = document.createElement('style');
  style.textContent = `
    .account-button{min-width:76px}
    .pin-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}
    .pin-modal-backdrop.hidden{display:none}
    .pin-modal{width:min(380px,100%);background:#fff;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.24);text-align:center}
    .pin-modal h2{margin:0 0 10px}
    .pin-modal p{line-height:1.6;color:#555}
    .pin-form{display:grid;gap:12px;margin-top:18px}
    .pin-input{font-size:28px;letter-spacing:.45em;text-align:center;padding:12px}
    .pin-error{color:#b42318;min-height:24px;margin-top:10px}
    .pin-note{font-size:.88rem;color:#777}
  `;
  document.head.appendChild(style);

  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    const button = document.createElement('button');
    button.id = 'accountButton';
    button.type = 'button';
    button.className = 'secondary-button account-button';
    button.addEventListener('click', lockGohanOS);
    headerActions.prepend(button);
  }

  const backdrop = document.createElement('div');
  backdrop.id = 'pinModalBackdrop';
  backdrop.className = 'pin-modal-backdrop hidden';
  backdrop.innerHTML = `
    <div class="pin-modal" role="dialog" aria-modal="true" aria-labelledby="pinModalTitle">
      <h2 id="pinModalTitle">ごはんOS</h2>
      <div id="pinModalBody"></div>
    </div>`;
  document.body.appendChild(backdrop);
  updateAuthButton();
}

function updateAuthButton() {
  const button = document.getElementById('accountButton');
  if (!button) return;
  button.textContent = localStorage.getItem(PIN_UNLOCK_KEY) === '1' ? '🔒 ロック' : '共有';
  button.title = localStorage.getItem(PIN_UNLOCK_KEY) === '1' ? 'PIN画面に戻る' : '家族共有';
}

async function requirePinUnlock() {
  if (localStorage.getItem(PIN_UNLOCK_KEY) === '1') return;
  if (authGatePromise) return authGatePromise;

  authGatePromise = (async () => {
    const { data, error } = await supabase.rpc('gohan_pin_configured');
    if (error) throw error;
    if (data) {
      await showPinModal('unlock');
    } else {
      await showPinModal('setup');
    }
  })();

  try {
    await authGatePromise;
  } finally {
    authGatePromise = null;
  }
}

function showPinModal(mode) {
  return new Promise(resolve => {
    const backdrop = document.getElementById('pinModalBackdrop');
    const body = document.getElementById('pinModalBody');
    if (!backdrop || !body) {
      resolve();
      return;
    }

    const isSetup = mode === 'setup';
    body.innerHTML = `
      <p>${isSetup ? '家族で使う4桁のPINを設定してください。' : '家族共有の4桁PINを入力してください。'}</p>
      ${isSetup ? '<p class="pin-note">この端末で設定したPINを、妻の端末・あなたのスマホ・PCでも使います。</p>' : ''}
      <form id="pinForm" class="pin-form">
        <input id="gohanPin" class="pin-input" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-label="4桁PIN" required>
        ${isSetup ? '<input id="gohanPinConfirm" class="pin-input" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-label="PIN確認" placeholder="もう一度入力" required>' : ''}
        <button type="submit" class="primary-button">${isSetup ? 'PINを設定して開始' : 'ロック解除'}</button>
      </form>
      <div id="pinError" class="pin-error"></div>`;

    backdrop.classList.remove('hidden');
    const form = document.getElementById('pinForm');
    const input = document.getElementById('gohanPin');
    input.focus();

    form.onsubmit = async event => {
      event.preventDefault();
      const pin = input.value;
      const errorEl = document.getElementById('pinError');
      errorEl.textContent = '';
      if (!/^\d{4}$/.test(pin)) {
        errorEl.textContent = '4桁の数字を入力してください。';
        return;
      }
      if (isSetup) {
        const confirmPin = document.getElementById('gohanPinConfirm').value;
        if (pin !== confirmPin) {
          errorEl.textContent = 'PINが一致していません。';
          return;
        }
        const { data, error } = await supabase.rpc('set_gohan_pin', { p_pin: pin });
        if (error) {
          errorEl.textContent = `PINを設定できませんでした: ${error.message}`;
          return;
        }
        if (!data) {
          errorEl.textContent = 'PINはすでに設定されています。画面を再読み込みしてください。';
          return;
        }
      } else {
        const { data, error } = await supabase.rpc('verify_gohan_pin', { p_pin: pin });
        if (error) {
          errorEl.textContent = `PINを確認できませんでした: ${error.message}`;
          return;
        }
        if (!data) {
          errorEl.textContent = 'PINが違います。';
          input.select();
          return;
        }
      }

      localStorage.setItem(PIN_UNLOCK_KEY, '1');
      backdrop.classList.add('hidden');
      updateAuthButton();
      resolve();
    };
  });
}

function lockGohanOS() {
  localStorage.removeItem(PIN_UNLOCK_KEY);
  updateAuthButton();
  showPinModal('unlock');
}
