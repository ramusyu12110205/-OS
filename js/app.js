import { supabase, ensureAuth } from './supabase.js?v=20261007-1';

const CATEGORIES = ['主菜','副菜','汁物','主食','デザート','その他'];
const GENRES = ['和食','洋食','中華','韓国','エスニック','その他'];
const SHOPPING_CATEGORIES = ['肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','日用品','その他'];

const DEFAULT_SHOPPING_MASTER = [
  ['肉・魚・卵', ['豚こま','鶏もも','鶏むね','豚バラ','ひき肉','卵']],
  ['野菜', ['玉ねぎ','にんじん','じゃがいも','キャベツ','ピーマン','きのこ','トマト','レタス']],
  ['調味料', ['醤油','みそ','砂糖','塩','こしょう','料理酒','みりん']],
  ['乳製品', ['牛乳','ヨーグルト','チーズ']],
  ['パン・パスタ・主食', ['食パン','米','パスタ','うどん']],
  ['冷凍食品', ['冷凍うどん','冷凍野菜','冷凍食品']],
  ['日用品', ['ラップ','キッチンペーパー','ティッシュ','食器用洗剤']],
  ['その他', ['納豆','子供のお菓子']]
];

const $ = (id) => document.getElementById(id);
const state = {
  recipes: [], tags: [], editingId: null, detailId: null,
  shoppingMaster: [], shoppingList: [], shoppingPendingChanges: new Map(), showPurchased: false,
  ingredients: [], ingredientEditingId: null
};

const INGREDIENT_CATEGORIES = ['肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','その他'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
}

function setLoading(loading) { $('loading').classList.toggle('hidden', !loading); }
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), 2200); }

