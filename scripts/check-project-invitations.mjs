// Disposable PostgreSQL integration checks. Never connects to Supabase or uses
// application credentials. Install the optional harness outside the repository;
// see docs/邀请加入项目实现与验证.md for the command.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const toolsDir = process.env.KANBAN_DB_TEST_TOOLS;
if (!toolsDir)
  throw new Error(
    "Set KANBAN_DB_TEST_TOOLS to the external embedded-postgres installation directory.",
  );
const requireTools = createRequire(join(resolve(toolsDir), "package.json"));
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(requireTools.resolve("embedded-postgres"))
);
const { Client } = requireTools("pg");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = await mkdtemp(join(tmpdir(), "kanban-invite-check-"));
const server = createServer();
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
await new Promise((done) => server.close(done));
const password = randomUUID();
const cluster = new EmbeddedPostgres({
  databaseDir: join(directory, "data"),
  port,
  user: "postgres",
  password,
  persistent: true,
  createPostgresUser: false,
  postgresFlags: [
    "-h",
    "127.0.0.1",
    "-c",
    "log_statement=none",
    "-c",
    "log_min_error_statement=panic",
  ],
  onLog: () => {},
  onError: () => {},
});
const connections = new Set();
let passed = 0;
let currentCheck = "startup";
const ids = Object.fromEntries(
  ["owner", "member", "admin", "new", "other", "racer1", "racer2"].map(
    (name) => [name, randomUUID()],
  ),
);
const sha = (token) => createHash("sha256").update(token).digest("hex");
const storedHash = (token) => sha(sha(token));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

