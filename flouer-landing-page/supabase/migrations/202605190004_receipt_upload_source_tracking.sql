alter table public.sales_records
  add column if not exists receipt_uploaded_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_records_receipt_uploaded_by_check'
  ) then
    alter table public.sales_records
      add constraint sales_records_receipt_uploaded_by_check
      check (receipt_uploaded_by is null or receipt_uploaded_by in ('user', 'owner'));
  end if;
end
$$;

comment on column public.sales_records.receipt_uploaded_by is
  'Identifies who uploaded the payment receipt: user (invoice page) or owner (POS/admin).';

update public.sales_records
set receipt_uploaded_by = 'owner'
where receipt_file_path is not null
  and receipt_uploaded_by is null;

create or replace function public.verify_sale_payment(
  p_invoice_number text,
  p_receipt_file_path text,
  p_receipt_content_type text,
  p_verified_by text default null,
  p_receipt_uploaded_by text default 'owner'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_number text;
  v_receipt_uploaded_by text;
  v_now timestamptz;
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

  v_receipt_uploaded_by := coalesce(nullif(lower(btrim(p_receipt_uploaded_by)), ''), 'owner');
  if v_receipt_uploaded_by not in ('user', 'owner') then
    raise exception 'Receipt uploader must be either user or owner.';
  end if;

  v_now := timezone('utc', now());

  update public.sales_records
  set
    receipt_file_path = btrim(p_receipt_file_path),
    receipt_content_type = btrim(p_receipt_content_type),
    receipt_uploaded_at = v_now,
    receipt_uploaded_by = v_receipt_uploaded_by,
    payment_status = case
      when v_receipt_uploaded_by = 'owner' then 'paid_verified'
      else 'pending_verification'
    end,
    payment_verified_at = case
      when v_receipt_uploaded_by = 'owner' then v_now
      else null
    end,
    payment_verified_by = case
      when v_receipt_uploaded_by = 'owner' then nullif(btrim(p_verified_by), '')
      else null
    end
  where invoice_number = v_invoice_number;

  if not found then
    raise exception 'Sales record with invoice % not found.', v_invoice_number;
  end if;
end;
$$;

comment on function public.verify_sale_payment(text, text, text, text, text) is
  'Stores receipt metadata and distinguishes whether the receipt was uploaded by a user or the owner.';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Allow receipt uploads from anon and authenticated'
  ) then
    create policy "Allow receipt uploads from anon and authenticated"
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'payment-receipts');
  end if;
end
$$;
