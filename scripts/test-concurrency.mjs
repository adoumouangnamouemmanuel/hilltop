import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

// Deliberately fixed to the isolated local regression database, never a remote URL.
const exec = promisify(execFile);
const run = async (sql) =>
  (
    await exec("docker", [
      "exec",
      "supabase_db_hilltop",
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "hilltop_reliability_test",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      sql,
    ])
  ).stdout;
const seller = "99999999-1111-1111-1111-111111111111";
const buyerA = "99999999-2222-2222-2222-222222222222";
const buyerB = "99999999-3333-3333-3333-333333333333";
const session = `set local role authenticated; select set_config('request.jwt.claims','{"sub":"${seller}","role":"authenticated"}',true);`;
const fields = {
  title: "Concurrent draft",
  description: "Test",
  price: 100,
  original_price: null,
  category: "hostel",
  condition: null,
  attributes: {},
  extra: [],
  pickup: "Library",
  stock: null,
  food: null,
  move_out: false,
  status: "draft",
};
const cleanup = `delete from public.profiles where user_id in ('${seller}','${buyerA}','${buyerB}'); delete from auth.users where id in ('${seller}','${buyerA}','${buyerB}');`;

async function compete(first, second) {
  const a = run(`begin; ${session} ${first} select pg_sleep(1); commit;`);
  // Start B while A still holds its transaction locks.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const results = await Promise.allSettled([a, run(`begin; ${session} ${second} commit;`)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.doesNotMatch(String(rejected.reason.stderr), /deadlock|timeout/i);
  return String(rejected.reason.stderr);
}

try {
  await run(cleanup);
  await run(`delete from private.settings where key='push_url';
    insert into auth.users(id,email,raw_user_meta_data) values
    ('${seller}','concurrency-seller@ashesi.edu.gh','{"full_name":"Concurrent Seller"}'),
    ('${buyerA}','concurrency-a@ashesi.edu.gh','{"full_name":"Buyer A"}'),
    ('${buyerB}','concurrency-b@ashesi.edu.gh','{"full_name":"Buyer B"}');
    insert into public.listings(id,seller_id,title,price,category,pickup,status)
      select 'concurrency-item',id,'Concurrent item',100,'hostel','Library','active' from public.profiles where user_id='${seller}';
    insert into public.offers(id,listing_id,buyer_id,amount)
      select '99999999-4444-4444-4444-444444444444','concurrency-item',id,60 from public.profiles where user_id='${buyerA}';
    insert into public.offers(id,listing_id,buyer_id,amount)
      select '99999999-5555-5555-5555-555555555555','concurrency-item',id,70 from public.profiles where user_id='${buyerB}';`);
  assert.match(
    await compete(
      "select public.answer_offer('99999999-4444-4444-4444-444444444444','accepted');",
      "select public.answer_offer('99999999-5555-5555-5555-555555555555','accepted');",
    ),
    /already been answered/i,
  );
  assert.equal((await run("select count(*) from public.offers where listing_id='concurrency-item' and status='accepted'")).trim(), "1");
  console.log("PASS: concurrent offer answers serialize without deadlock; exactly one is accepted");
  await run(`insert into public.listings(id,seller_id,title,price,category,pickup,status)
    select 'concurrency-legacy',id,'Legacy item',100,'hostel','Library','active' from public.profiles where user_id='${seller}';
    insert into public.offers(id,listing_id,buyer_id,amount)
    select '99999999-6666-6666-6666-666666666666','concurrency-legacy',id,60 from public.profiles where user_id='${buyerA}';
    insert into public.offers(id,listing_id,buyer_id,amount)
    select '99999999-7777-7777-7777-777777777777','concurrency-legacy',id,70 from public.profiles where user_id='${buyerB}';`);
  assert.match(
    await compete(
      "update public.offers set status='accepted' where id='99999999-6666-6666-6666-666666666666';",
      "update public.offers set status='accepted' where id='99999999-7777-7777-7777-777777777777';",
    ),
    /already been answered/i,
  );
  console.log("PASS: legacy direct offer answers remain compatible and do not deadlock");

  await run(`begin; ${session} select public.save_listing('concurrency-draft','${JSON.stringify(fields)}','{}'); commit;`);
  const save = (title) => `select public.save_listing('concurrency-draft','${JSON.stringify({ ...fields, title })}','{}',1);`;
  assert.match(await compete(save("Edit A"), save("Edit B")), /changed on another device/i);
  assert.equal((await run("select revision from public.listings where id='concurrency-draft'")).trim(), "2");
  console.log("PASS: concurrent listing edits preserve the winner and reject the stale revision");
} finally {
  await run(cleanup);
}
