import { supabase, ensureAuth } from './supabase.js';

const CATEGORIES = ['主菜','副菜','汁物','主食','デザート','その他'];
const GENRES = ['和食','洋食','中華','韓国','エスニック','その他'];

const $ = (id) => document.getElementById(id);
const state = { recipes: [], tags: [], editingId: null, detailId: null };

function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function showLoading(v) { $('loading').classList.toggle('hidden', !v); }
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); setTimeout(() => $('toast').classList.add('hidden'), 2200); }
function showView(name) { ['listView','formView','detailView'].forEach(id => $(id).classList.toggle('hidden', id !== name)); window.scrollTo({top:0,behavior:'auto'}); }

function fillSelect(select, values, firstLabel='') {
  select.innerHTML = (firstLabel ? `<option value="">${esc(firstLabel)}</option>` : '') + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

function setupStaticUI() {
  fillSelect($('categoryFilter'), CATEGORIES, '主カテゴリすべて');
  fillSelect($('genreFilter'), GENRES, 'ジャンルすべて');
  fillSelect($('formCategory'), CATEGORIES);
  fillSelect($('formGenre'), GENRES);
  $('newRecipeButton').onclick = () => openForm();
  $('backFromForm').onclick = $('cancelForm').onclick = () => showView('listView');
  $('backFromDetail').onclick = () => showView('listView');
  $('addIngredient').onclick = () => addIngredientRow();
  $('addInstruction').onclick = () => addInstructionRow();
  $('recipeForm').onsubmit = saveRecipe;
  $('searchInput').oninput = renderList;
  $('categoryFilter').onchange = renderList;
  $('genreFilter').onchange = renderList;
  $('tagFilter').onchange = renderList;
  $('favoriteFilter').onchange = renderList;
  $('editRecipe').onclick = () => state.detailId && openForm(state.detailId);
  $('deleteRecipe').onclick = deleteCurrentRecipe;
}

async function loadTags() {
  const { data, error } = await supabase.from('tags').select('id,name').order('name');
  if (error) throw error;
  state.tags = data || [];
  fillSelect($('tagFilter'), state.tags.map(t => t.name), 'タグすべて');
}

async function loadRecipes() {
  const { data, error } = await supabase.from('recipes').select('*, recipe_ingredients(*), recipe_tags(tag_id, tags(id,name))').order('updated_at',{ascending:false});
  if (error) throw error;
  state.recipes = data || [];
  renderList();
}

function recipeTags(recipe) { return (recipe.recipe_tags || []).map(x => x.tags).filter(Boolean); }
function ingredientSearchText(recipe) { return (recipe.recipe_ingredients || []).map(i => i.ingredient_name).join(' '); }

function renderList() {
  const q = $('searchInput').value.trim().toLowerCase();
  const category = $('categoryFilter').value;
  const genre = $('genreFilter').value;
  const tag = $('tagFilter').value;
  const fav = $('favoriteFilter').checked;
  const filtered = state.recipes.filter(r => {
    const tags = recipeTags(r).map(t => t.name);
    return (!q || `${r.name} ${ingredientSearchText(r)}`.toLowerCase().includes(q)) &&
      (!category || r.cooking_category === category) && (!genre || r.genre === genre) &&
      (!tag || tags.includes(tag)) && (!fav || r.is_favorite);
  });
  if (!filtered.length) { $('recipeList').innerHTML = `<div class="empty">レシピがありません。<br>「＋ レシピ登録」から登録できます。</div>`; return; }
  $('recipeList').innerHTML = filtered.map(r => `
    <article class="recipe-item" data-id="${r.id}">
      <div class="recipe-item-top"><div><h3>${esc(r.name)}</h3><div class="meta">${esc(r.cooking_category)} ・ ${esc(r.genre)}</div></div><div class="favorite">${r.is_favorite ? '★' : ''}</div></div>
      ${r.description ? `<p class="meta">${esc(r.description)}</p>` : ''}
      <div class="tags">${recipeTags(r).map(t => `<span class="tag">${esc(t.name)}</span>`).join('')}</div>
    </article>`).join('');
  document.querySelectorAll('.recipe-item').forEach(el => el.onclick = () => openDetail(el.dataset.id));
}

function resetIngredientRows(items=[{}]) { $('ingredientRows').innerHTML=''; items.forEach(i => addIngredientRow(i)); }
function addIngredientRow(item={}) {
  const row = document.createElement('div'); row.className='ingredient-row';
  row.innerHTML = `<input class="ingredient-name" placeholder="材料名" value="${esc(item.ingredient_name||'')}"><input class="ingredient-amount" placeholder="分量" value="${esc(item.amount||'')}"><input class="ingredient-unit" placeholder="単位" value="${esc(item.unit||'')}"><input class="ingredient-note" placeholder="メモ（下味など）" value="${esc(item.note||'')}"><button type="button" class="remove-button">削除</button>`;
  row.querySelector('.remove-button').onclick=()=>{ row.remove(); if(!$('ingredientRows').children.length) addIngredientRow(); };
  $('ingredientRows').appendChild(row);
}
function resetInstructionRows(items=['']) { $('instructionRows').innerHTML=''; items.forEach(i => addInstructionRow(i)); }
function addInstructionRow(text='') {
  const row=document.createElement('div'); row.className='instruction-row';
  row.innerHTML=`<span class="instruction-number"></span><textarea rows="2" placeholder="作り方を入力">${esc(text)}</textarea><button type="button" class="remove-button">削除</button>`;
  row.querySelector('.remove-button').onclick=()=>{row.remove(); renumberInstructions();}; $('instructionRows').appendChild(row); renumberInstructions();
}
function renumberInstructions(){ [...$('instructionRows').children].forEach((row,i)=>row.querySelector('.instruction-number').textContent=i+1); }

function renderTagChoices(selected=[]) {
  $('tagChoices').innerHTML=state.tags.map(t=>`<button type="button" class="tag-choice ${selected.includes(t.id)?'selected':''}" data-tag="${t.id}">${esc(t.name)}</button>`).join('');
  document.querySelectorAll('.tag-choice').forEach(b=>b.onclick=()=>b.classList.toggle('selected'));
}

async function openForm(id=null) {
  state.editingId=id; $('formTitle').textContent=id?'レシピ編集':'レシピ登録';
  if (!id) {
    $('recipeForm').reset(); resetIngredientRows(); resetInstructionRows(); renderTagChoices([]); showView('formView'); return;
  }
  showLoading(true);
  try {
    const r=state.recipes.find(x=>x.id===id) || await fetchRecipe(id);
    $('recipeForm').elements.name.value=r.name||''; $('recipeForm').elements.description.value=r.description||''; $('formCategory').value=r.cooking_category; $('formGenre').value=r.genre; $('recipeForm').elements.is_favorite.checked=!!r.is_favorite; $('recipeForm').elements.make_again.checked=!!r.make_again; $('recipeForm').elements.memo.value=r.memo||'';
    resetIngredientRows(r.recipe_ingredients||[]); resetInstructionRows(Array.isArray(r.instructions)?r.instructions:[]); renderTagChoices(recipeTags(r).map(t=>t.id)); showView('formView');
  } catch(e){ toast(e.message); } finally { showLoading(false); }
}

async function fetchRecipe(id){ const {data,error}=await supabase.from('recipes').select('*, recipe_ingredients(*), recipe_tags(tag_id, tags(id,name))').eq('id',id).single(); if(error)throw error; return data; }

function formPayload(){
  const f=$('recipeForm');
  const ingredients=[...document.querySelectorAll('.ingredient-row')].map(row=>({ingredient_name:row.querySelector('.ingredient-name').value.trim(),amount:row.querySelector('.ingredient-amount').value.trim()||null,unit:row.querySelector('.ingredient-unit').value.trim()||null,note:row.querySelector('.ingredient-note').value.trim()||null})).filter(i=>i.ingredient_name);
  const instructions=[...document.querySelectorAll('.instruction-row textarea')].map(x=>x.value.trim()).filter(Boolean);
  const tagIds=[...document.querySelectorAll('.tag-choice.selected')].map(x=>x.dataset.tag);
  return {name:f.elements.name.value.trim(),description:f.elements.description.value.trim()||null,cooking_category:f.elements.cooking_category.value,genre:f.elements.genre.value,instructions,is_favorite:f.elements.is_favorite.checked,make_again:f.elements.make_again.checked,memo:f.elements.memo.value.trim()||null,ingredients,tagIds};
}

async function saveRecipe(e){
  e.preventDefault(); const p=formPayload(); if(!p.name){toast('レシピ名を入力してください');return;} showLoading(true);
  try{
    let recipeId=state.editingId;
    const base={name:p.name,description:p.description,cooking_category:p.cooking_category,genre:p.genre,instructions:p.instructions,is_favorite:p.is_favorite,make_again:p.make_again,memo:p.memo};
    if(recipeId){const {error}=await supabase.from('recipes').update(base).eq('id',recipeId);if(error)throw error;} else {const {data,error}=await supabase.from('recipes').insert(base).select('id').single();if(error)throw error;recipeId=data.id;}
    const { error: ingredientDeleteError } = await supabase.from('recipe_ingredients').delete().eq('recipe_id',recipeId);
    if (ingredientDeleteError) throw ingredientDeleteError;
    if(p.ingredients.length){const {error}=await supabase.from('recipe_ingredients').insert(p.ingredients.map((x,i)=>({...x,recipe_id:recipeId,sort_order:i})));if(error)throw error;}
    const { error: tagDeleteError } = await supabase.from('recipe_tags').delete().eq('recipe_id',recipeId);
    if (tagDeleteError) throw tagDeleteError;
    if(p.tagIds.length){const {error}=await supabase.from('recipe_tags').insert(p.tagIds.map(tag_id=>({recipe_id:recipeId,tag_id})));if(error)throw error;}
    await loadRecipes(); state.detailId=recipeId; showView('detailView'); await openDetail(recipeId); toast('保存しました');
  }catch(e){toast(`保存できませんでした: ${e.message}`);}finally{showLoading(false);}
}

async function openDetail(id){
  showLoading(true); state.detailId=id;
  try{const r=await fetchRecipe(id); renderDetail(r); showView('detailView');}catch(e){toast(e.message);}finally{showLoading(false);}
}
function renderDetail(r){
  const tags=recipeTags(r); const ingredients=r.recipe_ingredients||[]; const instructions=Array.isArray(r.instructions)?r.instructions:[];
  $('recipeDetail').innerHTML=`<div class="detail-header"><h2>${esc(r.name)}</h2><p class="detail-description">${esc(r.description||'')}</p><div class="detail-meta"><span class="tag">${esc(r.cooking_category)}</span><span class="tag">${esc(r.genre)}</span>${tags.map(t=>`<span class="tag">${esc(t.name)}</span>`).join('')}</div><div class="detail-flags">${r.is_favorite?'★ お気に入り':''}${r.make_again?'　↻ また作りたい':''}</div></div>
    <section class="detail-section"><h3>材料</h3><ul class="ingredient-list">${ingredients.map(i=>`<li><span>${esc(i.ingredient_name)}</span><span>${esc([i.amount,i.unit].filter(Boolean).join(' '))}</span><span>${esc(i.note||'')}</span></li>`).join('')||'<li class="no-data">材料なし</li>'}</ul></section>
    <section class="detail-section"><h3>作り方</h3><ol class="instruction-list">${instructions.map(i=>`<li>${esc(i)}</li>`).join('')||'<li class="no-data">手順なし</li>'}</ol></section>
    ${r.memo?`<section class="detail-section"><h3>メモ</h3><div class="memo">${esc(r.memo)}</div></section>`:''}`;
}

async function deleteCurrentRecipe(){
  if(!state.detailId || !confirm('このレシピを削除しますか？')) return; showLoading(true);
  try{const {error}=await supabase.from('recipes').delete().eq('id',state.detailId);if(error)throw error;state.detailId=null;await loadRecipes();showView('listView');toast('削除しました');}catch(e){toast(`削除できませんでした: ${e.message}`);}finally{showLoading(false);}
}

async function init(){
  setupStaticUI(); showLoading(true);
  try{await ensureAuth();await loadTags();await loadRecipes();}catch(e){console.error(e);toast(`初期化できませんでした: ${e.message}`);}finally{showLoading(false);}
}
init();