async function connection() {
  const client = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
  });
  await client.connect();
  connections.add(client);
  return client;
}
async function beginAs(user, role = "authenticated") {
  const client = await connection();
  await client.query(`begin; set local role ${role}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    user ?? "",
  ]);
  return client;
}
async function asUser(user, fn, role = "authenticated") {
  const client = await beginAs(user, role);
  try {
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
    connections.delete(client);
  }
}
async function rejected(fn, code) {
  await assert.rejects(fn, (error) => error.code === code);
}
async function check(label, fn) {
  currentCheck = label;
  await fn();
  passed++;
  console.log(`PASS ${label}`);
}
const createProject = (user, name) =>
  asUser(
    user,
    async (c) =>
      (await c.query("select * from public.create_project($1)", [name])).rows[0]
        .id,
  );
const invite = (user, project) =>
  asUser(
    user,
    async (c) =>
      (
        await c.query("select * from public.create_project_invitation($1)", [
          project,
        ])
      ).rows[0],
  );
const redeem = (user, token) =>
  asUser(
    user,
    async (c) =>
      (
        await c.query("select * from public.redeem_project_invitation($1)", [
          sha(token),
        ])
      ).rows[0].project_id,
  );
const snapshotSql = `select jsonb_build_object(
  'projects', (select jsonb_agg(to_jsonb(p) order by p.id) from public.projects p),
  'members', (select jsonb_agg(to_jsonb(m) order by m.project_id,m.user_id) from public.project_members m),
  'tasks', (select jsonb_agg(to_jsonb(t) order by t.id) from public.tasks t),
  'comments', (select jsonb_agg(to_jsonb(c) order by c.id) from public.comments c),
  'profiles', (select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p),
  'admins', (select jsonb_agg(to_jsonb(a) order by a.user_id) from private.system_admins a)
) snapshot`;

try {
  await cluster.initialise();
  await cluster.start();
  const db = await connection();
  console.log((await db.query("select version() version")).rows[0].version);
  // Minimal Supabase Auth contract; JWT verification and PostgREST are not
  // simulated. RLS runs under real, non-superuser authenticated/anon roles.
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create extension pgcrypto with schema extensions;
    grant usage on schema extensions to authenticated;`);
  const migrationsDir = join(root, "supabase", "migrations");
  const migrations = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const target = migrations.find((name) =>
    name.endsWith("_invite_only_project_membership.sql"),
  );
  assert.ok(target, "Invitation migration is missing");
  for (const name of migrations.filter((name) => name < target)) {
    await db.query(await readFile(join(migrationsDir, name), "utf8"));
  }
  for (const id of Object.values(ids))
    await db.query("insert into auth.users values ($1)", [id]);
  const project = await createProject(ids.owner, "Existing project");
  const isolated = await createProject(ids.other, "Unrelated project");
  await asUser(ids.member, (c) =>
    c.query(
      "insert into public.project_members(project_id,user_id) values ($1,$2)",
      [project, ids.member],
    ),
  );
  await db.query("insert into private.system_admins(user_id) values ($1)", [
    ids.admin,
  ]);
  await db.query(
    "insert into public.profiles(id,display_name) values ($1,'Owner'),($2,'Member')",
    [ids.owner, ids.member],
  );
  const task = (
    await db.query(
      "insert into public.tasks(project_id,title,created_by) values ($1,'Preserved task',$2) returning id",
      [project, ids.owner],
    )
  ).rows[0].id;
  await db.query(
    "insert into public.comments(task_id,author_id,content) values ($1,$2,'Preserved comment')",
    [task, ids.member],
  );
  const before = (await db.query(snapshotSql)).rows[0].snapshot;
  await check(
    "migration executes and preserves every existing business/admin row",
    async () => {
      await db.query("begin");
      await db.query(await readFile(join(migrationsDir, target), "utf8"));
      await db.query("commit");
      assert.deepEqual((await db.query(snapshotSql)).rows[0].snapshot, before);
    },
  );
  await check(
    "private invitation hashes have RLS, no policies and no client grants",
    async () => {
      const row = (
        await db.query(`select c.relrowsecurity rls,
      (select count(*)::int from pg_policies where schemaname='private' and tablename='project_invitations') policies,
      has_table_privilege('authenticated','private.project_invitations','select,insert,update,delete') auth_access,
      has_table_privilege('anon','private.project_invitations','select,insert,update,delete') anon_access,
      has_table_privilege('service_role','private.project_invitations','select,insert,update,delete') service_access
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='project_invitations'`)
      ).rows[0];
      assert.deepEqual(row, {
        rls: true,
        policies: 0,
        auth_access: false,
        anon_access: false,
        service_access: false,
      });
      await rejected(
        () =>
          asUser(ids.owner, (c) =>
            c.query("select * from private.project_invitations"),
          ),
        "42501",
      );
      await rejected(
        () =>
          asUser(ids.admin, (c) =>
            c.query("select * from private.project_invitations"),
          ),
        "42501",
      );
    },
  );
  await check(
    "RPC execute grants and private definer search paths are restricted",
    async () => {
      for (const fn of [
        "public.create_project(text)",
        "public.can_invite_to_project(uuid)",
        "public.create_project_invitation(uuid)",
        "public.redeem_project_invitation(text)",
        "private.create_project(text)",
        "private.create_project_invitation(uuid)",
        "private.redeem_project_invitation(text)",
      ]) {
        const row = (
          await db.query(
            "select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') auth, has_function_privilege('service_role',$1,'execute') service",
            [fn],
          )
        ).rows[0];
        assert.deepEqual(row, { anon: false, auth: true, service: false });
      }
      const definers = (
        await db.query(
          "select proconfig from pg_proc where oid in ('private.create_project(text)'::regprocedure,'private.create_project_invitation(uuid)'::regprocedure,'private.redeem_project_invitation(text)'::regprocedure) and prosecdef",
        )
      ).rows;
      assert.equal(definers.length, 3);
      for (const row of definers)
        assert.ok(row.proconfig.some((value) => value === 'search_path=""'));
    },
  );
  await check(
    "anonymous and missing-identity invitation calls are rejected",
    async () => {
      await rejected(
        () =>
          asUser(
            null,
            (c) =>
              c.query("select * from public.create_project_invitation($1)", [
                project,
              ]),
            "anon",
          ),
        "42501",
      );
      await rejected(
        () =>
          asUser(
            null,
            (c) =>
              c.query("select * from public.redeem_project_invitation($1)", [
                "0".repeat(64),
              ]),
            "anon",
          ),
        "42501",
      );
      await rejected(() => invite(null, project), "42501");
      await rejected(() => redeem(null, "a".repeat(64)), "42501");
    },
  );
  await check(
    "ordinary nonmembers cannot discover projects, tasks, comments or members",
    async () => {
      await asUser(ids.new, async (c) => {
        for (const sql of [
          "select id,name from public.projects",
          "select * from public.tasks",
          "select * from public.comments",
          "select project_id,user_id,role from public.project_members",
        ])
          assert.equal((await c.query(sql)).rowCount, 0);
        assert.equal(
          (
            await c.query("select id,name from public.projects where id=$1", [
              project,
            ])
          ).rowCount,
          0,
        );
      });
      await rejected(
        () =>
          asUser(
            null,
            (c) => c.query("select id,name from public.projects"),
            "anon",
          ),
        "42501",
      );
    },
  );
  await check(
    "direct member/owner self-join and orphan project insertion are denied",
    async () => {
      for (const role of ["member", "owner"])
        await rejected(
          () =>
            asUser(ids.new, (c) =>
              c.query(
                "insert into public.project_members(project_id,user_id,role) values ($1,$2,$3)",
                [project, ids.new, role],
              ),
            ),
          "42501",
        );
      await rejected(
        () =>
          asUser(ids.owner, (c) =>
            c.query(
              "insert into public.project_members(project_id,user_id,role) values ($1,$2,'owner')",
              [project, ids.owner],
            ),
          ),
        "42501",
      );
      await rejected(
        () =>
          asUser(ids.new, (c) =>
            c.query(
              "insert into public.projects(name,created_by) values ('Orphan',$1)",
              [ids.new],
            ),
          ),
        "42501",
      );
      assert.equal(
        (
          await db.query(
            "select to_regprocedure('public.join_project(uuid)') legacy_join, to_regprocedure('public.list_joinable_projects()') legacy_list",
          )
        ).rows[0].legacy_join,
        null,
      );
      assert.equal(
        (
          await db.query(
            "select to_regprocedure('public.list_joinable_projects()') legacy_list",
          )
        ).rows[0].legacy_list,
        null,
      );
    },
  );
  await check(
    "new project and owner relation are atomic and immediately readable",
    async () => {
      const created = await createProject(ids.new, "New owner project");
      await asUser(ids.new, async (c) => {
        assert.equal(
          (
            await c.query(
              "select role from public.project_members where project_id=$1 and user_id=$2",
              [created, ids.new],
            )
          ).rows[0].role,
          "owner",
        );
        assert.equal(
          (
            await c.query("select id,name from public.projects where id=$1", [
              created,
            ])
          ).rowCount,
          1,
        );
      });
      // Force the second write to fail; the first project write must roll back.
      await db.query(`create function public.test_fail_membership() returns trigger language plpgsql as $$ begin
      if exists(select 1 from public.projects p where p.id=new.project_id and p.name='__atomic_failure__') then raise exception 'Test membership failure'; end if;
      return new; end; $$;
      create trigger test_fail_membership before insert on public.project_members for each row execute function public.test_fail_membership();`);
      await rejected(
        () => createProject(ids.new, "__atomic_failure__"),
        "P0001",
      );
      assert.equal(
        (
          await db.query(
            "select id from public.projects where name='__atomic_failure__'",
          )
        ).rowCount,
        0,
      );
      await db.query(
        "drop trigger test_fail_membership on public.project_members; drop function public.test_fail_membership()",
      );
    },
  );
  await check(
    "existing owner/member access and admin nonmember access remain available",
    async () => {
      for (const actor of [ids.owner, ids.member, ids.admin])
        await asUser(actor, async (c) => {
          assert.equal(
            (
              await c.query("select id,name from public.projects where id=$1", [
                project,
              ])
            ).rowCount,
            1,
          );
          assert.equal(
            (await c.query("select * from public.tasks where id=$1", [task]))
              .rowCount,
            1,
          );
          assert.equal(
            (
              await c.query("select * from public.comments where task_id=$1", [
                task,
              ])
            ).rowCount,
            1,
          );
        });
      await asUser(ids.member, async (c) =>
        assert.equal(
          (
            await c.query("select id,name from public.projects where id=$1", [
              isolated,
            ])
          ).rowCount,
          0,
        ),
      );
      assert.equal(
        (
          await db.query(
            "select 1 from public.project_members where project_id=$1 and user_id=$2",
            [project, ids.admin],
          )
        ).rowCount,
        0,
      );
    },
  );
  await check(
    "member and nonmember cannot generate invitations or claim invitation permission",
    async () => {
      for (const actor of [ids.member, ids.new]) {
        assert.equal(
          await asUser(
            actor,
            async (c) =>
              (
                await c.query(
                  "select public.can_invite_to_project($1) allowed",
                  [project],
                )
              ).rows[0].allowed,
          ),
          false,
        );
        await rejected(() => invite(actor, project), "42501");
      }
    },
  );
  let invitation;
  await check(
    "owner/admin generate independent 256-bit tokens, hashes only, fixed 24-hour expiry",
    async () => {
      invitation = await invite(ids.owner, project);
      const adminInvitation = await invite(ids.admin, project);
      assert.ok(/^[0-9a-f]{64}$/.test(invitation.token));
      assert.ok(invitation.token !== adminInvitation.token);
      const row = (
        await db.query(
          "select encode(token_hash,'hex') hash, extract(epoch from expires_at-created_at)::int seconds from private.project_invitations where token_hash=decode($1,'hex')",
          [storedHash(invitation.token)],
        )
      ).rows[0];
      assert.equal(row.hash, storedHash(invitation.token));
      assert.equal(row.seconds, 86400);
      assert.ok(
        !(
          await db.query(
            "select column_name from information_schema.columns where table_schema='private' and table_name='project_invitations'",
          )
        ).rows.some((r) => r.column_name === "token"),
      );
      for (const actor of [ids.owner, ids.admin])
        assert.equal(
          await asUser(
            actor,
            async (c) =>
              (
                await c.query(
                  "select public.can_invite_to_project($1) allowed",
                  [project],
                )
              ).rows[0].allowed,
          ),
          true,
        );
    },
  );
  await check(
    "already joined owner and member enter without consuming invitation",
    async () => {
      for (const actor of [ids.owner, ids.member])
        assert.equal(await redeem(actor, invitation.token), project);
      assert.equal(
        (
          await db.query(
            "select consumed_at from private.project_invitations where token_hash=decode($1,'hex')",
            [storedHash(invitation.token)],
          )
        ).rows[0].consumed_at,
        null,
      );
    },
  );
  await check(
    "valid redemption joins only the current identity as member and consumes once",
    async () => {
      assert.equal(await redeem(ids.new, invitation.token), project);
      const row = (
        await db.query(
          "select role from public.project_members where project_id=$1 and user_id=$2",
          [project, ids.new],
        )
      ).rows[0];
      assert.equal(row.role, "member");
      assert.equal(
        (
          await db.query(
            "select consumed_by from private.project_invitations where token_hash=decode($1,'hex')",
            [storedHash(invitation.token)],
          )
        ).rows[0].consumed_by,
        ids.new,
      );
      await asUser(ids.new, async (c) => {
        assert.equal(
          (
            await c.query("select id,name from public.projects where id=$1", [
              project,
            ])
          ).rowCount,
          1,
        );
        assert.equal(
          (await c.query("select * from public.tasks where id=$1", [task]))
            .rowCount,
          1,
        );
        await c.query(
          "insert into public.tasks(project_id,title,created_by) values ($1,'Invited member task',$2)",
          [project, ids.new],
        );
      });
    },
  );
  await check(
    "repeat member visit is harmless; different new user cannot reuse consumed invitation",
    async () => {
      assert.equal(await redeem(ids.new, invitation.token), project);
      await rejected(() => redeem(ids.other, invitation.token), "P0001");
      assert.equal(
        (
          await db.query(
            "select 1 from public.project_members where project_id=$1 and user_id=$2",
            [project, ids.other],
          )
        ).rowCount,
        0,
      );
    },
  );
  await check(
    "forged and malformed digests are rejected without creating memberships",
    async () => {
      await rejected(() => redeem(ids.other, "0".repeat(64)), "P0001");
      await rejected(
        () =>
          asUser(ids.other, (c) =>
            c.query("select * from public.redeem_project_invitation($1)", [
              "bad",
            ]),
          ),
        "P0001",
      );
    },
  );
  await check(
    "stored database hashes cannot be used as redemption credentials",
    async () => {
      const unused = await invite(ids.owner, project);
      await rejected(
        () =>
          asUser(ids.other, (c) =>
            c.query("select * from public.redeem_project_invitation($1)", [
              storedHash(unused.token),
            ]),
          ),
        "P0001",
      );
      assert.equal(
        (
          await db.query(
            "select consumed_at from private.project_invitations where token_hash=decode($1,'hex')",
            [storedHash(unused.token)],
          )
        ).rows[0].consumed_at,
        null,
      );
    },
  );
  await check(
    "expired invitations reject new users; existing members still enter without consuming",
    async () => {
      const expired = await invite(ids.owner, project);
      await db.query(
        "with timing as materialized (select clock_timestamp()-interval '2 days' issued) update private.project_invitations set created_at=timing.issued, expires_at=timing.issued + interval '24 hours' from timing where token_hash=decode($1,'hex')",
        [storedHash(expired.token)],
      );
      await rejected(() => redeem(ids.other, expired.token), "P0001");
      assert.equal(await redeem(ids.member, expired.token), project);
      assert.equal(
        (
          await db.query(
            "select consumed_at from private.project_invitations where token_hash=decode($1,'hex')",
            [storedHash(expired.token)],
          )
        ).rows[0].consumed_at,
        null,
      );
    },
  );
  async function assertWaiting(pid) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const row = (
        await db.query(
          "select wait_event_type from pg_stat_activity where pid=$1",
          [pid],
        )
      ).rows[0];
      if (row?.wait_event_type === "Lock") return;
      await delay(25);
    }
    throw new Error(
      "Second PostgreSQL session did not wait on the invitation/membership lock",
    );
  }
  async function race(rollbackFirst) {
    const targetProject = await createProject(
      ids.owner,
      rollbackFirst ? "Rollback race" : "Concurrent race",
    );
    const link = await invite(ids.owner, targetProject);
    const first = await beginAs(ids.racer1);
    const second = await beginAs(ids.racer2);
    const pid = (await second.query("select pg_backend_pid() pid")).rows[0].pid;
    await first.query("select * from public.redeem_project_invitation($1)", [
      sha(link.token),
    ]);
    const pending = second
      .query("select * from public.redeem_project_invitation($1)", [
        sha(link.token),
      ])
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await assertWaiting(pid);
    await first.query(rollbackFirst ? "rollback" : "commit");
    const result = await pending;
    if (rollbackFirst) {
      assert.equal(result.value.rows[0].project_id, targetProject);
      await second.query("commit");
    } else {
      assert.equal(result.error.code, "P0001");
      await second.query("rollback");
    }
    const members = (
      await db.query(
        "select user_id from public.project_members where project_id=$1 and role='member'",
        [targetProject],
      )
    ).rows;
    assert.equal(members.length, 1);
    assert.equal(members[0].user_id, rollbackFirst ? ids.racer2 : ids.racer1);
    await first.end();
    await second.end();
    connections.delete(first);
    connections.delete(second);
  }
  await check(
    "expiry during a membership lock wait rolls back the new membership and consumption",
    async () => {
      const targetProject = await createProject(
        ids.owner,
        "Expiry while waiting",
      );
      const link = await invite(ids.owner, targetProject);
      const holder = await connection();
      await holder.query("begin");
      await holder.query(
        "insert into public.project_members(project_id,user_id,role) values ($1,$2,'member')",
        [targetProject, ids.racer1],
      );
      await db.query(
        "with timing as materialized (select clock_timestamp()-interval '24 hours'+interval '1 second' issued) update private.project_invitations set created_at=timing.issued, expires_at=timing.issued+interval '24 hours' from timing where token_hash=decode($1,'hex')",
        [storedHash(link.token)],
      );
      const waiter = await beginAs(ids.racer1);
      const pid = (await waiter.query("select pg_backend_pid() pid")).rows[0]
        .pid;
      const pending = waiter
        .query("select * from public.redeem_project_invitation($1)", [
          sha(link.token),
        ])
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      await assertWaiting(pid);
      await delay(1100);
      await holder.query("rollback");
      assert.equal((await pending).error.code, "P0001");
      await waiter.query("rollback");
      assert.equal(
        (
          await db.query(
            "select 1 from public.project_members where project_id=$1 and user_id=$2",
            [targetProject, ids.racer1],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select consumed_at from private.project_invitations where token_hash=decode($1,'hex')",
            [storedHash(link.token)],
          )
        ).rows[0].consumed_at,
        null,
      );
      await holder.end();
      await waiter.end();
      connections.delete(holder);
      connections.delete(waiter);
    },
  );
  await check(
    "real concurrent sessions: first commit allows only one new member",
    () => race(false),
  );
  await check(
    "real concurrent sessions: first rollback leaves invitation usable by the waiter",
    () => race(true),
  );
  await check(
    "same user concurrently redeems two invitations without consuming the second seat",
    async () => {
      const targetProject = await createProject(
        ids.owner,
        "Same user two invites",
      );
      const link1 = await invite(ids.owner, targetProject);
      const link2 = await invite(ids.owner, targetProject);
      const first = await beginAs(ids.racer1);
      const second = await beginAs(ids.racer1);
      const pid = (await second.query("select pg_backend_pid() pid")).rows[0]
        .pid;
      await first.query("select * from public.redeem_project_invitation($1)", [
        sha(link1.token),
      ]);
      const pending = second.query(
        "select * from public.redeem_project_invitation($1)",
        [sha(link2.token)],
      );
      await assertWaiting(pid);
      await first.query("commit");
      assert.equal((await pending).rows[0].project_id, targetProject);
      await second.query("commit");
      assert.equal(
        (
          await db.query(
            "select consumed_at from private.project_invitations where token_hash=decode($1,'hex')",
            [storedHash(link2.token)],
          )
        ).rows[0].consumed_at,
        null,
      );
      await first.end();
      await second.end();
      connections.delete(first);
      connections.delete(second);
    },
  );
  console.log(
    `Database invitation checks: ${passed} passed; local fixtures only, no remote writes.`,
  );
} catch (error) {
  // Do not print queries, RPC arguments, rows or token-bearing objects.
  console.error(`FAIL ${currentCheck}: ${error.code ?? error.name}`);
  process.exitCode = 1;
} finally {
  for (const client of connections) {
    await client.end().catch(() => {});
  }
  await cluster.stop().catch(() => {});
  // Only remove the exact fresh mkdtemp directory under the OS temp folder.
  const safeDirectory = resolve(directory);
  assert.equal(dirname(safeDirectory), resolve(tmpdir()));
  assert.ok(
    safeDirectory.startsWith(join(resolve(tmpdir()), "kanban-invite-check-")),
  );
  await rm(safeDirectory, { recursive: true, force: true });
}
