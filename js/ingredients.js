import { supabase, ensureAuth } from './supabase.js';

const INGREDIENT_CATEGORIES = ['肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','その他'];
const $ = id => document.getElementById(id);
const state = { items: [], loaded: false };

function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showLoading(v) { $('loading').classList.toggle('hidden', !v); }
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  setTimeout(() => $('toast').classList.add('hidden'), 2200);
}
function showIngredientView() {
  document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
  $('ingredientsView').classList.remove('hidden');
  window.scrollTo({top:0, behavior:'auto'});
}
function hideIngredientView() {
  $('ingredientsView').classList.add('hidden');
}

function setup() {
  const category = $('ingredientCategoryFilter');
  category.innerHTML = '<option value="">カテゴリすべて</option>' + INGREDIENT_CATEGORIES.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  $('ingredientInputCategory').innerHTML = INGREDIENT_CATEGORIES.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');

  $('ingredientsButton').addEventListener('click', async () => {
    showIngredientView();
    await loadIngredients();
  });
  $('backFromIngredients').addEventListener('click', () => {
    hideIngredientView();
    $('listView').classList.remove('hidden');
    window.scrollTo({top:0, behavior:'auto'});
  });
  $('ingredientForm').addEventListener('submit', addIngredient);
  $('ingredientSearch').addEventListener('input', renderIngredients);
  $('ingredientCategoryFilter').addEventListener('change', renderIngredients);
  $('ingredientAvailableOnly').addEventListener('change', renderIngredients);

  // Existing header actions should close the ingredient screen before switching views.
  $('shoppingButton').addEventListener('click', hideIngredientView, true);
  $('newRecipeButton').addEventListener('click', hideIngredientView, true);
}

async function loadIngredients() {
  showLoading(true);
  try {
    await ensureAuth();
    const { data, error } = await supabase.from('ingredients')
      .select('*')
      .order('category')
      .order('name');
    if (error) throw error;
    state.items = data || [];
    state.loaded = true;
    renderIngredients();
  } catch (e) {
    toast(`食材を読み込めませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

function renderIngredients() {
  const q = $('ingredientSearch').value.trim().toLowerCase();
  const category = $('ingredientCategoryFilter').value;
  const availableOnly = $('ingredientAvailableOnly').checked;
  const filtered = state.items.filter(item =>
    (!q || item.name.toLowerCase().includes(q)) &&
    (!category || item.category === category) &&
    (!availableOnly || item.is_available)
  );

  $('ingredientSummary').textContent = `${filtered.length}件表示 / 登録 ${state.items.length}件 / ある ${state.items.filter(x => x.is_available).length}件`;
  if (!filtered.length) {
    $('ingredientList').innerHTML = `<div class="empty">${state.loaded ? '条件に一致する食材がありません。' : '食材がありません。'}</div>`;
    return;
  }

  $('ingredientList').innerHTML = INGREDIENT_CATEGORIES.map(categoryName => {
    const items = filtered.filter(item => item.category === categoryName);
    if (!items.length) return '';
    return `<section class="ingredient-category">
      <h3>${esc(categoryName)}</h3>
      <div class="ingredient-items">
        ${items.map(item => `
          <div class="ingredient-item ${item.is_available ? 'is-available' : 'is-unavailable'}">
            <div class="ingredient-main">
              <span class="ingredient-name">${esc(item.name)}</span>
              <span class="ingredient-status-label">${item.is_available ? 'ある' : 'ない'}</span>
            </div>
            <div class="ingredient-actions">
              <button type="button" class="ingredient-status ${item.is_available ? 'available' : 'unavailable'}" data-id="${item.id}">${item.is_available ? 'ないにする' : 'あるに戻す'}</button>
              <button type="button" class="remove-button ingredient-delete" data-id="${item.id}">削除</button>
            </div>
          </div>`).join('')}
      </div>
    </section>`;
  }).join('');

  document.querySelectorAll('.ingredient-status').forEach(button => {
    button.addEventListener('click', () => toggleAvailability(button.dataset.id));
  });
  document.querySelectorAll('.ingredient-delete').forEach(button => {
    button.addEventListener('click', () => deleteIngredient(button.dataset.id));
  });
}

async function addIngredient(event) {
  event.preventDefault();
  const name = $('ingredientInputName').value.trim();
  const category = $('ingredientInputCategory').value;
  if (!name) {
    toast('食材名を入力してください');
    return;
  }
  if (state.items.some(item => item.name === name)) {
    toast('その食材はすでに登録されています');
    return;
  }

  showLoading(true);
  try {
    const { error } = await supabase.from('ingredients').insert({
      name,
      category,
      is_available: true
    });
    if (error) throw error;
    $('ingredientInputName').value = '';
    await loadIngredients();
    toast('食材を登録しました');
  } catch (e) {
    toast(`登録できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function toggleAvailability(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  const next = !item.is_available;
  showLoading(true);
  try {
    const { error } = await supabase.from('ingredients').update({
      is_available: next,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
    item.is_available = next;
    item.updated_at = new Date().toISOString();
    renderIngredients();
  } catch (e) {
    toast(`在庫状態を変更できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function deleteIngredient(id) {
  const item = state.items.find(x => x.id === id);
  if (!item || !confirm(`「${item.name}」を食材の登録から削除しますか？\n「ない」にするだけなら削除する必要はありません。`)) return;
  showLoading(true);
  try {
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    if (error) throw error;
    state.items = state.items.filter(x => x.id !== id);
    renderIngredients();
    toast('食材を削除しました');
  } catch (e) {
    toast(`削除できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

setup();
