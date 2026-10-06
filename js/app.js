import { supabase, ensureAuth } from './supabase.js';

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
  shoppingMaster: [], shoppingList: [], showPurchased: false,
  shoppingPendingChanges: new Map()
};

function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function showLoading(v) { $('loading').classList.toggle('hidden', !v); }
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  setTimeout(() => $('toast').classList.add('hidden'), 2200);
}
function showView(name) {
  ['listView','formView','detailView','shoppingView'].forEach(id => $(id).classList.toggle('hidden', id !== name));
  window.scrollTo({top:0,behavior:'auto'});
}
function fillSelect(select, values, firstLabel='') {
  select.innerHTML = (firstLabel ? `<option value="">${esc(firstLabel)}</option>` : '') +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}
function formatPurchaseDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', {year:'numeric', month:'numeric', day:'numeric'});
}

function setupStaticUI() {
  fillSelect($('categoryFilter'), CATEGORIES, '主カテゴリすべて');
  fillSelect($('genreFilter'), GENRES, 'ジャンルすべて');
  fillSelect($('formCategory'), CATEGORIES);
  fillSelect($('formGenre'), GENRES);
  fillSelect($('shoppingInputCategory'), SHOPPING_CATEGORIES);
  fillSelect($('shoppingMasterInputCategory'), SHOPPING_CATEGORIES);

  $('newRecipeButton').onclick = () => openForm();
  $('shoppingButton').onclick = () => openShopping();
  $('backFromForm').onclick = $('cancelForm').onclick = () => showView('listView');
  $('backFromDetail').onclick = () => showView('listView');
  $('backFromShopping').onclick = () => showView('listView');
  $('addIngredient').onclick = () => addIngredientRow();
  $('addInstruction').onclick = () => addInstructionRow();
  $('recipeForm').onsubmit = saveRecipe;
  $('shoppingFreeForm').onsubmit = addFreeShoppingItem;
  $('shoppingMasterForm').onsubmit = addShoppingMasterItem;
  $('addSelectedShopping').onclick = addSelectedShoppingItems;
  $('showPurchased').onchange = () => {
    state.showPurchased = $('showPurchased').checked;
    renderShoppingList();
  };
  $('searchInput').oninput = renderList;
  $('categoryFilter').onchange = renderList;
  $('genreFilter').onchange = renderList;
  $('tagFilter').onchange = renderList;
  $('favoriteFilter').onchange = renderList;
  $('editRecipe').onclick = () => state.detailId && openForm(state.detailId);
  $('deleteRecipe').onclick = deleteCurrentRecipe;

  setupShoppingPurchaseSelection();
}

