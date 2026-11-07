-- Synthetic sizes, stock and delivery for disposable database tests only.
insert into auth.users(id) values
  ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003');
insert into public.audace_admins(user_id,role) values
  ('20000000-0000-4000-8000-000000000001','owner'),('20000000-0000-4000-8000-000000000002','operator');

update public.audace_variants set price_pesewas=39995 where id='audace-cr-ss';
update public.audace_variants set price_pesewas=54900 where id='audace-cr-ls';
update public.audace_variants set published=false where id='audace-bk-ls';
insert into public.audace_skus(id,variant_id,size,code) values
  ('30000000-0000-4000-8000-000000000001','audace-cr-ss','Fixture A','FIXTURE-CR-SS-A'),
  ('30000000-0000-4000-8000-000000000002','audace-cr-ss','Fixture B','FIXTURE-CR-SS-B'),
  ('30000000-0000-4000-8000-000000000003','audace-cr-ls','Fixture A','FIXTURE-CR-LS-A'),
  ('30000000-0000-4000-8000-000000000004','audace-cr-ls','Fixture B','FIXTURE-CR-LS-B'),
  ('30000000-0000-4000-8000-000000000005','audace-bk-ls','Fixture A','FIXTURE-BK-LS-A');
insert into public.audace_stock(sku_id,on_hand) values
  ('30000000-0000-4000-8000-000000000001',4),('30000000-0000-4000-8000-000000000002',2),
  ('30000000-0000-4000-8000-000000000003',2),('30000000-0000-4000-8000-000000000004',0),
  ('30000000-0000-4000-8000-000000000005',3);
insert into public.audace_delivery(id,region,label,fee_pesewas,active)
values ('10000000-0000-4000-8000-000000000001','Greater Accra','Fixture courier',1250,true);
