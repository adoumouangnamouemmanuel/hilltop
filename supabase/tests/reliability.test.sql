begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Never wake a real external push endpoint from a database test.
delete from private.settings where key='push_url';
insert into auth.users(id,email,raw_user_meta_data) values
 ('55555555-1111-1111-1111-111111111111','reliability@ashesi.edu.gh','{"full_name":"Reliability Student"}'),
 ('55555555-2222-2222-2222-222222222222','reliability-other@ashesi.edu.gh','{"full_name":"Other Student"}');
select set_config('test.profile',(select id::text from public.profiles where user_id='55555555-1111-1111-1111-111111111111'),true);
select set_config('test.fields','{"title":"Atomic draft","description":"Test","price":50,"original_price":null,"category":"hostel","condition":null,"attributes":{},"extra":[],"pickup":"Library","stock":null,"food":null,"move_out":false,"status":"draft"}',true);
insert into public.listings(id,seller_id,title,price,category,pickup,status)
 values('reliability-other',(select id from public.profiles where user_id='55555555-2222-2222-2222-222222222222'),'Other item',20,'hostel','Library','active');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-1111-1111-1111-111111111111","role":"authenticated"}',true);
select is(public.save_listing('reliability-atomic',current_setting('test.fields')::jsonb,array['https://example.com/photo.jpg']),1,'atomic listing creation returns revision');
select is(public.save_listing('reliability-atomic',current_setting('test.fields')::jsonb,array['https://example.com/photo.jpg']),1,'a lost creation response can be retried idempotently');
select throws_ok($$select public.save_listing('reliability-atomic',jsonb_set(current_setting('test.fields')::jsonb,'{title}','"Must roll back"'),array['javascript:bad'],1)$$,'23514',null,'invalid replacement photo aborts the whole save');
select is((select title from public.listings where id='reliability-atomic'),'Atomic draft','failed photo replacement rolls back listing changes');
select is((select url from public.listing_photos where listing_id='reliability-atomic'),'https://example.com/photo.jpg','failed replacement preserves the old photo');
select is(public.save_listing('reliability-atomic',jsonb_set(current_setting('test.fields')::jsonb,'{title}','"Updated draft"'),array['https://example.com/new.jpg'],1),2,'successful edit advances revision');
select throws_ok($$select public.save_listing('reliability-atomic',current_setting('test.fields')::jsonb,'{}'::text[],1)$$,'23514',null,'stale revision cannot overwrite a newer edit');
select throws_ok($$select public.save_listing('reliability-other',current_setting('test.fields')::jsonb,'{}'::text[],1)$$,'42501',null,'student cannot edit another seller listing');
select throws_ok($$select public.claim_push_deliveries()$$,'42501',null,'students cannot claim push deliveries or read device keys');
select throws_ok($$select * from public.push_deliveries$$,'42501',null,'students cannot read the outbox');
select ok(has_function_privilege('authenticated','public.answer_offer(uuid,text)','execute'),'students can call the authorized offer-answer RPC');
reset role;

insert into public.push_subscriptions(endpoint,profile_id,p256dh,auth)
 values('https://fcm.googleapis.com/reliability-test',current_setting('test.profile')::uuid,'test-key','test-auth');
insert into public.notifications(id,profile_id,kind,title,body,href)
 values('55555555-3333-3333-3333-333333333333',current_setting('test.profile')::uuid,'message','New message','Test','/inbox');
select is((select count(*)::int from public.push_deliveries where notification_id='55555555-3333-3333-3333-333333333333'),1,'notification creates a durable per-device job');
select is((select pushed_at from public.notifications where id='55555555-3333-3333-3333-333333333333'),null::timestamptz,'enqueue does not claim successful delivery');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('test.claim',public.claim_push_deliveries('55555555-3333-3333-3333-333333333333')::text,true);
select is(jsonb_array_length(current_setting('test.claim')::jsonb),1,'service claims a queued delivery');
select is(jsonb_array_length(public.claim_push_deliveries('55555555-3333-3333-3333-333333333333')),0,'a concurrent/replayed claim cannot take a leased job');
select public.finish_push_delivery((current_setting('test.claim')::jsonb->0->>'id')::uuid,gen_random_uuid(),204);
reset role;
select is((select completed_at from public.push_deliveries where notification_id='55555555-3333-3333-3333-333333333333'),null::timestamptz,'stale lease cannot acknowledge delivery');
set local role service_role;
select public.finish_push_delivery((current_setting('test.claim')::jsonb->0->>'id')::uuid,(current_setting('test.claim')::jsonb->0->>'lease')::uuid,503,120);
reset role;
select is((select completed_at from public.push_deliveries where notification_id='55555555-3333-3333-3333-333333333333'),null::timestamptz,'provider failure remains retryable');
select ok((select due_at >= now()+interval '120 seconds' from public.push_deliveries where notification_id='55555555-3333-3333-3333-333333333333'),'retry respects provider delay');
update public.push_deliveries set due_at=now() where notification_id='55555555-3333-3333-3333-333333333333';
set local role service_role;
select set_config('test.claim',public.claim_push_deliveries('55555555-3333-3333-3333-333333333333')::text,true);
select public.finish_push_delivery((current_setting('test.claim')::jsonb->0->>'id')::uuid,(current_setting('test.claim')::jsonb->0->>'lease')::uuid,201);
reset role;
select ok((select completed_at is not null from public.push_deliveries where notification_id='55555555-3333-3333-3333-333333333333'),'accepted push completes delivery');
select ok((select pushed_at is not null from public.notifications where id='55555555-3333-3333-3333-333333333333'),'only provider acceptance marks notification pushed');

update public.listings set views=views+1 where id='reliability-atomic';
select is((select revision from public.listings where id='reliability-atomic'),2,'view counters do not invalidate an open listing edit');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-1111-1111-1111-111111111111","role":"authenticated"}',true);
insert into public.orders(listing_id,quantity,payment_kind) values('reliability-other',1,'pickup');
select set_config('test.order',(select id from public.orders where listing_id='reliability-other'),true);
select set_config('test.dispute',public.open_dispute(current_setting('test.order'),'not-as-described','The item differs from its photos')::text,true);
select set_config('request.jwt.claims','{"sub":"55555555-2222-2222-2222-222222222222","role":"authenticated"}',true);
select lives_ok($$select public.add_dispute_message(current_setting('test.dispute')::uuid,'I can help resolve this')$$,'the other participant can reply to a case');
reset role;
select is((select count(*)::int from public.notifications where title='New dispute reply' and profile_id=current_setting('test.profile')::uuid),1,'a case reply notifies the other participant');
select is((select count(*)::int from public.notifications where title='New dispute reply' and profile_id<>current_setting('test.profile')::uuid),0,'the reply author does not receive their own alert');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ffffffff-ffff-ffff-ffff-ffffffffffff","role":"authenticated"}',true);
select throws_ok($$select public.add_dispute_message(current_setting('test.dispute')::uuid,'Unauthorized')$$,'42501',null,'a stranger cannot reply to the case');
reset role;
update public.disputes set state='withdrawn' where id=current_setting('test.dispute')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-2222-2222-2222-222222222222","role":"authenticated"}',true);
select throws_ok($$select public.add_dispute_message(current_setting('test.dispute')::uuid,'Too late')$$,'23514',null,'closed cases reject new replies');
reset role;
select * from finish();
rollback;
