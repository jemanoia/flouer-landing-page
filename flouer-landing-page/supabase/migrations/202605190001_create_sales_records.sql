create table if not exists public.sales_records (
  id bigint generated always as identity primary key,
  invoice_number text not null unique,
  invoice_created_at timestamptz not null,
  checkout_subtotal numeric(12,2) not null check (checkout_subtotal >= 0),
  line_items jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.sales_records is 'Stores completed checkout sales from the landing page storefront.';
comment on column public.sales_records.invoice_number is 'Client-generated invoice identifier shown to the user.';
comment on column public.sales_records.invoice_created_at is 'Original invoice creation timestamp from checkout flow.';
comment on column public.sales_records.checkout_subtotal is 'Subtotal amount at checkout in PHP.';
comment on column public.sales_records.line_items is 'Array of purchased line items (id, flavor, price, quantity, lineTotal).';
