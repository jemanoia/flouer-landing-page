alter table public.sales_records
  add column if not exists payment_status text not null default 'pending_verification',
  add column if not exists receipt_file_path text,
  add column if not exists receipt_content_type text,
  add column if not exists receipt_uploaded_at timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by text,
  add column if not exists inventory_deducted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_records_payment_status_check'
  ) then
    alter table public.sales_records
      add constraint sales_records_payment_status_check
      check (payment_status in ('pending_verification', 'paid_verified', 'payment_rejected'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_records_paid_requires_receipt_check'
  ) then
    alter table public.sales_records
      add constraint sales_records_paid_requires_receipt_check
      check (
        payment_status <> 'paid_verified'
        or (receipt_file_path is not null and payment_verified_at is not null)
      );
  end if;
end
$$;

create index if not exists idx_sales_records_payment_status
  on public.sales_records (payment_status, created_at desc);

create table if not exists public.products (
  id text primary key,
  name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.products is 'Sellable product catalog used by checkout and sales records.';

insert into public.products (id, name, unit_price)
values
  ('product-01', 'Matcha Cheesecake', 55.00),
  ('product-02', 'Biscoff', 55.00),
  ('product-03', 'Red Velvet Cheesecake', 55.00),
  ('product-04', 'Chocolate Chip', 55.00)
on conflict (id) do update
set
  name = excluded.name,
  unit_price = excluded.unit_price;

create table if not exists public.inventory_materials (
  id bigint generated always as identity primary key,
  material_code text not null unique,
  material_name text not null,
  unit text not null,
  stock_on_hand numeric(14,3) not null default 0 check (stock_on_hand >= 0),
  reorder_level numeric(14,3),
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.inventory_materials is 'Raw ingredients and packaging inventory.';

create table if not exists public.product_material_requirements (
  product_id text not null references public.products(id) on delete cascade,
  material_id bigint not null references public.inventory_materials(id) on delete restrict,
  quantity_per_unit numeric(14,3) not null check (quantity_per_unit > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, material_id)
);

comment on table public.product_material_requirements is 'Bill of materials per product unit sold.';

create table if not exists public.sales_record_items (
  id bigint generated always as identity primary key,
  sales_record_id bigint not null references public.sales_records(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_sales_record_items_sales_record_product
  on public.sales_record_items (sales_record_id, product_id);

comment on table public.sales_record_items is 'Normalized product line items for each sale.';

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

  if v_required_material_count = 0 then
    raise exception 'No product material requirements configured for these products.';
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

  if v_updated_material_count <> v_required_material_count then
    raise exception 'Insufficient inventory to fulfill this order.';
  end if;

  update public.sales_records
  set inventory_deducted_at = timezone('utc', now())
  where id = v_sales_record_id;

  return v_sales_record_id;
end;
$$;

comment on function public.record_sale_and_adjust_inventory(text, timestamptz, numeric, jsonb) is
  'Creates/updates sales record, stores normalized items, and deducts inventory once per invoice.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.verify_sale_payment(
  p_invoice_number text,
  p_receipt_file_path text,
  p_receipt_content_type text,
  p_verified_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_number text;
begin
  v_invoice_number := nullif(btrim(p_invoice_number), '');
  if v_invoice_number is null then
    raise exception 'Invoice number is required.';
  end if;

  if nullif(btrim(p_receipt_file_path), '') is null then
    raise exception 'Receipt file path is required.';
  end if;

  if nullif(btrim(p_receipt_content_type), '') is null then
    raise exception 'Receipt content type is required.';
  end if;

  update public.sales_records
  set
    payment_status = 'paid_verified',
    receipt_file_path = btrim(p_receipt_file_path),
    receipt_content_type = btrim(p_receipt_content_type),
    receipt_uploaded_at = timezone('utc', now()),
    payment_verified_at = timezone('utc', now()),
    payment_verified_by = nullif(btrim(p_verified_by), '')
  where invoice_number = v_invoice_number;

  if not found then
    raise exception 'Sales record with invoice % not found.', v_invoice_number;
  end if;
end;
$$;

comment on function public.verify_sale_payment(text, text, text, text) is
  'Marks a sale as paid_verified and stores the uploaded receipt metadata.';