async function init() {
  try {
    setLoading(true);
    await ensureAuth();
    await loadTags();
    await loadRecipes();
    setupStaticUI();
    await loadShoppingData();
    await loadIngredients();
    setupIngredientUI();
    renderRecipeList();
    showListView();
  } catch (error) {
    console.error(error);
    toast(`読み込みに失敗しました: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function setupStaticUI() {
  $('searchInput').addEventListener('input', renderRecipeList);
  ['categoryFilter','genreFilter','tagFilter','favoriteFilter'].forEach(id => $(id).addEventListener('change', renderRecipeList));
  $('newRecipeButton').addEventListener('click', () => openRecipeForm());
  $('ingredientsButton').addEventListener('click', openIngredientsView);
  $('shoppingButton').addEventListener('click', openShoppingView);
  $('backToListButton').addEventListener('click', showListView);
  $('cancelRecipeButton').addEventListener('click', showListView);
  $('recipeForm').addEventListener('submit', saveRecipe);
  $('addIngredientButton').addEventListener('click', () => addIngredientRow());
  $('addInstructionButton').addEventListener('click', () => addInstructionRow());
  $('tagChoices').addEventListener('click', toggleTagChoice);
  $('recipeList').addEventListener('click', handleRecipeListClick);
  $('detailView').addEventListener('click', handleDetailClick);
  $('shoppingMaster').addEventListener('change', updateShoppingMasterDeleteButton);
  $('shoppingMaster').addEventListener('click', handleShoppingMasterClick);
  $('addShoppingMasterButton').addEventListener('click', addShoppingMasterItem);
  $('shoppingFreeForm').addEventListener('submit', addFreeShoppingItem);
  $('shoppingList').addEventListener('click', handleShoppingListClick);
  $('shoppingList').addEventListener('change', event => {
    const input = event.target.closest('.purchase-check');
    if (!input) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = input.dataset.id;
    const item = state.shoppingList.find(x => x.id === id);
    if (!item) return;
    if (input.checked === item.is_purchased) {
      state.shoppingPendingChanges.delete(id);
    } else {
      state.shoppingPendingChanges.set(id, input.checked);
    }
    updateShoppingPurchaseButton();
  }, true);
  $('applyShoppingPurchase').addEventListener('click', commitShoppingPurchaseChanges);
  $('showPurchasedToggle').addEventListener('change', event => { state.showPurchased = event.target.checked; renderShoppingList(); });
  $('shoppingHistoryButton').addEventListener('click', openShoppingHistoryView);
  $('shoppingHistoryBackButton').addEventListener('click', openShoppingView);
  $('shoppingHistory').addEventListener('click', handleShoppingHistoryClick);
}

function renderShoppingMaster() {
  const categories = [...new Set([...SHOPPING_CATEGORIES, ...state.shoppingMaster.map(item => item.category)])];
  const grouped = new Map(categories.map(category => [category, []]));
  state.shoppingMaster.forEach(item => {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  });
  const visibleGroups = [...grouped.entries()].filter(([, items]) => items.length);
  $('shoppingMaster').innerHTML = visibleGroups.length ? visibleGroups.map(([category, items]) => `
    <div class="shopping-category">
      <h3>${escapeHtml(category)}</h3>
      <div class="shopping-master-items">
        ${items.map(item => `
          <label class="shopping-master-item-wrap">
            <span class="shopping-master-item">
              <input class="shopping-master-check" type="checkbox" data-id="${item.id}">
              <span>${escapeHtml(item.name)}</span>
            </span>
          </label>`).join('')}
      </div>
    </div>`).join('') : '<div class="empty">よく買うものはまだありません。</div>';
  updateShoppingMasterDeleteButton();
}

function updateShoppingMasterDeleteButton() {
  const button = $('deleteShoppingMasterButton');
  if (!button) return;
  button.disabled = !$('shoppingMaster').querySelector('.shopping-master-check:checked');
}

async function addShoppingMasterItem(event) {
  event?.preventDefault();
  const name = $('shoppingMasterName').value.trim();
  const category = $('shoppingMasterCategory').value;
  if (!name) return;
  setLoading(true);
  try {
    const { error } = await supabase.from('shopping_master').insert({ name, category });
    if (error) throw error;
    $('shoppingMasterName').value = '';
    await loadShoppingData();
    toast('よく買うものに追加しました');
  } catch (error) { toast(`追加に失敗しました: ${error.message}`); } finally { setLoading(false); }
}

async function addSelectedShoppingItems() {
  const selected = [...document.querySelectorAll('.shopping-master-check:checked')];
  if (!selected.length) return;
  const masterById = new Map(state.shoppingMaster.map(item => [item.id, item]));
  const rows = selected.map(input => { const item = masterById.get(input.dataset.id); return item ? { name: item.name, category: item.category, master_id: item.id } : null; }).filter(Boolean);
  if (!rows.length) return;
  setLoading(true);
  try {
    const { error } = await supabase.from('shopping_list_items').insert(rows);
    if (error) throw error;
    selected.forEach(input => { input.checked = false; });
    updateShoppingMasterDeleteButton();
    await loadShoppingData();
    toast(`${rows.length}件を買い物リストに追加しました`);
  } catch (error) { toast(`追加に失敗しました: ${error.message}`); } finally { setLoading(false); }
}

async function deleteSelectedShoppingMasterItems() {
  const ids = [...document.querySelectorAll('.shopping-master-check:checked')].map(input => input.dataset.id);
  if (!ids.length) return;
  if (!confirm(`${ids.length}件の「よく買うもの」を削除しますか？`)) return;
  setLoading(true);
  try {
    const { error } = await supabase.from('shopping_master').delete().in('id', ids);
    if (error) throw error;
    await loadShoppingData();
    toast(`${ids.length}件を削除しました`);
  } catch (error) { toast(`削除に失敗しました: ${error.message}`); } finally { setLoading(false); }
}

async function editShoppingMasterItem(id) { const item = state.shoppingMaster.find(x => x.id === id); if (!item) return; const name = prompt('商品名', item.name); if (name === null) return; const nextName = name.trim(); if (!nextName) return; const category = prompt(`カテゴリ\n${SHOPPING_CATEGORIES.join(' / ')}`, item.category); if (category === null) return; const nextCategory = category.trim(); if (!nextCategory) return; setLoading(true); try { const { error } = await supabase.from('shopping_master').update({ name: nextName, category: nextCategory, updated_at: new Date().toISOString() }).eq('id', id); if (error) throw error; await loadShoppingData(); toast('更新しました'); } catch (error) { toast(`更新に失敗しました: ${error.message}`); } finally { setLoading(false); } }

async function deleteShoppingMasterItem(id) { const item = state.shoppingMaster.find(x => x.id === id); if (!item || !confirm(`「${item.name}」をよく買うものから削除しますか？`)) return; setLoading(true); try { const { error } = await supabase.from('shopping_master').delete().eq('id', id); if (error) throw error; await loadShoppingData(); toast('削除しました'); } catch (error) { toast(`削除に失敗しました: ${error.message}`); } finally { setLoading(false); } }

async function addFreeShoppingItem(event) { event.preventDefault(); const name = $('shoppingFreeName').value.trim(); const category = $('shoppingFreeCategory').value; if (!name) return; setLoading(true); try { const { error } = await supabase.from('shopping_list_items').insert({ name, category }); if (error) throw error; $('shoppingFreeName').value = ''; await loadShoppingData(); toast('買い物リストに追加しました'); } catch (error) { toast(`追加に失敗しました: ${error.message}`); } finally { setLoading(false); } }

function handleShoppingMasterClick(event) { const edit = event.target.closest('.shopping-master-edit'); if (edit) { editShoppingMasterItem(edit.dataset.id); return; } const del = event.target.closest('.shopping-master-delete'); if (del) deleteShoppingMasterItem(del.dataset.id); }

async function commitShoppingPurchaseChanges() { const changes = [...state.shoppingPendingChanges.entries()]; if (!changes.length) return; if (!confirm(`${changes.length}件の購入状態を反映しますか？`)) return; setLoading(true); try { for (const [id, nextPurchased] of changes) { const item = state.shoppingList.find(x => x.id === id); if (!item) { state.shoppingPendingChanges.delete(id); continue; } if (nextPurchased) { const purchasedAt = new Date().toISOString(); const { data: history, error: historyError } = await supabase.from('shopping_purchase_history').insert({ shopping_list_item_id: item.id, name: item.name, category: item.category, master_id: item.master_id, purchased_at: purchasedAt }).select('id').single(); if (historyError) throw historyError; const { error: updateError } = await supabase.from('shopping_list_items').update({ is_purchased: true, purchased_at: purchasedAt, updated_at: new Date().toISOString() }).eq('id', id); if (updateError) { await supabase.from('shopping_purchase_history').delete().eq('id', history.id); throw updateError; } } else { const { data: historyRows, error: historyFindError } = await supabase.from('shopping_purchase_history').select('id').eq('shopping_list_item_id', item.id).eq('purchased_at', item.purchased_at).order('created_at', { ascending: false }).limit(1); if (historyFindError) throw historyFindError; if (historyRows?.length) { const { error: historyDeleteError } = await supabase.from('shopping_purchase_history').delete().eq('id', historyRows[0].id); if (historyDeleteError) throw historyDeleteError; } const { error: updateError } = await supabase.from('shopping_list_items').update({ is_purchased: false, purchased_at: null, updated_at: new Date().toISOString() }).eq('id', id); if (updateError) throw updateError; } state.shoppingPendingChanges.delete(id); } await loadShoppingData(); toast('購入状態を反映しました'); } catch (error) { toast(`購入状態の反映に失敗しました: ${error.message}`); } finally { setLoading(false); } }

function updateShoppingPurchaseButton() { const button = $('applyShoppingPurchase'); const count = state.shoppingPendingChanges.size; button.disabled = count === 0; button.textContent = count ? `購入を反映（${count}件）` : '購入を反映'; }

function renderShoppingList() { const items = state.shoppingList.filter(item => state.showPurchased || !item.is_purchased); $('shoppingList').innerHTML = items.length ? items.map(item => { const pending = state.shoppingPendingChanges.get(item.id); const checked = pending === undefined ? item.is_purchased : pending; return `<div class="shopping-list-item ${checked ? 'purchased' : ''}"><label class="shopping-list-check"><input class="purchase-check" type="checkbox" data-id="${item.id}" ${checked ? 'checked' : ''}><span>${escapeHtml(item.name)}</span></label><span class="shopping-list-category">${escapeHtml(item.category)}</span><span class="shopping-purchased-date">${item.is_purchased ? escapeHtml(formatPurchaseDate(item.purchased_at)) : ''}</span><button class="text-button shopping-delete" type="button" data-id="${item.id}">削除</button></div>`; }).join('') : '<div class="empty">買い物リストは空です。</div>'; updateShoppingPurchaseButton(); }

function formatPurchaseDate(value) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; return `${date.getMonth()+1}/${date.getDate()} 購入`; }

function handleShoppingListClick(event) { const button = event.target.closest('.shopping-delete'); if (!button) return; deleteShoppingItem(button.dataset.id); }

async function deleteShoppingItem(id) { if (!confirm('この買い物リスト項目を削除しますか？')) return; setLoading(true); try { const { error } = await supabase.from('shopping_list_items').delete().eq('id', id); if (error) throw error; state.shoppingPendingChanges.delete(id); await loadShoppingData(); toast('削除しました'); } catch (error) { toast(`削除に失敗しました: ${error.message}`); } finally { setLoading(false); } }

async function loadShoppingData() { const [{ data: master, error: masterError }, { data: list, error: listError }] = await Promise.all([supabase.from('shopping_master').select('*').order('category').order('sort_order').order('name'), supabase.from('shopping_list_items').select('*').order('is_purchased').order('created_at', { ascending: false })]); if (masterError) throw masterError; if (listError) throw listError; state.shoppingMaster = master || []; state.shoppingList = list || []; const validIds = new Set(state.shoppingList.map(item => item.id)); for (const id of state.shoppingPendingChanges.keys()) if (!validIds.has(id)) state.shoppingPendingChanges.delete(id); renderShoppingMaster(); renderShoppingList(); }

function openShoppingView() { document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); $('shoppingView').classList.remove('hidden'); renderShoppingMaster(); renderShoppingList(); }

function openShoppingHistoryView() { document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); $('shoppingHistoryView').classList.remove('hidden'); renderShoppingHistory(); }

function renderShoppingHistory() { const groups = new Map(); state.shoppingHistory = state.shoppingHistory || []; state.shoppingHistory.forEach(item => { const date = new Date(item.purchased_at); const monthKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; const dayKey = `${monthKey}-${String(date.getDate()).padStart(2,'0')}`; if (!groups.has(monthKey)) groups.set(monthKey, new Map()); const days = groups.get(monthKey); if (!days.has(dayKey)) days.set(dayKey, []); days.get(dayKey).push(item); }); const html = [...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([month,days])=>`<section class="shopping-history-month"><h4>${month.replace('-','年')}月</h4>${[...days.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,items])=>`<div class="shopping-history-day"><h5>${day.slice(0,4)}年${Number(day.slice(5,7))}月${Number(day.slice(8,10))}日</h5><div class="shopping-history-items">${items.sort((a,b)=>new Date(b.purchased_at)-new Date(a.purchased_at)).map(item=>`<div class="shopping-history-item"><div><span class="shopping-history-name">${escapeHtml(item.name)}</span><span class="shopping-history-category">${escapeHtml(item.category)}</span></div><button class="text-button shopping-history-delete" type="button" data-id="${item.id}">削除</button></div>`).join('')}</div></div>`).join('')}</section>`).join(''); $('shoppingHistory').innerHTML = html || '<div class="empty">買い物履歴はまだありません。</div>'; }

function handleShoppingHistoryClick(event) { const button = event.target.closest('.shopping-history-delete'); if (!button) return; deleteShoppingHistory(button.dataset.id); }

async function deleteShoppingHistory(id) { if (!confirm('この買い物履歴を削除しますか？')) return; setLoading(true); try { const { error } = await supabase.from('shopping_purchase_history').delete().eq('id', id); if (error) throw error; state.shoppingHistory = state.shoppingHistory.filter(item => item.id !== id); renderShoppingHistory(); toast('履歴を削除しました'); } catch (error) { toast(`履歴の削除に失敗しました: ${error.message}`); } finally { setLoading(false); } }

function renderIngredients() { const search = $('ingredientSearch').value.trim().toLowerCase(); const category = $('ingredientCategoryFilter').value; const onlyAvailable = $('ingredientAvailableOnly').checked; const filtered = state.ingredients.filter(item => (!search || item.name.toLowerCase().includes(search)) && (!category || item.category === category) && (!onlyAvailable || item.is_available)); const categories = [...new Set([...INGREDIENT_CATEGORIES, ...state.ingredients.map(item => item.category)])]; const grouped = new Map(categories.map(category => [category, []])); filtered.forEach(item => grouped.get(item.category)?.push(item)); $('ingredientList').innerHTML = filtered.length ? [...grouped.entries()].filter(([,items])=>items.length).map(([category,items])=>`<section class="ingredient-category"><h3>${escapeHtml(category)}</h3><div class="ingredient-items">${items.map(item=>`<div class="ingredient-item ${item.is_available?'is-available':'is-unavailable'}"><div class="ingredient-main"><span class="ingredient-name">${escapeHtml(item.name)}</span><span class="ingredient-status-label">${item.is_available?'ある':'ない'}</span></div><div class="ingredient-actions"><button class="secondary-button ingredient-status" data-id="${item.id}" type="button">${item.is_available?'ないにする':'あるにする'}</button><button class="text-button ingredient-delete" data-id="${item.id}" type="button">削除</button></div></div>`).join('')}</div></section>`).join('') : '<div class="empty">条件に一致する食材はありません。</div>'; }

function setupIngredientUI() { $('ingredientForm').addEventListener('submit', saveIngredient); $('ingredientSearch').addEventListener('input', renderIngredients); $('ingredientCategoryFilter').addEventListener('change', renderIngredients); $('ingredientAvailableOnly').addEventListener('change', renderIngredients); $('ingredientList').addEventListener('click', handleIngredientClick); $('backFromIngredientsButton').addEventListener('click', showListView); }

async function loadIngredients() { const { data, error } = await supabase.from('ingredients').select('*').order('category').order('name'); if (error) throw error; state.ingredients = data || []; renderIngredients(); }

async function saveIngredient(event) { event.preventDefault(); const name = $('ingredientName').value.trim(); const category = $('ingredientCategory').value; if (!name) return; setLoading(true); try { const { error } = await supabase.from('ingredients').insert({name,category,is_available:true}); if (error) throw error; $('ingredientName').value=''; await loadIngredients(); toast('食材を登録しました'); } catch(error){toast(`登録に失敗しました: ${error.message}`);} finally{setLoading(false);} }

async function handleIngredientClick(event) { const status = event.target.closest('.ingredient-status'); if (status) { const item = state.ingredients.find(x=>x.id===status.dataset.id); if (!item) return; await updateIngredientStatus(item); return; } const del = event.target.closest('.ingredient-delete'); if (del) await deleteIngredient(del.dataset.id); }

async function updateIngredientStatus(item) { setLoading(true); try { const { error } = await supabase.from('ingredients').update({is_available:!item.is_available,updated_at:new Date().toISOString()}).eq('id',item.id); if(error) throw error; await loadIngredients(); toast(item.is_available?'「ない」にしました':'「ある」にしました'); } catch(error){toast(`更新に失敗しました: ${error.message}`);} finally{setLoading(false);} }

async function deleteIngredient(id) { const item=state.ingredients.find(x=>x.id===id); if(!item||!confirm(`「${item.name}」の登録を削除しますか？`)) return; setLoading(true); try { const { error } = await supabase.from('ingredients').delete().eq('id',id); if(error) throw error; await loadIngredients(); toast('削除しました'); } catch(error){toast(`削除に失敗しました: ${error.message}`);} finally{setLoading(false);} }

function openIngredientsView() { document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); $('ingredientsView').classList.remove('hidden'); renderIngredients(); }

function showListView() { document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); $('listView').classList.remove('hidden'); }

function showRecipeDetail(id) { state.detailId = id; document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); $('detailView').classList.remove('hidden'); renderRecipeDetail(); }

function openRecipeForm(id = null) { state.editingId = id; document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); $('formView').classList.remove('hidden'); renderRecipeForm(id); }

function handleRecipeListClick(event) { const item = event.target.closest('.recipe-item'); if (item) showRecipeDetail(item.dataset.id); }

function handleDetailClick(event) { const edit = event.target.closest('[data-action="edit"]'); if (edit) openRecipeForm(edit.dataset.id); const del = event.target.closest('[data-action="delete"]'); if (del) deleteRecipe(del.dataset.id); }

async function loadTags() { const { data, error } = await supabase.from('tags').select('*').order('name'); if (error) throw error; state.tags = data || []; renderFilterOptions(); }

function renderFilterOptions() { $('categoryFilter').innerHTML = '<option value="">主カテゴリすべて</option>' + CATEGORIES.map(x=>`<option>${escapeHtml(x)}</option>`).join(''); $('genreFilter').innerHTML = '<option value="">ジャンルすべて</option>' + GENRES.map(x=>`<option>${escapeHtml(x)}</option>`).join(''); $('tagFilter').innerHTML = '<option value="">タグすべて</option>' + state.tags.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join(''); }

async function loadRecipes() { const { data, error } = await supabase.from('recipes').select('*,recipe_ingredients(*),recipe_tags(tag_id,tags(*))').order('created_at',{ascending:false}); if(error) throw error; state.recipes=data||[]; }

function renderRecipeList() { const keyword=$('searchInput').value.trim().toLowerCase(); const category=$('categoryFilter').value; const genre=$('genreFilter').value; const tagId=$('tagFilter').value; const favorite=$('favoriteFilter').checked; const filtered=state.recipes.filter(r=>(!keyword||(r.name||'').toLowerCase().includes(keyword)||(r.recipe_ingredients||[]).some(i=>(i.name||'').toLowerCase().includes(keyword)))&&(!category||r.category===category)&&(!genre||r.genre===genre)&&(!tagId||(r.recipe_tags||[]).some(t=>t.tag_id===tagId))&&(!favorite||r.is_favorite)); $('recipeList').innerHTML=filtered.length?filtered.map(r=>`<article class="recipe-item" data-id="${r.id}"><div class="recipe-item-top"><div><h3>${escapeHtml(r.name)}</h3><div class="meta">${escapeHtml(r.category)} / ${escapeHtml(r.genre)}</div><div class="tags">${(r.recipe_tags||[]).map(t=>`<span class="tag">${escapeHtml(t.tags?.name)}</span>`).join('')}</div></div><div class="favorite">${r.is_favorite?'★':'☆'}</div></div></article>`).join(''):'<div class="empty">レシピがありません。</div>'; }

function addIngredientRow(data={}) { const row=document.createElement('div'); row.className='ingredient-row'; row.innerHTML=`<input data-field="name" value="${escapeHtml(data.name||'')}"><input data-field="quantity" value="${escapeHtml(data.quantity||'')}"><input data-field="unit" value="${escapeHtml(data.unit||'')}"><input data-field="note" value="${escapeHtml(data.note||'')}"><button type="button" class="remove-button">削除</button>`; $('ingredientRows').appendChild(row); }

function addInstructionRow(text='') { const row=document.createElement('div'); row.className='instruction-row'; row.innerHTML=`<span class="instruction-number">${$('instructionRows').children.length+1}</span><textarea>${escapeHtml(text)}</textarea><button type="button" class="remove-button">削除</button>`; $('instructionRows').appendChild(row); }

function toggleTagChoice(event) { const button=event.target.closest('.tag-choice'); if(button) button.classList.toggle('selected'); }

function renderRecipeForm(id) { const recipe=id?state.recipes.find(r=>r.id===id):null; $('recipeFormTitle').textContent=recipe?'レシピ編集':'レシピ登録'; $('recipeName').value=recipe?.name||''; $('recipeCategory').value=recipe?.category||'主菜'; $('recipeGenre').value=recipe?.genre||'和食'; $('recipeDescription').value=recipe?.description||''; $('recipeTime').value=recipe?.cooking_time||''; $('recipeServings').value=recipe?.servings||''; $('recipeMemo').value=recipe?.memo||''; $('recipeFavorite').checked=!!recipe?.is_favorite; $('recipeMakeAgain').checked=!!recipe?.make_again; $('ingredientRows').innerHTML=''; (recipe?.recipe_ingredients?.length?recipe.recipe_ingredients:[{}]).forEach(addIngredientRow); $('instructionRows').innerHTML=''; (recipe?.instructions?.length?recipe.instructions:['']).forEach(addInstructionRow); const selected=new Set((recipe?.recipe_tags||[]).map(x=>x.tag_id)); $('tagChoices').innerHTML=state.tags.map(t=>`<button type="button" class="tag-choice ${selected.has(t.id)?'selected':''}" data-id="${t.id}">${escapeHtml(t.name)}</button>`).join(''); }

async function saveRecipe(event) { event.preventDefault(); const payload={name:$('recipeName').value.trim(),category:$('recipeCategory').value,genre:$('recipeGenre').value,description:$('recipeDescription').value.trim(),cooking_time:$('recipeTime').value?Number($('recipeTime').value):null,servings:$('recipeServings').value?Number($('recipeServings').value):null,memo:$('recipeMemo').value.trim(),is_favorite:$('recipeFavorite').checked,make_again:$('recipeMakeAgain').checked,instructions:[...$('instructionRows').querySelectorAll('textarea')].map(x=>x.value.trim()).filter(Boolean)}; if(!payload.name){toast('レシピ名を入力してください');return;} setLoading(true); try { let recipeId=state.editingId; if(recipeId){const {error}=await supabase.from('recipes').update(payload).eq('id',recipeId);if(error)throw error;}else{const {data,error}=await supabase.from('recipes').insert(payload).select('id').single();if(error)throw error;recipeId=data.id;} await supabase.from('recipe_ingredients').delete().eq('recipe_id',recipeId); const rows=[...$('ingredientRows').children].map(row=>({recipe_id:recipeId,name:row.querySelector('[data-field="name"]').value.trim(),quantity:row.querySelector('[data-field="quantity"]').value.trim(),unit:row.querySelector('[data-field="unit"]').value.trim(),note:row.querySelector('[data-field="note"]').value.trim()})).filter(x=>x.name); if(rows.length){const {error}=await supabase.from('recipe_ingredients').insert(rows);if(error)throw error;} await supabase.from('recipe_tags').delete().eq('recipe_id',recipeId); const tagRows=[...$('tagChoices').querySelectorAll('.tag-choice.selected')].map(button=>({recipe_id:recipeId,tag_id:button.dataset.id})); if(tagRows.length){const {error}=await supabase.from('recipe_tags').insert(tagRows);if(error)throw error;} await loadRecipes(); showListView(); renderRecipeList(); toast('保存しました'); } catch(error){toast(`保存に失敗しました: ${error.message}`);} finally{setLoading(false);} }

async function deleteRecipe(id) { const recipe=state.recipes.find(r=>r.id===id); if(!recipe||!confirm(`「${recipe.name}」を削除しますか？`))return; setLoading(true); try { const {error}=await supabase.from('recipe_ingredients').delete().eq('recipe_id',id);if(error)throw error; const {error:tagError}=await supabase.from('recipe_tags').delete().eq('recipe_id',id);if(tagError)throw tagError; const {error:recipeError}=await supabase.from('recipes').delete().eq('id',id);if(recipeError)throw recipeError; await loadRecipes();showListView();renderRecipeList();toast('削除しました'); } catch(error){toast(`削除に失敗しました: ${error.message}`);} finally{setLoading(false);} }

init();