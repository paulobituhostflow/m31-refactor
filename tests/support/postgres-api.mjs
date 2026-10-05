// Test transport only: real PGlite SQL; Auth HTTP is a fixture, not Supabase Auth validation.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export async function postgresApi() {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$ SELECT NULL::uuid $$;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);CREATE PUBLICATION supabase_realtime;",
  );
  for (const name of (await readdir("supabase/migrations")).sort())
    await pg.exec(
      (await readFile("supabase/migrations/" + name, "utf8")).replace(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "",
      ),
    );
  const users = new Map();
  const files = new Map();
  const identifier = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(value))
      throw new Error("Unsafe test identifier");
    return '"' + value + '"';
  };
  async function transport(input, init = {}) {
    const request = input instanceof Request ? input : new Request(input, init),
      url = new URL(request.url);
    if (url.origin !== "http://127.0.0.1:54321")
      throw new Error("External requests prohibited in API tests");
    const method = request.method;
    if (url.pathname === "/auth/v1/user") {
      const token = request.headers.get("Authorization")?.slice(7),
        user = users.get(token);
      return Response.json(user || { msg: "invalid token" }, {
        status: user ? 200 : 401,
      });
    }
    try {
      if (url.pathname.startsWith("/storage/v1/object/")) {
        const path = url.pathname.replace("/storage/v1/object/", "");
        if (method === "POST") {
          files.set(path, new Uint8Array(await request.arrayBuffer()));
          return Response.json({ Key: path });
        }
        if (files.has(path)) return new Response(files.get(path));
        return Response.json({ error: "not found" }, { status: 404 });
      }
      const body =
        method === "GET" || method === "HEAD"
          ? null
          : await request.json().catch(() => null);
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1);
        const args = Object.entries(body || {});
        const sql = `SELECT ${identifier(name)}(${args.map(([key], i) => `${identifier(key)}=>$${i + 1}`).join(",")}) AS result`;
        const result = await pg.query(
          sql,
          args.map(([, value]) =>
            value && typeof value === "object" ? JSON.stringify(value) : value,
          ),
        );
        return Response.json(result.rows[0]?.result ?? null);
      }
      const table = url.pathname.split("/").at(-1);
      if (!table.startsWith("m31_")) throw new Error("Unsafe test table");
      const values = [];
      const conditions = [];
      for (const [key, value] of url.searchParams) {
        if (["select", "order", "limit", "offset", "on_conflict"].includes(key))
          continue;
        const index = value.indexOf("."),
          op = value.slice(0, index),
          raw = value.slice(index + 1);
        if (op === "in") {
          values.push(
            raw
              .slice(1, -1)
              .split(",")
              .map((item) => item.replace(/^"|"$/g, "")),
          );
          conditions.push(`${identifier(key)}=ANY($${values.length}::text[])`);
        } else if (op === "is") {
          conditions.push(
            `${identifier(key)} IS ${raw === "null" ? "NULL" : raw === "true" ? "TRUE" : "FALSE"}`,
          );
        } else {
          values.push(raw);
          conditions.push(
            `${identifier(key)}${{ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op] || "="}$${values.length}`,
          );
        }
      }
      const where = conditions.length
        ? " WHERE " + conditions.join(" AND ")
        : "";
      let rows = [];
      if (method === "GET" || method === "HEAD") {
        let sql = `SELECT * FROM ${identifier(table)}${where}`;
        const order = url.searchParams.get("order");
        if (order)
          sql +=
            " ORDER BY " +
            order
              .split(",")
              .map((item) => {
                const [field, direction] = item.split(".");
                return (
                  identifier(field) + (direction === "desc" ? " DESC" : " ASC")
                );
              })
              .join(",");
        if (url.searchParams.has("limit"))
          sql += " LIMIT " + Number(url.searchParams.get("limit"));
        if (url.searchParams.has("offset"))
          sql += " OFFSET " + Number(url.searchParams.get("offset"));
        rows = (await pg.query(sql, values)).rows;
      } else if (method === "POST") {
        for (const item of Array.isArray(body) ? body : [body]) {
          const entries = Object.entries(item),
            columns = entries.map(([key]) => identifier(key));
          let sql = `INSERT INTO ${identifier(table)}(${columns.join(",")}) VALUES(${entries.map((_, i) => "$" + (i + 1)).join(",")})`;
          const conflict = url.searchParams.get("on_conflict") || "id";
          const prefer = request.headers.get("Prefer") || "";
          if (prefer.includes("resolution=ignore-duplicates"))
            sql += ` ON CONFLICT(${identifier(conflict)}) DO NOTHING`;
          else if (prefer.includes("resolution=merge-duplicates"))
            sql +=
              ` ON CONFLICT(${conflict.split(",").map(identifier).join(",")}) DO UPDATE SET ` +
              entries
                .filter(([key]) => !conflict.split(",").includes(key))
                .map(
                  ([key]) => `${identifier(key)}=EXCLUDED.${identifier(key)}`,
                )
                .join(",");
          sql += " RETURNING *";
          rows.push(
            ...(
              await pg.query(
                sql,
                entries.map(([, value]) =>
                  value && typeof value === "object"
                    ? JSON.stringify(value)
                    : value,
                ),
              )
            ).rows,
          );
        }
      } else if (method === "PATCH") {
        const entries = Object.entries(body);
        const setters = entries.map(([key, value]) => {
          values.push(
            value && typeof value === "object" ? JSON.stringify(value) : value,
          );
          return identifier(key) + "=$" + values.length;
        });
        rows = (
          await pg.query(
            `UPDATE ${identifier(table)} SET ${setters.join(",")}${where} RETURNING *`,
            values,
          )
        ).rows;
      } else if (method === "DELETE")
        rows = (
          await pg.query(
            `DELETE FROM ${identifier(table)}${where} RETURNING *`,
            values,
          )
        ).rows;
      return Response.json(rows);
    } catch (error) {
      return Response.json(
        { code: error.code || "TEST_TRANSPORT", message: error.message },
        { status: 400 },
      );
    }
  }
  return { pg, users, files, transport };
}
