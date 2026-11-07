-- Reapplying the seed preserves existing merchant settings and catalogue edits.
insert into public.audace_products (id,name,description,published)
values ('first-release-shirt','Stand-collar shirt',
  'A stand collar, three tonal fabric-loop fastenings and a small label at the lower hem.',true)
on conflict (id) do nothing;

with reference(id, slug, code, colour, sleeve, width, height, page, xref, sort_order) as (
  values
    ('audace-cr-ss','cream-short-sleeve','AUD-CR-SS','Cream','Short sleeve',742,764,1,19,1),
    ('audace-bk-ss','black-short-sleeve','AUD-BK-SS','Black','Short sleeve',742,764,2,23,2),
    ('audace-bg-ss','burgundy-short-sleeve','AUD-BG-SS','Burgundy','Short sleeve',742,764,3,27,3),
    ('audace-wh-ss','white-short-sleeve','AUD-WH-SS','White','Short sleeve',742,764,4,32,4),
    ('audace-cr-ls','cream-long-sleeve','AUD-CR-LS','Cream','Long sleeve',742,764,1,20,5),
    ('audace-bk-ls','black-long-sleeve','AUD-BK-LS','Black','Long sleeve',741,765,2,24,6),
    ('audace-bg-ls','burgundy-long-sleeve','AUD-BG-LS','Burgundy','Long sleeve',741,765,3,28,7)
), inserted as (
  insert into public.audace_variants (id,product_id,slug,code,colour,sleeve,sort_order,published)
  select id,'first-release-shirt',slug,code,colour,sleeve,sort_order,true from reference
  on conflict (id) do nothing returning id
)
insert into public.audace_images (variant_id,position,path,width,height,alt,label,source_page,source_xref)
select id,1,'/garments/' || slug || '.webp',width,height,colour || ' ' || lower(sleeve) || ' shirt, front view',
  'Front view',page,xref from reference
where id in (select id from inserted) or id in (select id from public.audace_variants)
on conflict (variant_id,position) do nothing;

insert into public.audace_settings (singleton) values (true) on conflict do nothing;
