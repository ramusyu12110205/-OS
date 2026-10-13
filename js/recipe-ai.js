import { supabase } from './supabase.js?v=20261013-1';

const AI_PURPOSES = ['時短', '節約', '子ども向け', '野菜多め', 'ボリューム', '洗い物少なめ'];
const AI_STYLES = ['定番', 'アレンジ', 'お店っぽい', 'あっさり', 'ガッツリ'];
const AI_TIMES = ['指定なし', '15分以内', '30分以内', '45分以内'];
const AI_SERVINGS = ['大人1人前', '大人2人前', '大人3人前', '大人4人前'];

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function addStyles() {
  if (document.getElementById('recipeAiStyles')) return;
  const style = document.createElement('style');
  style.id = 'recipeAiStyles';
  style.textContent = `
    .recipe-ai-box{border:1px solid #ddd;border-radius:9px;background:#fafafa;padding:16px;margin-bottom:22px}
    .recipe-ai-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .recipe-ai-head h3{margin:0;font-size:16px}
    .recipe-ai-sub{font-size:12px;color:#666;margin:3px 0 0}
    .recipe-ai-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}
    .recipe-ai-grid label{display:grid;gap:5px;font-size:13px;color:#555}
    .recipe-ai-grid .ai-full{grid-column:1/-1}
    .recipe-ai-grid input,.recipe-ai-grid select,.recipe-ai-grid textarea{font:inherit;border:1px solid #ccc;border-radius:7px;background:#fff;padding:9px 10px}
    .ai-chip-row{display:flex;flex-wrap:wrap;gap:7px}
    .ai-chip{border:1px solid #ccc;border-radius:999px;background:#fff;padding:6px 10px;cursor:pointer;font:inherit;font-size:13px}
    .ai-chip.selected{background:#222;color:#fff;border-color:#222}
    .recipe-ai-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
    .recipe-ai-status{font-size:13px;color:#666;margin-top:8px;min-height:20px}
    .recipe-estimated-field{display:grid;gap:5px;margin:0 0 14px;font-size:13px;color:#555}
    .recipe-estimated-field input{max-width:180px;font:inherit;border:1px solid #ccc;border-radius:7px;background:#fff;padding:9px 10px}
    .recipe-estimated-help{font-size:11px;color:#777}
    .detail-estimated-minutes{margin-top:8px;font-size:14px;font-weight:600}
    @media(max-width:800px){.recipe-ai-grid{grid-template-columns:1fr}.recipe-ai-grid .ai-full{grid-column:auto}.recipe-ai-head{align-items:flex-start;flex-direction:column}.recipe-ai-actions{justify-content:stretch}.recipe-ai-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function chipButtons(values, className) {
  return values.map(v => `<button type="button" class="ai-chip ${className}" data-value="${esc(v)}">${esc(v)}</button>`).join('');
}

function buildPanel() {
  if ($('recipeAiBox')) return;
  const form = $('recipeForm');
  if (!form) return;
  const box = document.createElement('section');
  box.id = 'recipeAiBox';
  box.className = 'recipe-ai-box';
  box.innerHTML = `
    <div class="recipe-ai-head">
      <div><h3>🤖 AIでレシピを作る</h3><p class="recipe-ai-sub">条件を入れて生成すると、下の登録フォームに内容が入ります。保存は通常の「保存」ボタンから行います。</p></div>
    </div>
    <div class="recipe-ai-grid">
      <label class="ai-full">食材
        <input id="aiIngredients" type="text" placeholder="例：豚こま、玉ねぎ、卵、キャベツ">
      </label>
      <label>料理カテゴリ
        <select id="aiCategory"><option value="">指定なし</option>${['主菜','副菜','汁物','主食','デザート','その他'].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
      </label>
      <label>人数
        <select id="aiServings">${AI_SERVINGS.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
      </label>
      <label>調理時間
        <select id="aiTime">${AI_TIMES.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
      </label>
      <label class="ai-full">目的・方向性
        <div class="ai-chip-row" id="aiPurpose">${chipButtons(AI_PURPOSES,'ai-purpose-chip')}</div>
      </label>
      <label class="ai-full">料理の方向性
        <div class="ai-chip-row" id="aiStyle">${chipButtons(AI_STYLES,'ai-style-chip')}</div>
      </label>
      <label class="ai-full">追加指示
        <textarea id="aiInstruction" rows="2" placeholder="例：子どもが食べやすい味付けにして、できればフライパン1つで"></textarea>
      </label>
    </div>
    <div class="recipe-ai-actions"><button type="button" id="generateRecipeAi" class="primary-button">AIでレシピ生成</button></div>
    <div id="recipeAiStatus" class="recipe-ai-status"></div>`;
  form.prepend(box);

  document.querySelectorAll('.ai-purpose-chip').forEach(b => b.onclick = () => b.classList.toggle('selected'));
  document.querySelectorAll('.ai-style-chip').forEach(b => b.onclick = () => {
    document.querySelectorAll('.ai-style-chip').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
  });
  $('generateRecipeAi').onclick = generate;
}

function ensureEstimatedField() {
  if ($('estimatedMinutes')) return;
  const form = $('recipeForm');
  const box = $('recipeAiBox');
  if (!form || !box) return;
  const label = document.createElement('label');
  label.className = 'recipe-estimated-field';
  label.innerHTML = `目安所要時間
    <span><input id="estimatedMinutes" name="estimated_minutes" type="number" min="1" max="240" step="1" placeholder="例：30"> 分</span>
    <span class="recipe-estimated-help">下ごしらえから完成までの目安。AI生成時は自動入力されます。</span>`;
  box.after(label);
}

function selectedValues(selector) {
  return [...document.querySelectorAll(`${selector}.selected`)].map(x => x.dataset.value);
}

async function loadAvailableTags() {
  try {
    const { data } = await supabase.from('tags').select('name').order('name');
    return (data || []).map(x => x.name);
  } catch (_) {
    return [];
  }
}

function setIngredientRows(items) {
  const api = window.gohanOSRecipeIngredients;
  if (api?.reset) {
    api.reset(Array.isArray(items) ? items : []);
    return;
  }
  const food = $('foodIngredientRows');
  const seasonings = $('seasoningIngredientRows');
  if (!food || !seasonings) return;
  food.innerHTML = '';
  seasonings.innerHTML = '';
  (Array.isArray(items) ? items : []).forEach(item => {
    const type = item.ingredient_type === 'seasoning' ? 'seasoning' : 'food';
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.dataset.ingredientType = type;
    row.innerHTML = `<input class="ingredient-name" placeholder="材料名" value="${esc(item.ingredient_name)}"><select class="ingredient-type" aria-label="分類"><option value="food">食材</option><option value="seasoning">調味料</option></select><input class="ingredient-amount" placeholder="分量" value="${esc(item.amount)}"><input class="ingredient-unit" placeholder="単位" value="${esc(item.unit)}"><input class="ingredient-note" placeholder="メモ（下味など）" value="${esc(item.note)}"><button type="button" class="remove-button">削除</button>`;
    const selector = row.querySelector('.ingredient-type');
    selector.value = type;
    selector.onchange = () => {
      row.dataset.ingredientType = selector.value;
      (selector.value === 'seasoning' ? seasonings : food).appendChild(row);
    };
    row.querySelector('.remove-button').onclick = () => row.remove();
    (type === 'seasoning' ? seasonings : food).appendChild(row);
  });
  if (!food.children.length && !seasonings.children.length && api?.add) api.add({});
}

function setInstructions(items) {
  const container = $('instructionRows');
  if (!container) return;
  container.innerHTML = '';
  items.forEach((text, i) => {
    const row = document.createElement('div');
    row.className = 'instruction-row';
    row.innerHTML = `<span class="instruction-number">${i + 1}</span><textarea rows="2" placeholder="作り方を入力">${esc(text)}</textarea><button type="button" class="remove-button">削除</button>`;
    row.querySelector('.remove-button').onclick = () => { row.remove(); renumberInstructions(); };
    container.appendChild(row);
  });
}

function renumberInstructions() {
  [...document.querySelectorAll('#instructionRows .instruction-row')].forEach((r, i) => {
    const n = r.querySelector('.instruction-number');
    if (n) n.textContent = i + 1;
  });
}

function applyTags(names) {
  const choices = [...document.querySelectorAll('.tag-choice')];
  const normalized = new Set((names || []).map(x => String(x).trim()));
  choices.forEach(b => b.classList.toggle('selected', normalized.has(b.textContent.trim())));
}

async function generate() {
  const button = $('generateRecipeAi');
  const status = $('recipeAiStatus');
  button.disabled = true;
  status.textContent = 'AIがレシピを考えています…';
  try {
    const { data, error } = await supabase.functions.invoke('recipe-ai-generate', {
      body: {
        conditions: {
          ingredients: $('aiIngredients').value.trim(),
          category: $('aiCategory').value,
          purpose: selectedValues('.ai-purpose-chip'),
          servings: $('aiServings').value,
          time: $('aiTime').value,
          style: selectedValues('.ai-style-chip')[0] || '家庭料理寄り',
          instruction: $('aiInstruction').value.trim(),
          availableTags: await loadAvailableTags()
        }
      }
    });
    if (error) throw error;
    if (!data?.recipe) throw new Error('AIからレシピを取得できませんでした。');

    const r = data.recipe;
    $('recipeForm').elements.name.value = r.name || '';
    $('recipeForm').elements.description.value = r.description || '';
    $('formCategory').value = r.category || '';
    $('formGenre').value = r.genre || '';
    $('recipeForm').elements.memo.value = r.memo || '';
    if ($('estimatedMinutes')) $('estimatedMinutes').value = Number.isFinite(Number(r.estimated_minutes)) ? r.estimated_minutes : '';
    setIngredientRows(Array.isArray(r.ingredients) ? r.ingredients : []);
    setInstructions(Array.isArray(r.instructions) ? r.instructions : []);
    applyTags(r.tags);
    status.textContent = '生成しました。内容を確認・修正してから「保存」してください。';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    status.textContent = `生成できませんでした: ${e?.message || e}`;
  } finally {
    button.disabled = false;
  }
}

async function findLatestRecipeByName(name) {
  const { data, error } = await supabase.from('recipes').select('id,name,updated_at,estimated_minutes').eq('name', name).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadEstimatedForEdit() {
  const form = $('recipeForm');
  const title = $('formTitle');
  if (!form || !title || title.textContent !== 'レシピ編集') return;
  const name = form.elements.name?.value?.trim();
  if (!name) return;
  try {
    const r = await findLatestRecipeByName(name);
    if (r && $('estimatedMinutes')) $('estimatedMinutes').value = r.estimated_minutes ?? '';
  } catch (e) {
    console.warn('estimated_minutes load failed', e);
  }
}

function installSaveHook() {
  const form = $('recipeForm');
  if (!form || typeof form.onsubmit !== 'function' || form.dataset.durationHooked === '1') return false;
  const original = form.onsubmit;
  form.onsubmit = async e => {
    const name = form.elements.name?.value?.trim() || '';
    const minutes = Number(form.elements.estimated_minutes?.value || '');
    let before = null;
    if (name) {
      try { before = await findLatestRecipeByName(name); } catch (_) {}
    }
    await original.call(form, e);
    if (!name || !Number.isFinite(minutes) || minutes < 1) return;
    try {
      const after = await findLatestRecipeByName(name);
      if (!after) return;
      if (before && before.id === after.id && before.updated_at === after.updated_at) return;
      const { error } = await supabase.from('recipes').update({ estimated_minutes: Math.round(minutes) }).eq('id', after.id);
      if (error) throw error;
      showEstimatedInDetail(name, Math.round(minutes));
    } catch (err) {
      console.warn('estimated_minutes save failed', err);
    }
  };
  form.dataset.durationHooked = '1';
  return true;
}

function showEstimatedInDetail(name, minutes) {
  const detail = $('recipeDetail');
  const header = detail?.querySelector('.detail-header');
  const heading = header?.querySelector('h2');
  if (!header || !heading || heading.textContent.trim() !== name) return;
  let el = header.querySelector('.detail-estimated-minutes');
  if (!el) {
    el = document.createElement('div');
    el.className = 'detail-estimated-minutes';
    header.appendChild(el);
  }
  el.textContent = `目安：約${minutes}分`;
}

async function syncDetailEstimated() {
  const detail = $('recipeDetail');
  const heading = detail?.querySelector('.detail-header h2');
  if (!heading || heading.dataset.estimatedSynced === heading.textContent.trim()) return;
  const name = heading.textContent.trim();
  heading.dataset.estimatedSynced = name;
  try {
    const r = await findLatestRecipeByName(name);
    if (r?.estimated_minutes) showEstimatedInDetail(name, r.estimated_minutes);
  } catch (e) {
    console.warn('estimated_minutes detail load failed', e);
  }
}

function installObservers() {
  const formView = $('formView');
  const detail = $('recipeDetail');
  if (formView) {
    const observer = new MutationObserver(() => {
      if (!formView.classList.contains('hidden')) {
        ensureEstimatedField();
        if ($('formTitle')?.textContent === 'レシピ編集') loadEstimatedForEdit();
      }
    });
    observer.observe(formView, { attributes: true, attributeFilter: ['class'] });
  }
  if (detail) {
    const observer = new MutationObserver(() => syncDetailEstimated());
    observer.observe(detail, { childList: true, subtree: true });
  }
  const editButton = $('editRecipe');
  if (editButton) editButton.addEventListener('click', () => setTimeout(loadEstimatedForEdit, 100));
}

function init() {
  addStyles();
  buildPanel();
  ensureEstimatedField();
  const hookTimer = setInterval(() => { if (installSaveHook()) clearInterval(hookTimer); }, 50);
  setTimeout(() => clearInterval(hookTimer), 10000);
  installObservers();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
