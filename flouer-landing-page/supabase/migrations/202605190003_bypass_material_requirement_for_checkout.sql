create or replace function public.record_sale_and_adjust_inventory(
  p_invoice_number text,
  p_invoice_created_at timestamptz,
  p_checkout_subtotal numeric,
  p_line_items jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_number text;
  v_sales_record_id bigint;
  v_inventory_deducted_at timestamptz;
  v_inserted_item_count integer;
  v_payload_item_count integer;
  v_required_material_count integer;
  v_updated_material_count integer;
begin
  v_invoice_number := nullif(btrim(p_invoice_number), '');
  if v_invoice_number is null then
    raise exception 'Invoice number is required.';
  end if;

  if p_invoice_created_at is null then
    raise exception 'Invoice created timestamp is required.';
  end if;

  if p_checkout_subtotal is null or p_checkout_subtotal < 0 then
    raise exception 'Subtotal must be a non-negative amount.';
  end if;

  if p_line_items is null or jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) = 0 then
    raise exception 'Line items are required.';
  end if;

  v_payload_item_count := jsonb_array_length(p_line_items);

  insert into public.sales_records (
    invoice_number,
    invoice_created_at,
    checkout_subtotal,
    line_items
  )
  values (
    v_invoice_number,
    p_invoice_created_at,
    round(p_checkout_subtotal, 2),
    p_line_items
  )
  on conflict (invoice_number) do update
    set
      invoice_created_at = excluded.invoice_created_at,
      checkout_subtotal = excluded.checkout_subtotal,
      line_items = excluded.line_items
  returning id, inventory_deducted_at
  into v_sales_record_id, v_inventory_deducted_at;

  if v_inventory_deducted_at is not null then
    return v_sales_record_id;
  end if;

  delete from public.sales_record_items
  where sales_record_id = v_sales_record_id;

  insert into public.sales_record_items (
    sales_record_id,
    product_id,
    quantity,
    unit_price,
    line_total
  )
  select
    v_sales_record_id,
    p.id,
    parsed.quantity,
    round(parsed.price, 2),
    round(parsed.line_total, 2)
  from (
    select
      nullif(btrim(item.id), '') as product_id,
      item.quantity as quantity,
      item.price as price,
      item."lineTotal" as line_total
    from jsonb_to_recordset(p_line_items) as item(
      id text,
      quantity integer,
      price numeric,
      "lineTotal" numeric
    )
  ) parsed
  join public.products p on p.id = parsed.product_id and p.is_active = true
  where
    parsed.quantity > 0
    and parsed.price >= 0
    and parsed.line_total >= 0;

  select count(*)
  into v_inserted_item_count
  from public.sales_record_items
  where sales_record_id = v_sales_record_id;

  if v_inserted_item_count <> v_payload_item_count then
    raise exception 'One or more items are invalid or not mapped to active products.';
  end if;

  with required_materials as (
    select
      pmr.material_id,
      sum((sri.quantity::numeric) * pmr.quantity_per_unit)::numeric(14,3) as required_qty
    from public.sales_record_items sri
    join public.product_material_requirements pmr on pmr.product_id = sri.product_id
    where sri.sales_record_id = v_sales_record_id
    group by pmr.material_id
  )
  select count(*)
  into v_required_material_count
  from required_materials;

  -- Temporary bypass: allow checkout records to persist even when no BOM exists yet.
  if v_required_material_count = 0 then
    return v_sales_record_id;
  end if;

  with required_materials as (
    select
      pmr.material_id,
      sum((sri.quantity::numeric) * pmr.quantity_per_unit)::numeric(14,3) as required_qty
    from public.sales_record_items sri
    join public.product_material_requirements pmr on pmr.product_id = sri.product_id
    where sri.sales_record_id = v_sales_record_id
    group by pmr.material_id
  ),
  updated_inventory as (
    update public.inventory_materials im
    set stock_on_hand = im.stock_on_hand - rm.required_qty
    from required_materials rm
    where im.id = rm.material_id
      and im.stock_on_hand >= rm.required_qty
    returning im.id
  )
  select count(*)
  into v_updated_material_count
  from updated_inventory;

  -- Temporary bypass: do not fail checkout when inventory is not fully configured yet.
  if v_updated_material_count <> v_required_material_count then
    return v_sales_record_id;
  end if;

  update public.sales_records
  set inventory_deducted_at = timezone('utc', now())
  where id = v_sales_record_id;

  return v_sales_record_id;
end;
$$;

comment on function public.record_sale_and_adjust_inventory(text, timestamptz, numeric, jsonb) is
  'Creates/updates sales record, stores normalized items, and attempts inventory deduction without blocking checkout.';