function setupShoppingPurchaseSelection() {
  const showPurchased = $('showPurchased');
  const label = showPurchased.closest('.check-filter');
  const actions = document.createElement('div');
  actions.className = 'header-actions';
  const button = document.createElement('button');
  button.id = 'applyShoppingPurchase';
  button.type = 'button';
  button.className = 'primary-button';
  button.textContent = '購入を反映';
  button.disabled = true;
  actions.appendChild(button);
  label.parentElement.appendChild(actions);
  actions.appendChild(label);

  $('shoppingList').addEventListener('change', event => {
    const input = event.target.closest('.purchase-check');
    if (!input) return;

    // This checkbox is a temporary selection. Do not write to the DB here.
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

  button.onclick = commitShoppingPurchaseChanges;
}

function updateShoppingPurchaseButton() {
  const button = $('applyShoppingPurchase');
  if (!button) return;
  const count = state.shoppingPendingChanges.size;
  button.disabled = count === 0;
  button.textContent = count ? `購入を反映（${count}件）` : '購入を反映';
}

async function commitShoppingPurchaseChanges() {
  const changes = [...state.shoppingPendingChanges.entries()];
  if (!changes.length) return;
  if (!confirm(`${changes.length}件の購入状態を反映しますか？`)) return;

  showLoading(true);
  try {
    for (const [id, targetPurchased] of changes) {
      const item = state.shoppingList.find(x => x.id === id);
      if (!item) {
        state.shoppingPendingChanges.delete(id);
        continue;
      }

      if (targetPurchased && !item.is_purchased) {
        const purchasedAt = new Date().toISOString();
        const { error: historyError } = await supabase.from('shopping_purchase_history').insert({
          shopping_list_item_id: item.id,
          name: item.name,
          category: item.category,
          master_id: item.master_id,
          purchased_at: purchasedAt
        });
        if (historyError) throw historyError;

        const { error: listError } = await supabase.from('shopping_list_items').update({
          is_purchased: true,
          purchased_at: purchasedAt,
          updated_at: new Date().toISOString()
        }).eq('id', id);
        if (listError) {
          await supabase.from('shopping_purchase_history')
            .delete()
            .eq('shopping_list_item_id', id)
            .eq('purchased_at', purchasedAt);
          throw listError;
        }
      } else if (!targetPurchased && item.is_purchased) {
        if (item.purchased_at) {
          const { data: historyRow, error: historyFindError } = await supabase.from('shopping_purchase_history')
            .select('id')
            .eq('shopping_list_item_id', id)
            .eq('purchased_at', item.purchased_at)
            .maybeSingle();
          if (historyFindError) throw historyFindError;
          if (historyRow) {
            const { error: historyDeleteError } = await supabase.from('shopping_purchase_history')
              .delete().eq('id', historyRow.id);
            if (historyDeleteError) throw historyDeleteError;
          }
        }

        const { error: listError } = await supabase.from('shopping_list_items').update({
          is_purchased: false,
          purchased_at: null,
          updated_at: new Date().toISOString()
        }).eq('id', id);
        if (listError) throw listError;
      }

      state.shoppingPendingChanges.delete(id);
    }

    await loadShoppingData();
    toast(`${changes.length}件を購入済みに反映しました`);
  } catch(e) {
    toast(`購入状態を反映できませんでした: ${e.message}`);
    await loadShoppingData();
  } finally {
    updateShoppingPurchaseButton();
    showLoading(false);
  }
}

async function loadTags() {
  const { data, error } = await supabase.from('tags').select('id,name').order('name');
  if (error) throw error;
  state.tags = data || [];
  fillSelect($('tagFilter'), state.tags.map(t => t.name), 'タグすべて');
}

async function loadRecipes() {
  const { data, error } = await supabase.from('recipes')
    .select('*, recipe_ingredients(*), recipe_tags(tag_id, tags(id,name))')
    .order('updated_at',{ascending:false});
  if (error) throw error;
  state.recipes = data || [];
  renderList();
}

function recipeTags(recipe) {
  return (recipe.recipe_tags || []).map(x => x.tags).filter(Boolean);
}
function ingredientSearchText(recipe) {
  return (recipe.recipe_ingredients || []).map(i => i.ingredient_name).join(' ');
}

function renderList() {
  const q = $('searchInput').value.trim().toLowerCase();
  const category = $('categoryFilter').value;
  const genre = $('genreFilter').value;
  const tag = $('tagFilter').value;
  const fav = $('favoriteFilter').checked;
  const filtered = state.recipes.filter(r => {
    const tags = recipeTags(r).map(t => t.name);
    return (!q || `${r.name} ${ingredientSearchText(r)}`.toLowerCase().includes(q)) &&
      (!category || r.cooking_category === category) &&
      (!genre || r.genre === genre) &&
      (!tag || tags.includes(tag)) &&
      (!fav || r.is_favorite);
  });
  if (!filtered.length) {
    $('recipeList').innerHTML = `<div class="empty">レシピがありません。<br>「＋ レシピ登録」から登録できます。</div>`;
    return;
  }
  $('recipeList').innerHTML = filtered.map(r => `
    <article class="recipe-item" data-id="${r.id}">
      <div class="recipe-item-top">
        <div><h3>${esc(r.name)}</h3><div class="meta">${esc(r.cooking_category)} ・ ${esc(r.genre)}</div></div>
        <div class="favorite">${r.is_favorite ? '★' : ''}</div>
      </div>
      ${r.description ? `<p class="meta">${esc(r.description)}</p>` : ''}
      <div class="tags">${recipeTags(r).map(t => `<span class="tag">${esc(t.name)}</span>`).join('')}</div>
    </article>`).join('');
  document.querySelectorAll('.recipe-item').forEach(el => el.onclick = () => openDetail(el.dataset.id));
}

function resetIngredientRows(items=[{}]) {
  $('ingredientRows').innerHTML='';
  items.forEach(i => addIngredientRow(i));
}
function addIngredientRow(item={}) {
  const row = document.createElement('div');
  row.className='ingredient-row';
  row.innerHTML = `<input class="ingredient-name" placeholder="材料名" value="${esc(item.ingredient_name||'')}"><input class="ingredient-amount" placeholder="分量" value="${esc(item.amount||'')}"><input class="ingredient-unit" placeholder="単位" value="${esc(item.unit||'')}"><input class="ingredient-note" placeholder="メモ（下味など）" value="${esc(item.note||'')}"><button type="button" class="remove-button">削除</button>`;
  row.querySelector('.remove-button').onclick=()=>{
    row.remove();
    if(!$('ingredientRows').children.length) addIngredientRow();
  };
  $('ingredientRows').appendChild(row);
}
function resetInstructionRows(items=['']) {
  $('instructionRows').innerHTML='';
  items.forEach(i => addInstructionRow(i));
}
function addInstructionRow(text='') {
  const row=document.createElement('div');
  row.className='instruction-row';
  row.innerHTML=`<span class="instruction-number"></span><textarea rows="2" placeholder="作り方を入力">${esc(text)}</textarea><button type="button" class="remove-button">削除</button>`;
  row.querySelector('.remove-button').onclick=()=>{row.remove(); renumberInstructions();};
  $('instructionRows').appendChild(row);
  renumberInstructions();
}
function renumberInstructions(){
  [...$('instructionRows').children].forEach((row,i)=>row.querySelector('.instruction-number').textContent=i+1);
}
function renderTagChoices(selected=[]) {
  $('tagChoices').innerHTML=state.tags.map(t=>`<button type="button" class="tag-choice ${selected.includes(t.id)?'selected':''}" data-tag="${t.id}">${esc(t.name)}</button>`).join('');
  document.querySelectorAll('.tag-choice').forEach(b=>b.onclick=()=>b.classList.toggle('selected'));
}

async function openForm(id=null) {
  state.editingId=id;
  $('formTitle').textContent=id?'レシピ編集':'レシピ登録';
  if (!id) {
    $('recipeForm').reset();
    resetIngredientRows();
    resetInstructionRows();
    renderTagChoices([]);
    showView('formView');
    return;
  }
  showLoading(true);
  try {
    const r=state.recipes.find(x=>x.id===id) || await fetchRecipe(id);
    $('recipeForm').elements.name.value=r.name||'';
    $('recipeForm').elements.description.value=r.description||'';
    $('formCategory').value=r.cooking_category;
    $('formGenre').value=r.genre;
    $('recipeForm').elements.is_favorite.checked=!!r.is_favorite;
    $('recipeForm').elements.make_again.checked=!!r.make_again;
    $('recipeForm').elements.memo.value=r.memo||'';
    resetIngredientRows(r.recipe_ingredients||[]);
    resetInstructionRows(Array.isArray(r.instructions)?r.instructions:[]);
    renderTagChoices(recipeTags(r).map(t=>t.id));
    showView('formView');
  } catch(e){ toast(e.message); }
  finally { showLoading(false); }
}
async function fetchRecipe(id){
  const {data,error}=await supabase.from('recipes')
    .select('*, recipe_ingredients(*), recipe_tags(tag_id, tags(id,name))')
    .eq('id',id).single();
  if(error)throw error;
  return data;
}
function formPayload(){
  const f=$('recipeForm');
  const ingredients=[...document.querySelectorAll('.ingredient-row')].map(row=>({
    ingredient_name:row.querySelector('.ingredient-name').value.trim(),
    amount:row.querySelector('.ingredient-amount').value.trim()||null,
    unit:row.querySelector('.ingredient-unit').value.trim()||null,
    note:row.querySelector('.ingredient-note').value.trim()||null
  })).filter(i=>i.ingredient_name);
  const instructions=[...document.querySelectorAll('.instruction-row textarea')].map(x=>x.value.trim()).filter(Boolean);
  const tagIds=[...document.querySelectorAll('.tag-choice.selected')].map(x=>x.dataset.tag);
  return {
    name:f.elements.name.value.trim(),
    description:f.elements.description.value.trim()||null,
    cooking_category:f.elements.cooking_category.value,
    genre:f.elements.genre.value,
    instructions,
    is_favorite:f.elements.is_favorite.checked,
    make_again:f.elements.make_again.checked,
    memo:f.elements.memo.value.trim()||null,
    ingredients,tagIds
  };
}
async function saveRecipe(e){
  e.preventDefault();
  const p=formPayload();
  if(!p.name){toast('レシピ名を入力してください');return;}
  showLoading(true);
  try{
    let recipeId=state.editingId;
    const base={name:p.name,description:p.description,cooking_category:p.cooking_category,genre:p.genre,instructions:p.instructions,is_favorite:p.is_favorite,make_again:p.make_again,memo:p.memo};
    if(recipeId){
      const {error}=await supabase.from('recipes').update(base).eq('id',recipeId);
      if(error)throw error;
    } else {
      const {data,error}=await supabase.from('recipes').insert(base).select('id').single();
      if(error)throw error;
      recipeId=data.id;
    }
    const { error: ingredientDeleteError } = await supabase.from('recipe_ingredients').delete().eq('recipe_id',recipeId);
    if (ingredientDeleteError) throw ingredientDeleteError;
    if(p.ingredients.length){
      const {error}=await supabase.from('recipe_ingredients').insert(
        p.ingredients.map((x,i)=>({...x,recipe_id:recipeId,sort_order:i}))
      );
      if(error)throw error;
    }
    const { error: tagDeleteError } = await supabase.from('recipe_tags').delete().eq('recipe_id',recipeId);
    if (tagDeleteError) throw tagDeleteError;
    if(p.tagIds.length){
      const {error}=await supabase.from('recipe_tags').insert(p.tagIds.map(tag_id=>({recipe_id:recipeId,tag_id})));
      if(error)throw error;
    }
    await loadRecipes();
    state.detailId=recipeId;
    showView('detailView');
    await openDetail(recipeId);
    toast('保存しました');
  }catch(e){
    toast(`保存できませんでした: ${e.message}`);
  }finally{
    showLoading(false);
  }
}
async function openDetail(id){
  showLoading(true);
  state.detailId=id;
  try{
    const r=await fetchRecipe(id);
    renderDetail(r);
    showView('detailView');
  }catch(e){toast(e.message);}
  finally{showLoading(false);}
}
function renderDetail(r){
  const tags=recipeTags(r);
  const ingredients=r.recipe_ingredients||[];
  const instructions=Array.isArray(r.instructions)?r.instructions:[];
  $('recipeDetail').innerHTML=`<div class="detail-header"><h2>${esc(r.name)}</h2><p class="detail-description">${esc(r.description||'')}</p><div class="detail-meta"><span class="tag">${esc(r.cooking_category)}</span><span class="tag">${esc(r.genre)}</span>${tags.map(t=>`<span class="tag">${esc(t.name)}</span>`).join('')}</div><div class="detail-flags">${r.is_favorite?'★ お気に入り':''}${r.make_again?'　↻ また作りたい':''}</div></div>
    <section class="detail-section"><h3>材料</h3><ul class="ingredient-list">${ingredients.map(i=>`<li><span>${esc(i.ingredient_name)}</span><span>${esc([i.amount,i.unit].filter(Boolean).join(' '))}</span><span>${esc(i.note||'')}</span></li>`).join('')||'<li class="no-data">材料なし</li>'}</ul></section>
    <section class="detail-section"><h3>作り方</h3><ol class="instruction-list">${instructions.map(i=>`<li>${esc(i)}</li>`).join('')||'<li class="no-data">手順なし</li>'}</ol></section>
    ${r.memo?`<section class="detail-section"><h3>メモ</h3><div class="memo">${esc(r.memo)}</div></section>`:''}`;
}
async function deleteCurrentRecipe(){
  if(!state.detailId || !confirm('このレシピを削除しますか？')) return;
  showLoading(true);
  try{
    const {error}=await supabase.from('recipes').delete().eq('id',state.detailId);
    if(error)throw error;
    state.detailId=null;
    await loadRecipes();
    showView('listView');
    toast('削除しました');
  }catch(e){
    toast(`削除できませんでした: ${e.message}`);
  }finally{showLoading(false);}
}

/* STEP 3: Shopping */
async function openShopping() {
  showLoading(true);
  try {
    await loadShoppingData();
    showView('shoppingView');
  } catch(e) {
    toast(`買い物データを読み込めませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function ensureShoppingMaster() {
  const { data: existing, error: fetchError } = await supabase
    .from('shopping_master')
    .select('id')
    .limit(1);
  if (fetchError) throw fetchError;
  if (existing?.length) return;

  const defaults = DEFAULT_SHOPPING_MASTER.flatMap(([category, names], categoryIndex) =>
    names.map((name, index) => ({
      name, category, sort_order: categoryIndex * 100 + index
    }))
  );
  const { error } = await supabase
    .from('shopping_master')
    .upsert(defaults, { onConflict: 'user_id,name', ignoreDuplicates: true });
  if (error) throw error;
}

async function loadShoppingData() {
  await ensureShoppingMaster();
  const [{ data: master, error: masterError }, { data: list, error: listError }] = await Promise.all([
    supabase.from('shopping_master').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('shopping_list_items').select('*').order('created_at', { ascending: true })
  ]);
  if (masterError) throw masterError;
  if (listError) throw listError;
  state.shoppingMaster = master || [];
  state.shoppingList = list || [];
  for (const id of state.shoppingPendingChanges.keys()) {
    if (!state.shoppingList.some(item => item.id === id)) state.shoppingPendingChanges.delete(id);
  }
  renderShoppingMaster();
  renderShoppingList();
  updateShoppingPurchaseButton();
}

function renderShoppingMaster() {
  const selected = new Set(
    [...document.querySelectorAll('.shopping-master-check:checked')].map(input => input.dataset.id)
  );
  $('shoppingMaster').innerHTML = SHOPPING_CATEGORIES.map(category => {
    const items = state.shoppingMaster.filter(item => item.category === category);
    if (!items.length) return '';
    return `<section class="shopping-category">
      <h3>${esc(category)}</h3>
      <div class="shopping-master-items">
        ${items.map(item => `<div class="shopping-master-item-wrap">
          <label class="shopping-master-item">
            <input class="shopping-master-check" type="checkbox" data-id="${item.id}" ${selected.has(item.id)?'checked':''}>
            <span>${esc(item.name)}</span>
          </label>
          <button type="button" class="shopping-master-edit" data-id="${item.id}">編集</button>
          <button type="button" class="shopping-master-delete" data-id="${item.id}">削除</button>
        </div>`).join('')}
      </div>
    </section>`;
  }).join('');
  document.querySelectorAll('.shopping-master-edit').forEach(button => {
    button.onclick = () => editShoppingMasterItem(button.dataset.id);
  });
  document.querySelectorAll('.shopping-master-delete').forEach(button => {
    button.onclick = () => deleteShoppingMasterItem(button.dataset.id);
  });
}

async function addShoppingMasterItem(e) {
  e.preventDefault();
  const name = $('shoppingMasterInputName').value.trim();
  const category = $('shoppingMasterInputCategory').value;
  if (!name) {
    toast('商品名を入力してください');
    return;
  }
  if (state.shoppingMaster.some(item => item.name === name)) {
    toast('その商品はすでによく買うものに登録されています');
    return;
  }
  showLoading(true);
  try {
    const { error } = await supabase.from('shopping_master').insert({
      name, category, sort_order: state.shoppingMaster.length
    });
    if (error) throw error;
    $('shoppingMasterInputName').value = '';
    await loadShoppingData();
    toast('よく買うものに追加しました');
  } catch(e) {
    toast(`追加できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function editShoppingMasterItem(id) {
  const item = state.shoppingMaster.find(x => x.id === id);
  if (!item) return;
  const name = prompt('商品名を変更', item.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast('商品名を入力してください');
    return;
  }
  if (state.shoppingMaster.some(x => x.id !== id && x.name === trimmed)) {
    toast('同じ商品名がすでに登録されています');
    return;
  }
  showLoading(true);
  try {
    const { error } = await supabase.from('shopping_master')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await loadShoppingData();
    toast('変更しました');
  } catch(e) {
    toast(`変更できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function deleteShoppingMasterItem(id) {
  const item = state.shoppingMaster.find(x => x.id === id);
  if (!item || !confirm(`「${item.name}」をよく買うものから削除しますか？\n買い物リストには影響しません。`)) return;
  showLoading(true);
  try {
    const { error } = await supabase.from('shopping_master').delete().eq('id', id);
    if (error) throw error;
    await loadShoppingData();
    toast('よく買うものから削除しました');
  } catch(e) {
    toast(`削除できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function addSelectedShoppingItems() {
  const ids = [...document.querySelectorAll('.shopping-master-check:checked')].map(input => input.dataset.id);
  if (!ids.length) {
    toast('追加する商品を選択してください');
    return;
  }
  const selected = state.shoppingMaster.filter(item => ids.includes(item.id));
  const activeNames = new Set(
    state.shoppingList.filter(item => !item.is_purchased).map(item => item.name)
  );
  const rows = selected
    .filter(item => !activeNames.has(item.name))
    .map(item => ({
      master_id: item.id, name: item.name, category: item.category, is_purchased: false
    }));
  if (!rows.length) {
    toast('選択した商品はすでに買い物リストにあります');
    return;
  }
  showLoading(true);
  try {
    const { error } = await supabase.from('shopping_list_items').insert(rows);
    if (error) throw error;
    await loadShoppingData();
    toast(`${rows.length}件を買い物リストに追加しました`);
  } catch(e) {
    toast(`追加できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function addFreeShoppingItem(e) {
  e.preventDefault();
  const name = $('shoppingInputName').value.trim();
  const category = $('shoppingInputCategory').value;
  if (!name) {
    toast('商品名を入力してください');
    return;
  }
  if (state.shoppingList.some(item => !item.is_purchased && item.name === name)) {
    toast('その商品はすでに買い物リストにあります');
    return;
  }
  showLoading(true);
  try {
    const { error } = await supabase.from('shopping_list_items').insert({
      name, category, is_purchased: false
    });
    if (error) throw error;
    $('shoppingInputName').value = '';
    await loadShoppingData();
    toast('買い物リストに追加しました');
  } catch(e) {
    toast(`追加できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

function renderShoppingList() {
  const list = [...state.shoppingList].sort((a,b) => {
    if (a.is_purchased !== b.is_purchased) return a.is_purchased ? 1 : -1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  const visible = state.showPurchased ? list : list.filter(item => !item.is_purchased);
  const purchasedCount = list.filter(item => item.is_purchased).length;
  $('shoppingListSummary').textContent = list.length
    ? `${list.length}件（未購入 ${list.length - purchasedCount}件・購入済み ${purchasedCount}件）`
    : 'まだ商品がありません';
  if (!visible.length) {
    $('shoppingList').innerHTML = `<div class="empty">${list.length ? '購入済みの商品はありません。' : '買い物リストは空です。'}</div>`;
    updateShoppingPurchaseButton();
    return;
  }
  $('shoppingList').innerHTML = visible.map(item => {
    const pending = state.shoppingPendingChanges.get(item.id);
    const checked = pending !== undefined ? pending : item.is_purchased;
    return `
    <div class="shopping-list-item ${item.is_purchased ? 'purchased' : ''}">
      <label class="shopping-list-check">
        <input type="checkbox" class="purchase-check" data-id="${item.id}" ${checked?'checked':''}>
        <span>${esc(item.name)}</span>
      </label>
      <span class="shopping-list-category">${esc(item.category)}</span>
      <span class="shopping-purchased-date">${item.is_purchased && item.purchased_at ? `購入日 ${esc(formatPurchaseDate(item.purchased_at))}` : ''}</span>
      <button type="button" class="remove-button shopping-delete" data-id="${item.id}">削除</button>
    </div>`;
  }).join('');
  document.querySelectorAll('.shopping-delete').forEach(button => {
    button.onclick = () => deleteShoppingItem(button.dataset.id);
  });
  updateShoppingPurchaseButton();
}

async function deleteShoppingItem(id) {
  if (!confirm('この商品を買い物リストから削除しますか？')) return;
  showLoading(true);
  try {
    const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
    if (error) throw error;
    state.shoppingPendingChanges.delete(id);
    state.shoppingList = state.shoppingList.filter(item => item.id !== id);
    renderShoppingList();
    toast('削除しました');
  } catch(e) {
    toast(`削除できませんでした: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function init(){
  setupStaticUI();
  showLoading(true);
  try{
    await ensureAuth();
    await loadTags();
    await loadRecipes();
  }catch(e){
    console.error(e);
    toast(`初期化できませんでした: ${e.message}`);
  }finally{
    showLoading(false);
  }
}
init();
