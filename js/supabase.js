import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://txprypfzdsfaupguhybl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qiCaP0cBNhms5-usSDzKlQ_nywzlU36';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let authUiReady = false;

export async function ensureAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data?.session) {
    setupAuthUI(data.session.user);
    return data.session;
  }
  const { data: signed, error: signError } = await supabase.auth.signInAnonymously();
  if (signError) throw signError;
  if (!signed?.session) throw new Error('認証セッションを作成できませんでした。');
  setupAuthUI(signed.session.user);
  return signed.session;
}

function setupAuthUI(user) {
  if (authUiReady) {
    updateAuthButton(user);
    return;
  }
  authUiReady = true;

  const style = document.createElement('style');
  style.textContent = `
    .account-button{min-width:92px}
    .auth-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}
    .auth-modal-backdrop.hidden{display:none}
    .auth-modal{width:min(460px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.22)}
    .auth-modal h2{margin:0 0 8px}
    .auth-modal p{line-height:1.6}
    .auth-form{display:grid;gap:12px;margin-top:16px}
    .auth-form label{display:grid;gap:6px;font-weight:600}
    .auth-form input{width:100%;box-sizing:border-box}
    .auth-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
    .auth-note{font-size:.9rem;color:#666}
    .auth-status{padding:12px;border-radius:10px;background:#f5f5f5;margin-top:12px;line-height:1.6}
    .auth-error{color:#b42318;margin-top:10px;white-space:pre-wrap}
    .auth-divider{border:0;border-top:1px solid #ddd;margin:20px 0}
  `;
  document.head.appendChild(style);

  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    const button = document.createElement('button');
    button.id = 'accountButton';
    button.type = 'button';
    button.className = 'secondary-button account-button';
    button.addEventListener('click', openAuthModal);
    headerActions.prepend(button);
  }

  const backdrop = document.createElement('div');
  backdrop.id = 'authModalBackdrop';
  backdrop.className = 'auth-modal-backdrop hidden';
  backdrop.innerHTML = `
    <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
      <h2 id="authModalTitle">家族共有</h2>
      <div id="authModalBody"></div>
      <div class="auth-actions">
        <button id="authClose" type="button" class="secondary-button">閉じる</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  document.getElementById('authClose').onclick = closeAuthModal;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeAuthModal(); });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) updateAuthButton(session.user);
  });

  updateAuthButton(user);
}

function updateAuthButton(user) {
  const button = document.getElementById('accountButton');
  if (!button) return;
  button.textContent = user?.is_anonymous ? '家族共有' : '共有中';
  button.title = user?.is_anonymous ? '家族でデータを共有する設定' : '家族共有アカウント';
}

function closeAuthModal() {
  document.getElementById('authModalBackdrop')?.classList.add('hidden');
}

async function openAuthModal() {
  const backdrop = document.getElementById('authModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('hidden');
  const { data } = await supabase.auth.getSession();
  renderAuthModal(data?.session?.user || null);
}

function renderAuthModal(user, message = '', error = '') {
  const body = document.getElementById('authModalBody');
  if (!body) return;

  if (user?.is_anonymous) {
    body.innerHTML = `
      <p>この端末にあるレシピ・買い物・食材を、妻の端末やPCからも見られるようにします。</p>
      <div class="auth-status"><strong>今のデータはそのまま引き継がれます。</strong><br>メールアドレスを登録して、家族共通のログイン情報を作ります。</div>
      <form id="linkEmailForm" class="auth-form">
        <label>共有用メールアドレス<input id="linkEmail" type="email" autocomplete="email" required placeholder="example@example.com"></label>
        <button type="submit" class="primary-button">確認メールを送る</button>
      </form>
      <p class="auth-note">※ Supabase側で「手動リンク」が有効になっている必要があります。</p>
      <hr class="auth-divider">
      <p><strong>すでに共有アカウントを作っている場合</strong></p>
      <form id="signInForm" class="auth-form">
        <label>メールアドレス<input id="signInEmail" type="email" autocomplete="email" required></label>
        <label>パスワード<input id="signInPassword" type="password" autocomplete="current-password" required></label>
        <button type="submit" class="secondary-button">ログインして共有データを表示</button>
      </form>
      <div id="authMessage" class="auth-note">${escapeHtml(message)}</div>
      <div id="authError" class="auth-error">${escapeHtml(error)}</div>`;
    document.getElementById('linkEmailForm').onsubmit = sendLinkEmail;
    document.getElementById('signInForm').onsubmit = signIn;
    return;
  }

  if (user) {
    const confirmed = !!user.email_confirmed_at;
    body.innerHTML = `
      <p>この端末は<strong>家族共有アカウント</strong>に接続されています。</p>
      <div class="auth-status">${escapeHtml(user.email || '')}<br>${confirmed ? 'メール確認済み' : 'メール確認待ち'}</div>
      ${!confirmed ? `<p class="auth-note">確認メールのリンクを開いたあと、ページを再読み込みしてください。</p>` : `
        <form id="passwordForm" class="auth-form">
          <label>共有ログイン用パスワード<input id="sharedPassword" type="password" minlength="6" autocomplete="new-password" required></label>
          <label>パスワード（確認）<input id="sharedPasswordConfirm" type="password" minlength="6" autocomplete="new-password" required></label>
          <button type="submit" class="primary-button">パスワードを設定</button>
        </form>`}
      <hr class="auth-divider">
      <p class="auth-note">同じメールアドレスとパスワードで、妻の端末・あなたのスマホ・PCからログインできます。</p>
      <div id="authMessage" class="auth-note">${escapeHtml(message)}</div>
      <div id="authError" class="auth-error">${escapeHtml(error)}</div>`;
    if (confirmed) document.getElementById('passwordForm').onsubmit = setPassword;
    return;
  }

  body.innerHTML = `
    <p>家族共有アカウントにログインしてください。</p>
    <form id="signInForm" class="auth-form">
      <label>メールアドレス<input id="signInEmail" type="email" autocomplete="email" required></label>
      <label>パスワード<input id="signInPassword" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="primary-button">ログイン</button>
    </form>
    <div id="authError" class="auth-error">${escapeHtml(error)}</div>`;
  document.getElementById('signInForm').onsubmit = signIn;
}

async function sendLinkEmail(event) {
  event.preventDefault();
  const email = document.getElementById('linkEmail').value.trim();
  const { error } = await supabase.auth.updateUser({
    email,
    options: { emailRedirectTo: window.location.href.split('#')[0] }
  });
  if (error) {
    renderAuthModal((await supabase.auth.getSession()).data?.session?.user, '', `登録できませんでした: ${error.message}`);
    return;
  }
  localStorage.setItem('gohan_pending_shared_email', email);
  renderAuthModal((await supabase.auth.getSession()).data?.session?.user, `確認メールを ${email} に送りました。メール内の確認リンクを開いてください。`, '');
}

async function setPassword(event) {
  event.preventDefault();
  const password = document.getElementById('sharedPassword').value;
  const confirmPassword = document.getElementById('sharedPasswordConfirm').value;
  if (password.length < 6) {
    renderAuthModal((await supabase.auth.getSession()).data?.session?.user, '', 'パスワードは6文字以上にしてください。');
    return;
  }
  if (password !== confirmPassword) {
    renderAuthModal((await supabase.auth.getSession()).data?.session?.user, '', 'パスワードが一致していません。');
    return;
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    renderAuthModal((await supabase.auth.getSession()).data?.session?.user, '', `パスワードを設定できませんでした: ${error.message}`);
    return;
  }
  localStorage.removeItem('gohan_pending_shared_email');
  renderAuthModal((await supabase.auth.getSession()).data?.session?.user, '家族共有の設定が完了しました。この端末のデータはそのまま共有されます。', '');
}

async function signIn(event) {
  event.preventDefault();
  const email = document.getElementById('signInEmail').value.trim();
  const password = document.getElementById('signInPassword').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    renderAuthModal((await supabase.auth.getSession()).data?.session?.user, '', `ログインできませんでした: ${error.message}`);
    return;
  }
  if (!data?.session) {
    renderAuthModal(null, '', 'ログインセッションを作成できませんでした。');
    return;
  }
  closeAuthModal();
  window.location.reload();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
