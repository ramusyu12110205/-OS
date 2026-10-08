import { supabase } from './supabase.js?v=20261007-3';

const HOUSEHOLD_ID = '22222222-2222-2222-2222-222222222222';

function closePurchaseModal() {
  document.querySelectorAll('.sp-modal-backdrop').forEach(el => el.remove());
}

function getSelectedIds() {
  return [...document.querySelectorAll('#shoppingList .purchase-check:checked')]
    .map(el => el.dataset.id)
    .filter(Boolean);
}

async function getSelectedItems(ids, names) {
  if (ids.length) {
    const { data, error } = await supabase.from('shopping_list_items').select('*').in('id', ids);
    if (error) throw error;
    const map = new Map((data || []).map(item => [item.id, item]));
    return ids.map(id => map.get(id)).filter(Boolean);
  }
  if (!names.length) return [];
  const { data, error } = await supabase.from('shopping_list_items').select('*').in('name', names).eq('is_purchased', false).order('created_at');
  if (error) throw error;
  const used = new Set();
  return names.map(name => {
    const item = (data || []).find(x => x.name === name && !used.has(x.id));
    if (item) used.add(item.id);
    return item;
  }).filter(Boolean);
}

async function findOrCreateProduct(item, specification, unit) {
  const spec = specification || null;
  const un = unit || null;
  let q = supabase.from('shopping_products')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('name', item.name);
  q = spec === null ? q.is('specification', null) : q.eq('specification', spec);
  q = un === null ? q.is('unit', null) : q.eq('unit', un);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabase.from('shopping_products').insert({
    household_id: HOUSEHOLD_ID,
    name: item.name,
    category: item.category,
    specification: spec,
    unit: un
  }).select('*').single();
  if (createError) throw createError;
  return created;
}

async function savePurchaseDetails(button) {
  const modal = button.closest('.sp-modal-backdrop');
  if (!modal) return;

  const storeId = modal.querySelector('#spStoreSelect')?.value;
  if (!storeId) {
    alert('購入店舗を選択してください。');
    return;
  }

  const rows = [...modal.querySelectorAll('.sp-purchase-row')];
  const names = rows.map(row => row.querySelector('.sp-purchase-title')?.textContent.trim()).filter(Boolean);
  const ids = getSelectedIds();
  const items = await getSelectedItems(ids, names);

  if (items.length !== rows.length) {
    alert('購入対象の商品を取得できませんでした。買い物画面を再読み込みして、もう一度お試しください。');
    return;
  }

  const entries = rows.map((row, i) => ({
    item: items[i],
    price: row.querySelector('.sp-price')?.value ?? '',
    quantity: row.querySelector('.sp-quantity')?.value ?? '',
    unit: row.querySelector('.sp-unit')?.value ?? '',
    specification: row.querySelector('.sp-specification')?.value.trim() || null
  }));

  if (entries.some(x => x.price === '' || Number(x.price) < 0 || !x.quantity || Number(x.quantity) <= 0 || !x.unit)) {
    alert('価格・内容量・単位を確認してください。');
    return;
  }

  button.disabled = true;
  const now = new Date().toISOString();
  try {
    for (const entry of entries) {
      const product = await findOrCreateProduct(entry.item, entry.specification, entry.unit);
      const historyPayload = {
        shopping_list_item_id: entry.item.id,
        product_id: product.id,
        store_id: storeId,
        quantity: Number(entry.quantity),
        purchase_price: Number(entry.price),
        specification: entry.specification,
        unit: entry.unit,
        name: entry.item.name,
        category: entry.item.category,
        purchased_at: now
      };

      const { data: existing, error: findError } = await supabase.from('shopping_purchase_history')
        .select('id')
        .eq('shopping_list_item_id', entry.item.id)
        .maybeSingle();
      if (findError) throw findError;

      if (existing?.id) {
        const { error } = await supabase.from('shopping_purchase_history').update(historyPayload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shopping_purchase_history').insert(historyPayload);
        if (error) throw error;
      }

      const { error: listError } = await supabase.from('shopping_list_items').update({
        is_purchased: true,
        purchased_at: now,
        updated_at: now
      }).eq('id', entry.item.id);
      if (listError) throw listError;
    }

    closePurchaseModal();
    location.reload();
  } catch (error) {
    button.disabled = false;
    alert(`購入記録を保存できませんでした: ${error.message}`);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('#spPurchaseSave');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  savePurchaseDetails(button).catch(error => alert(`購入記録を保存できませんでした: ${error.message}`));
}, true);
